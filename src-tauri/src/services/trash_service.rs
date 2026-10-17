//! Corbeille du projet.
//!
//! Avant une suppression, le service qui supprime appelle [`Snapshot`] pour
//! copier les lignes qui vont disparaître :
//! - la ligne de l'élément ;
//! - celles qui disparaissent avec lui par les clés étrangères
//!   (`ON DELETE CASCADE` : images, relations, liens, sous-éléments…),
//!   trouvées automatiquement dans le schéma ;
//! - les colonnes vidées par `ON DELETE SET NULL` (dossier d'une note…) ;
//! - les modifications faites à la main par le service (lieux contenus
//!   rattachés au parent, champ « Origine » remplacé par un nom…).
//!
//! La copie est enregistrée dans la table `trash` (JSON). La restauration
//! réinsère les lignes dans l'ordre (parents d'abord) puis défait les
//! modifications, seulement là où personne n'a changé la valeur entre-temps.
//! Une ligne qui ne peut plus être réinsérée (par exemple parce qu'un autre
//! élément auquel elle était liée a été supprimé depuis) est ignorée ;
//! l'élément lui-même doit, lui, pouvoir revenir.

use std::collections::{BTreeMap, HashSet};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteArguments, SqliteConnection, SqliteRow};
use sqlx::query::Query;
use sqlx::{Row, Sqlite, SqlitePool};

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};

/// Durée de conservation dans la corbeille.
const KEEP_DAYS: i64 = 30;

// ----------------------------------------------------------------------------
// Valeurs et copie
// ----------------------------------------------------------------------------

/// Valeur SQLite copiée (type réel de la valeur, pas celui déclaré).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", content = "v", rename_all = "lowercase")]
pub enum Val {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    /// Contenu binaire (images), en base64.
    Blob(String),
}

impl Val {
    pub fn text(value: impl Into<String>) -> Self {
        Val::Text(value.into())
    }

    fn opt_text(value: Option<String>) -> Self {
        value.map(Val::Text).unwrap_or(Val::Null)
    }
}

pub(crate) fn bind<'q>(query: Query<'q, Sqlite, SqliteArguments<'q>>, value: &Val) -> AppResult<Query<'q, Sqlite, SqliteArguments<'q>>> {
    Ok(match value {
        Val::Null => query.bind(None::<String>),
        Val::Integer(v) => query.bind(*v),
        Val::Real(v) => query.bind(*v),
        Val::Text(v) => query.bind(v.clone()),
        Val::Blob(v) => query.bind(
            BASE64
                .decode(v)
                .map_err(|_| AppError::internal("Corbeille : image illisible"))?,
        ),
    })
}

pub(crate) fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Ligne copiée.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RowCopy {
    table: String,
    columns: Vec<String>,
    values: Vec<Val>,
}

/// Modification à défaire à la restauration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Undo {
    /// Remet des colonnes à leur ancienne valeur, si `expect` est toujours vrai.
    Update {
        table: String,
        keys: Vec<(String, Val)>,
        set: Vec<(String, Val)>,
        expect: Vec<(String, Val)>,
    },
    /// Remet une clé d'un champ JSON, si sa valeur actuelle est `expect`
    /// (`Null` : la clé est absente).
    JsonSet {
        table: String,
        keys: Vec<(String, Val)>,
        column: String,
        path: String,
        value: Val,
        expect: Val,
    },
}

/// Tout ce qu'il faut pour remettre un élément supprimé.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Snapshot {
    rows: Vec<RowCopy>,
    undo: Vec<Undo>,
    #[serde(skip)]
    seen: HashSet<String>,
}

/// Clé étrangère : `child.from` → `parent.to`.
struct ForeignKey {
    child: String,
    from: Vec<String>,
    to: Vec<String>,
    on_delete: String,
}

pub(crate) async fn table_columns(conn: &mut SqliteConnection, table: &str) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT name FROM pragma_table_info(?) ORDER BY cid")
        .bind(table)
        .fetch_all(&mut *conn)
        .await?)
}

async fn primary_key(conn: &mut SqliteConnection, table: &str) -> AppResult<Vec<String>> {
    let keys: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk")
        .bind(table)
        .fetch_all(&mut *conn)
        .await?;
    if keys.is_empty() {
        return Err(AppError::internal(format!("Corbeille : la table {table} n'a pas de clé primaire")));
    }
    Ok(keys)
}

/// Clés étrangères qui pointent vers `parent`.
async fn references_to(conn: &mut SqliteConnection, parent: &str) -> AppResult<Vec<ForeignKey>> {
    let rows: Vec<(String, i64, String, Option<String>, String)> = sqlx::query_as(
        "SELECT m.name, f.id, f.\"from\", f.\"to\", f.on_delete \
         FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f \
         WHERE m.type = 'table' AND f.\"table\" = ? ORDER BY m.name, f.id, f.seq",
    )
    .bind(parent)
    .fetch_all(&mut *conn)
    .await?;

    let mut grouped: BTreeMap<(String, i64), ForeignKey> = BTreeMap::new();
    let parent_key = primary_key(conn, parent).await?;

    for (child, id, from, to, on_delete) in rows {
        let entry = grouped.entry((child.clone(), id)).or_insert_with(|| ForeignKey {
            child,
            from: Vec::new(),
            to: Vec::new(),
            on_delete: on_delete.to_ascii_uppercase(),
        });
        let index = entry.from.len();
        entry.from.push(from);
        // Colonne cible absente : clé primaire du parent.
        entry.to.push(to.unwrap_or_else(|| parent_key.get(index).cloned().unwrap_or_default()));
    }

    Ok(grouped.into_values().collect())
}

/// Lit des lignes avec le type réel de chaque valeur.
pub(crate) async fn select_rows(
    conn: &mut SqliteConnection,
    table: &str,
    columns: &[String],
    filter: &[(String, Val)],
) -> AppResult<Vec<Vec<Val>>> {
    let select = columns
        .iter()
        .map(|c| format!("typeof({0}), {0}", quote(c)))
        .collect::<Vec<_>>()
        .join(", ");
    let condition = filter
        .iter()
        .map(|(c, _)| format!("{} IS ?", quote(c)))
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!("SELECT {select} FROM {} WHERE {condition}", quote(table));

    let mut query = sqlx::query(&sql);
    for (_, value) in filter {
        query = bind(query, value)?;
    }
    let rows: Vec<SqliteRow> = query.fetch_all(&mut *conn).await?;

    rows.iter()
        .map(|row| {
            (0..columns.len())
                .map(|i| {
                    let kind: String = row.try_get(i * 2)?;
                    let index = i * 2 + 1;
                    Ok(match kind.as_str() {
                        "integer" => Val::Integer(row.try_get(index)?),
                        "real" => Val::Real(row.try_get(index)?),
                        "text" => Val::Text(row.try_get(index)?),
                        "blob" => Val::Blob(BASE64.encode(row.try_get::<Vec<u8>, _>(index)?)),
                        _ => Val::Null,
                    })
                })
                .collect::<Result<Vec<_>, sqlx::Error>>()
                .map_err(AppError::from)
        })
        .collect()
}

impl Snapshot {
    pub fn new() -> Self {
        Self::default()
    }

    /// Copie les lignes de `table` où `column = value`, et tout ce qui
    /// disparaîtra avec elles par les clés étrangères.
    pub async fn capture(&mut self, conn: &mut SqliteConnection, table: &str, column: &str, value: &str) -> AppResult<()> {
        self.capture_where(conn, table, &[(column.to_owned(), Val::text(value))]).await
    }

    fn capture_where<'a>(
        &'a mut self,
        conn: &'a mut SqliteConnection,
        table: &'a str,
        filter: &'a [(String, Val)],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<()>> + Send + 'a>> {
        Box::pin(async move {
            let columns = table_columns(conn, table).await?;
            let key = primary_key(conn, table).await?;
            let rows = select_rows(conn, table, &columns, filter).await?;
            if rows.is_empty() {
                return Ok(());
            }
            let references = references_to(conn, table).await?;

            for values in rows {
                let value_of = |name: &str| {
                    columns
                        .iter()
                        .position(|c| c == name)
                        .map(|i| values[i].clone())
                        .unwrap_or(Val::Null)
                };

                // Déjà copiée (boucle dans les données) : rien à refaire.
                let identity = format!("{table}:{:?}", key.iter().map(|k| value_of(k)).collect::<Vec<_>>());
                if !self.seen.insert(identity) {
                    continue;
                }

                self.rows.push(RowCopy { table: table.to_owned(), columns: columns.clone(), values: values.clone() });

                for fk in &references {
                    let child_filter: Vec<(String, Val)> = fk
                        .from
                        .iter()
                        .zip(&fk.to)
                        .map(|(from, to)| (from.clone(), value_of(to)))
                        .collect();
                    if child_filter.iter().any(|(_, v)| *v == Val::Null) {
                        continue;
                    }

                    match fk.on_delete.as_str() {
                        "CASCADE" => self.capture_where(conn, &fk.child, &child_filter).await?,
                        "SET NULL" => {
                            let child_key = primary_key(conn, &fk.child).await?;
                            let found = select_rows(conn, &fk.child, &child_key, &child_filter).await?;
                            for child in found {
                                self.undo.push(Undo::Update {
                                    table: fk.child.clone(),
                                    keys: child_key.iter().cloned().zip(child).collect(),
                                    set: child_filter.clone(),
                                    expect: fk.from.iter().map(|c| (c.clone(), Val::Null)).collect(),
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }

            Ok(())
        })
    }

    /// À la restauration : remet `column` à `old` sur les lignes de
    /// `table` d'identifiant `ids`, si elle vaut toujours `new`.
    pub fn restore_column(&mut self, table: &str, ids: &[String], column: &str, old: Option<String>, new: Option<String>) {
        for id in ids {
            self.undo.push(Undo::Update {
                table: table.to_owned(),
                keys: vec![("id".to_owned(), Val::text(id.clone()))],
                set: vec![(column.to_owned(), Val::opt_text(old.clone()))],
                expect: vec![(column.to_owned(), Val::opt_text(new.clone()))],
            });
        }
    }

    /// À la restauration : remet la clé `path` du champ JSON `column` à
    /// `value`, si elle vaut toujours `expect` (`None` : clé absente).
    pub fn restore_json(&mut self, table: &str, id: &str, column: &str, path: &str, value: &str, expect: Option<&str>) {
        self.undo.push(Undo::JsonSet {
            table: table.to_owned(),
            keys: vec![("id".to_owned(), Val::text(id))],
            column: column.to_owned(),
            path: path.to_owned(),
            value: Val::text(value),
            expect: expect.map(Val::text).unwrap_or(Val::Null),
        });
    }

    /// Nombre de lignes copiées (0 : l'élément n'existait pas).
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Range la copie dans la corbeille ; renvoie l'identifiant de l'entrée.
    pub async fn store(self, conn: &mut SqliteConnection, kind: &str, item_id: &str, label: &str) -> AppResult<String> {
        let payload = serde_json::to_string(&self).map_err(|e| AppError::internal(format!("Corbeille : {e}")))?;
        let id = new_id();
        sqlx::query("INSERT INTO trash (id, kind, item_id, label, payload, deleted_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(kind)
            .bind(item_id)
            .bind(label.chars().take(200).collect::<String>())
            .bind(payload)
            .bind(now_utc())
            .execute(&mut *conn)
            .await?;
        Ok(id)
    }
}

// ----------------------------------------------------------------------------
// Corbeille
// ----------------------------------------------------------------------------

/// Entrée de la corbeille (sans son contenu).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub kind: String,
    pub item_id: String,
    pub label: String,
    pub deleted_at: String,
}

fn trash_not_found() -> AppError {
    AppError::not_found("Élément introuvable dans la corbeille.").with_key("trash.notFound")
}

/// Retire les entrées plus vieilles que la durée de conservation.
async fn expire(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM trash WHERE deleted_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)")
        .bind(format!("-{KEEP_DAYS} days"))
        .execute(pool)
        .await?;
    Ok(())
}

/// Contenu de la corbeille, le plus récent d'abord.
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<TrashItem>> {
    expire(pool).await?;
    // Contenus de documents qui ne servent plus (entrées expirées).
    crate::services::document_service::clean_orphans(pool).await?;
    Ok(sqlx::query_as::<_, TrashItem>(
        "SELECT id, kind, item_id, label, deleted_at FROM trash ORDER BY deleted_at DESC, rowid DESC",
    )
    .fetch_all(pool)
    .await?)
}

fn is_constraint_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db) => {
            let message = db.message();
            message.contains("FOREIGN KEY") || message.contains("UNIQUE") || message.contains("constraint")
        }
        _ => false,
    }
}

/// Remet un élément de la corbeille ; renvoie l'entrée restaurée.
pub async fn restore(pool: &SqlitePool, id: &str) -> AppResult<TrashItem> {
    let mut tx = pool.begin().await?;

    let row: Option<(String, String, String, String, String)> =
        sqlx::query_as("SELECT kind, item_id, label, deleted_at, payload FROM trash WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some((kind, item_id, label, deleted_at, payload)) = row else {
        return Err(trash_not_found());
    };

    let snapshot: Snapshot = serde_json::from_str(&payload)
        .map_err(|_| AppError::internal("Corbeille : contenu illisible").with_key("trash.unreadable"))?;

    for (index, copy) in snapshot.rows.iter().enumerate() {
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING",
            quote(&copy.table),
            copy.columns.iter().map(|c| quote(c)).collect::<Vec<_>>().join(", "),
            vec!["?"; copy.columns.len()].join(", "),
        );
        let mut query = sqlx::query(&sql);
        for value in &copy.values {
            query = bind(query, value)?;
        }

        match query.execute(&mut *tx).await {
            Ok(_) => {}
            // L'élément lui-même doit revenir ; ce qui dépendait d'un autre
            // élément supprimé depuis est abandonné.
            Err(e) if index > 0 && is_constraint_error(&e) => {}
            Err(e) if is_constraint_error(&e) => {
                return Err(AppError::conflict("Restauration impossible : l'élément qui le contenait a été supprimé.")
                    .with_key("trash.restoreBlocked")
                    .with_detail(e));
            }
            Err(e) => return Err(e.into()),
        }
    }

    for undo in &snapshot.undo {
        let (sql, values): (String, Vec<&Val>) = match undo {
            Undo::Update { table, keys, set, expect } => {
                let sets = set.iter().map(|(c, _)| format!("{} = ?", quote(c))).collect::<Vec<_>>().join(", ");
                let conditions = keys
                    .iter()
                    .chain(expect.iter())
                    .map(|(c, _)| format!("{} IS ?", quote(c)))
                    .collect::<Vec<_>>()
                    .join(" AND ");
                let values = set.iter().chain(keys.iter()).chain(expect.iter()).map(|(_, v)| v).collect();
                (format!("UPDATE {} SET {sets} WHERE {conditions}", quote(table)), values)
            }
            Undo::JsonSet { table, keys, column, path, value, expect } => {
                let conditions = keys.iter().map(|(c, _)| format!("{} IS ?", quote(c))).collect::<Vec<_>>().join(" AND ");
                let col = quote(column);
                let mut values: Vec<&Val> = vec![value];
                values.extend(keys.iter().map(|(_, v)| v));
                (
                    format!(
                        "UPDATE {} SET {col} = json_set({col}, '{path}', ?) WHERE {conditions} \
                         AND json_valid({col}) AND json_extract({col}, '{path}') IS ?",
                        quote(table),
                        path = path.replace('\'', "''"),
                    ),
                    {
                        values.push(expect);
                        values
                    },
                )
            }
        };

        let mut query = sqlx::query(&sql);
        for value in values {
            query = bind(query, value)?;
        }
        match query.execute(&mut *tx).await {
            Ok(_) => {}
            Err(e) if is_constraint_error(&e) => {}
            Err(e) => return Err(e.into()),
        }
    }

    sqlx::query("DELETE FROM trash WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;

    Ok(TrashItem { id: id.to_owned(), kind, item_id, label, deleted_at })
}

/// Supprime définitivement une entrée de la corbeille.
pub async fn purge(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM trash WHERE id = ?").bind(id).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(trash_not_found());
    }
    crate::services::document_service::clean_orphans(pool).await
}

/// Vide la corbeille.
pub async fn empty(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM trash").execute(pool).await?;
    crate::services::document_service::clean_orphans(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::{character_service, location_service, note_service, structure_service};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn exec(pool: &SqlitePool, sql: &str) {
        sqlx::query(sql).execute(pool).await.unwrap();
    }

    async fn count(pool: &SqlitePool, sql: &str) -> i64 {
        sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
    }

    #[tokio::test]
    async fn character_comes_back_with_images_relations_and_links() {
        let pool = pool().await;
        for (id, name) in [("c1", "Aldric"), ("c2", "Mira")] {
            sqlx::query(
                "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
                 VALUES (?, ?, '', 'main', 'alive', '{}', 'x', 'x')",
            )
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .unwrap();
        }
        exec(&pool, "INSERT INTO character_portraits (character_id, mime, data, updated_at) VALUES ('c1', 'image/png', x'89504e47', 'x')").await;
        exec(&pool, "INSERT INTO character_relations (id, source_id, target_id, type, created_at, updated_at) VALUES ('r1', 'c1', 'c2', 'friend', 'x', 'x')").await;
        exec(&pool, "INSERT INTO locations (id, name, type, parent_id, status, fields, created_at, updated_at) VALUES ('l1', 'Valona', 'city', NULL, 'existing', '{\"ruler\":\"c1\"}', 'x', 'x')").await;

        let trash_id = character_service::delete_character(&pool, "c1").await.unwrap();
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM characters").await, 1);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM character_relations").await, 0);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM locations WHERE json_extract(fields, '$.ruler') IS NULL").await, 1);

        let items = list(&pool).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "character");
        assert_eq!(items[0].label, "Aldric");

        let restored = restore(&pool, &trash_id).await.unwrap();
        assert_eq!(restored.item_id, "c1");
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM characters").await, 2);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM character_relations").await, 1);
        assert_eq!(count(&pool, "SELECT length(data) FROM character_portraits").await, 4);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM locations WHERE json_extract(fields, '$.ruler') = 'c1'").await, 1);
        assert!(list(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn location_children_return_under_it_unless_moved_since() {
        let pool = pool().await;
        for (id, parent) in [("a", None), ("b", Some("a")), ("c", Some("b")), ("d", Some("b"))] {
            sqlx::query(
                "INSERT INTO locations (id, name, type, parent_id, status, fields, created_at, updated_at) \
                 VALUES (?, ?, 'city', ?, 'existing', '{}', 'x', 'x')",
            )
            .bind(id)
            .bind(id.to_uppercase())
            .bind(parent)
            .execute(&pool)
            .await
            .unwrap();
        }

        let trash_id = location_service::delete_location(&pool, "b").await.unwrap();
        // Déplacé ailleurs entre-temps : il y reste.
        exec(&pool, "UPDATE locations SET parent_id = NULL WHERE id = 'd'").await;

        restore(&pool, &trash_id).await.unwrap();
        let parent = |id: &'static str| {
            let pool = pool.clone();
            async move {
                sqlx::query_scalar::<_, Option<String>>("SELECT parent_id FROM locations WHERE id = ?")
                    .bind(id)
                    .fetch_one(&pool)
                    .await
                    .unwrap()
            }
        };
        assert_eq!(parent("b").await.as_deref(), Some("a"));
        assert_eq!(parent("c").await.as_deref(), Some("b"));
        assert_eq!(parent("d").await, None);
    }

    #[tokio::test]
    async fn structure_subtree_and_note_folders_are_restored() {
        let pool = pool().await;
        let novel = crate::models::project::ProjectType::Novel;
        let part = structure_service::create_node(&pool, novel, None, 0, "Partie", None).await.unwrap();
        let chapter = structure_service::create_node(&pool, novel, Some(&part.id), 1, "Chapitre", None).await.unwrap();
        structure_service::create_node(&pool, novel, Some(&chapter.id), 2, "Scène", None).await.unwrap();

        let trash_id = structure_service::delete_node(&pool, &part.id).await.unwrap();
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM structure_nodes").await, 0);
        restore(&pool, &trash_id).await.unwrap();
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM structure_nodes").await, 3);

        let folder = note_service::create_folder(&pool, None, "Recherches").await.unwrap();
        let sub = note_service::create_folder(&pool, Some(&folder.id), "Époque").await.unwrap();
        let note = note_service::create_note(&pool, Some(&sub.id), "Armes").await.unwrap();

        let trash_id = note_service::delete_folder(&pool, &folder.id).await.unwrap();
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM notes WHERE folder_id IS NULL").await, 1);
        restore(&pool, &trash_id).await.unwrap();
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM note_folders").await, 2);
        assert_eq!(note_service::get_note(&pool, &note.id).await.unwrap().folder_id.as_deref(), Some(sub.id.as_str()));

        // Une note supprimée puis restaurée garde son contenu.
        let trash_id = note_service::delete_note(&pool, &note.id).await.unwrap();
        restore(&pool, &trash_id).await.unwrap();
        assert_eq!(note_service::get_note(&pool, &note.id).await.unwrap().title, "Armes");
    }

    #[tokio::test]
    async fn purge_empty_and_missing_entries() {
        let pool = pool().await;
        let sticky = note_service::create_sticky(&pool, "pink", 1.5, 2.0).await.unwrap();
        let trash_id = note_service::delete_sticky(&pool, &sticky.id).await.unwrap();
        purge(&pool, &trash_id).await.unwrap();
        assert!(restore(&pool, &trash_id).await.is_err());
        assert!(purge(&pool, &trash_id).await.is_err());

        let sticky = note_service::create_sticky(&pool, "blue", 0.0, 0.0).await.unwrap();
        note_service::delete_sticky(&pool, &sticky.id).await.unwrap();
        exec(&pool, "UPDATE trash SET deleted_at = '2000-01-01T00:00:00Z'").await;
        assert!(list(&pool).await.unwrap().is_empty());

        let sticky = note_service::create_sticky(&pool, "blue", 0.0, 0.0).await.unwrap();
        note_service::delete_sticky(&pool, &sticky.id).await.unwrap();
        empty(&pool).await.unwrap();
        assert!(list(&pool).await.unwrap().is_empty());
    }
}
