//! Reconstruction de la base depuis `project.xml` et contrôle final du schéma.

use super::*;

// ----------------------------------------------------------------------------
// Reconstruction de la base depuis project.xml (étapes 9 à 11)
// ----------------------------------------------------------------------------

/// Migrations jusqu'à `version` incluse : le schéma de la version du fichier.
pub(super) fn migrator_up_to(version: i64) -> Migrator {
    Migrator {
        migrations: Cow::Owned(
            PROJECT_MIGRATOR
                .iter()
                .filter(|m| m.version <= version)
                .cloned()
                .collect(),
        ),
        ..Migrator::DEFAULT
    }
}

/// Valeur lue dans le XML, prête à être insérée.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum Value {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

/// Où en est la lecture de `project.xml`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Level {
    Document,
    Project,
    Table,
    Row,
    Column,
    Done,
}

pub(super) struct DataReader<'a> {
    pub(super) tables: &'a BTreeMap<String, Vec<String>>,
    /// Images extraites : nom dans l'archive → fichier en attente.
    pub(super) assets: &'a BTreeMap<String, PathBuf>,
    pub(super) schema_version: i64,
    pub(super) level: Level,
    pub(super) table: Option<String>,
    pub(super) row: Vec<(String, Value)>,
    pub(super) column: Option<(String, Option<String>)>,
    pub(super) text: String,
}

impl DataReader<'_> {
    fn unexpected(&self, what: &str) -> AppError {
        damaged(format!("project.xml : {what} inattendu ({:?})", self.level))
    }

    fn start(&mut self, start: &BytesStart<'_>) -> AppResult<()> {
        let name = element_name(start)?;

        match (self.level, name.as_str()) {
            (Level::Document, "project") => {
                let version = attributes_of(start)?
                    .get("schemaVersion")
                    .and_then(|v| v.parse::<i64>().ok());
                if version != Some(self.schema_version) {
                    return Err(damaged("project.xml : version du schéma différente du manifeste"));
                }
                self.level = Level::Project;
            }
            (Level::Project, "table") => {
                let table = attributes_of(start)?
                    .remove("name")
                    .ok_or_else(|| damaged("project.xml : table sans nom"))?;
                if !self.tables.contains_key(&table) {
                    return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : table {table}")));
                }
                self.table = Some(table);
                self.level = Level::Table;
            }
            (Level::Table, "row") => {
                self.row.clear();
                self.level = Level::Row;
            }
            (Level::Row, column) => {
                let table = self.table.as_deref().unwrap_or_default();
                let known = self.tables.get(table).is_some_and(|cols| cols.iter().any(|c| c == column));
                if !known {
                    return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : colonne {table}.{column}")));
                }
                if self.row.iter().any(|(c, _)| c == column) {
                    return Err(damaged(format!("project.xml : colonne {column} en double")));
                }
                let kind = attributes_of(start)?.remove("type");
                self.column = Some((name, kind));
                self.text.clear();
                self.level = Level::Column;
            }
            _ => return Err(self.unexpected(&format!("élément <{name}>"))),
        }

        Ok(())
    }

    /// Fin d'élément. Retourne la ligne complète à insérer, s'il y en a une.
    fn end(&mut self) -> AppResult<Option<(String, Vec<(String, Value)>)>> {
        match self.level {
            Level::Column => {
                let (column, kind) = self.column.take().ok_or_else(|| self.unexpected("fin"))?;
                let value = self.value(&column, kind.as_deref())?;
                self.row.push((column, value));
                self.level = Level::Row;
                Ok(None)
            }
            Level::Row => {
                self.level = Level::Table;
                let table = self.table.clone().ok_or_else(|| self.unexpected("fin"))?;
                Ok(Some((table, std::mem::take(&mut self.row))))
            }
            Level::Table => {
                self.table = None;
                self.level = Level::Project;
                Ok(None)
            }
            Level::Project => {
                self.level = Level::Done;
                Ok(None)
            }
            Level::Document | Level::Done => Err(self.unexpected("fin")),
        }
    }

    fn push_text(&mut self, text: &str) -> AppResult<()> {
        if self.level == Level::Column {
            self.text.push_str(text);
            Ok(())
        } else if text.chars().all(char::is_whitespace) {
            Ok(())
        } else {
            Err(self.unexpected("texte"))
        }
    }

    fn value(&self, column: &str, kind: Option<&str>) -> AppResult<Value> {
        let text = self.text.as_str();
        let invalid = || damaged(format!("project.xml : valeur invalide pour {column}"));

        Ok(match kind {
            None => Value::Text(text.to_owned()),
            Some("null") if text.is_empty() => Value::Null,
            Some("integer") => Value::Integer(text.trim().parse().map_err(|_| invalid())?),
            Some("real") => Value::Real(text.trim().parse().map_err(|_| invalid())?),
            Some("text-base64") => Value::Text(
                String::from_utf8(b64().decode(text.trim()).map_err(|_| invalid())?).map_err(|_| invalid())?,
            ),
            Some("blob") => Value::Blob(b64().decode(text.trim()).map_err(|_| invalid())?),
            Some("asset") => {
                let path = self
                    .assets
                    .get(text.trim())
                    .ok_or_else(|| damaged(format!("FILE_MISSING : image {}", text.trim())))?;
                Value::Blob(std::fs::read(path).map_err(|e| io_error("Image en attente", e))?)
            }
            Some(_) => return Err(invalid()),
        })
    }
}

pub(super) async fn insert_row(conn: &mut SqliteConnection, table: &str, row: Vec<(String, Value)>) -> AppResult<()> {
    if row.is_empty() {
        sqlx::query(&format!("INSERT INTO {} DEFAULT VALUES", quote_ident(table)))
            .execute(&mut *conn)
            .await
            .map_err(|e| damaged(format!("DB_INCONSISTENT : {table} : {e}")))?;
        return Ok(());
    }

    let columns = row.iter().map(|(c, _)| quote_ident(c)).collect::<Vec<_>>().join(", ");
    let marks = vec!["?"; row.len()].join(", ");
    let sql = format!("INSERT INTO {} ({columns}) VALUES ({marks})", quote_ident(table));

    let mut query = sqlx::query(&sql);
    for (_, value) in row {
        query = match value {
            Value::Null => query.bind(None::<String>),
            Value::Integer(v) => query.bind(v),
            Value::Real(v) => query.bind(v),
            Value::Text(v) => query.bind(v),
            Value::Blob(v) => query.bind(v),
        };
    }

    query
        .execute(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_INCONSISTENT : {table} : {e}")))?;

    Ok(())
}

/// Lit `project.xml` et insère ses lignes (base vidée au préalable).
pub(super) async fn load_data(
    conn: &mut SqliteConnection,
    data_path: &Path,
    tables: &BTreeMap<String, Vec<String>>,
    assets: &BTreeMap<String, PathBuf>,
    schema_version: i64,
    total_rows: u64,
    report: Reporter<'_>,
) -> AppResult<()> {
    let file = File::open(data_path).map_err(|e| io_error("project.xml en attente", e))?;
    let mut inserted: u64 = 0;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader_config(&mut reader);

    let mut state = DataReader {
        tables,
        assets,
        schema_version,
        level: Level::Document,
        table: None,
        row: Vec::new(),
        column: None,
        text: String::new(),
    };
    let mut buf = Vec::new();

    loop {
        let pending = {
            let event = reader
                .read_event_into(&mut buf)
                .map_err(|e| damaged(format!("project.xml : XML invalide : {e}")))?;

            match event {
                Event::Decl(_) | Event::Comment(_) => None,
                Event::DocType(_) | Event::PI(_) => {
                    return Err(unsafe_archive("project.xml : DTD ou instruction refusée"));
                }
                Event::Start(start) => {
                    state.start(&start)?;
                    None
                }
                Event::End(_) => state.end()?,
                Event::Text(text) => {
                    state.push_text(&text.xml10_content())?;
                    None
                }
                Event::CData(data) => {
                    state.push_text(&data.xml10_content())?;
                    None
                }
                Event::GeneralRef(reference) => {
                    let text = resolve_reference(&reference)?;
                    state.push_text(&text)?;
                    None
                }
                Event::Empty(_) => unreachable!("expand_empty_elements"),
                Event::Eof => break,
            }
        };
        buf.clear();

        if let Some((table, row)) = pending {
            insert_row(conn, &table, row).await?;
            inserted += 1;
            report(Progress { stage: Stage::Build, done: inserted, total: total_rows.max(inserted) });
        }
    }

    if state.level != Level::Done {
        return Err(damaged("project.xml : document incomplet"));
    }

    Ok(())
}

/// Reconstruit dans la zone d'attente la base décrite par `project.xml` :
/// schéma créé par les migrations de GANIS jusqu'à la version du fichier,
/// tables vidées, lignes insérées, puis intégrité et clés étrangères
/// contrôlées. Retourne les statistiques de l'aperçu.
pub(super) async fn build_database(
    dir: &Path,
    manifest: &Manifest,
    assets: &BTreeMap<String, PathBuf>,
    report: Reporter<'_>,
) -> AppResult<Counts> {
    let pool = open_plain(&dir.join(STAGED_DB)).await?;
    let result = build_database_inner(&pool, dir, manifest, assets, report).await;
    pool.close().await;
    result
}

pub(super) async fn build_database_inner(
    pool: &SqlitePool,
    dir: &Path,
    manifest: &Manifest,
    assets: &BTreeMap<String, PathBuf>,
    report: Reporter<'_>,
) -> AppResult<Counts> {
    run_migrations(pool, &migrator_up_to(manifest.schema_version)).await?;

    let mut tx = pool.begin().await?;
    let tables = user_tables(&mut tx).await?;

    // Les migrations peuvent créer des lignes par défaut : seules comptent
    // celles du fichier.
    for table in tables.keys() {
        sqlx::query(&format!("DELETE FROM {}", quote_ident(table)))
            .execute(&mut *tx)
            .await?;
    }

    let total_rows = manifest.content.data.rows;
    report(Progress { stage: Stage::Build, done: 0, total: total_rows });
    load_data(&mut tx, &dir.join(DATA), &tables, assets, manifest.schema_version, total_rows, report).await?;
    tx.commit().await?;

    let mut conn = pool.acquire().await?;

    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_CORRUPT : {e}")))?;
    if integrity != "ok" {
        return Err(damaged(format!("DB_CORRUPT : {integrity}")));
    }

    let broken: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_INCONSISTENT : {e}")))?;
    if !broken.is_empty() {
        return Err(damaged(format!("DB_INCONSISTENT : {} liens cassés", broken.len())));
    }

    Ok(counts(&mut conn).await)
}

// ----------------------------------------------------------------------------
// Contrôle final du schéma (après les migrations restantes)
// ----------------------------------------------------------------------------

/// Objets (type, nom) du schéma de référence : base neuve, toutes migrations.
pub(super) async fn reference_schema() -> AppResult<BTreeSet<(String, String)>> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await?;
    run_migrations(&pool, &PROJECT_MIGRATOR).await?;
    let objects = schema_objects(&pool).await?;
    pool.close().await;
    Ok(objects)
}

pub(super) async fn schema_objects(pool: &SqlitePool) -> AppResult<BTreeSet<(String, String)>> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().collect())
}

/// Vérifie que le schéma final est exactement celui de cette version.
pub(super) async fn check_schema(pool: &SqlitePool) -> AppResult<()> {
    let reference = reference_schema().await?;

    for (kind, name) in schema_objects(pool).await? {
        if kind == "trigger" || kind == "view" || !reference.contains(&(kind.clone(), name.clone())) {
            return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : {kind} {name}")));
        }
    }

    Ok(())
}

