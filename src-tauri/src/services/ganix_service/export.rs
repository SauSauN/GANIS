//! Export d'un projet en `.ganix` (§24.1).

use super::*;

// ----------------------------------------------------------------------------
// Export (§24.1)
// ----------------------------------------------------------------------------

/// Résultat de l'écriture de `project.xml`.
pub(super) struct DataExport {
    pub(super) schema_version: i64,
    pub(super) counts: Counts,
    pub(super) tables: u64,
    pub(super) rows: u64,
    /// Nom dans l'archive → fichier de travail.
    pub(super) assets: BTreeMap<String, PathBuf>,
    pub(super) assets_bytes: u64,
}

/// Écrit le `.ganix` d'un projet à `target`. `source` : base du projet
/// (déjà ouverte), `work_dir` : dossier de travail vide, supprimé ensuite.
pub async fn write_ganix(
    source: &SqlitePool,
    project: &Project,
    target: &Path,
    work_dir: &Path,
) -> AppResult<()> {
    write_ganix_reporting(source, project, target, work_dir, &no_progress).await
}

/// Comme `write_ganix`, en signalant l'avancement à `report`.
pub async fn write_ganix_reporting(
    source: &SqlitePool,
    project: &Project,
    target: &Path,
    work_dir: &Path,
    report: Reporter<'_>,
) -> AppResult<()> {
    std::fs::create_dir_all(work_dir).map_err(|e| io_error("Dossier de travail", e))?;

    let result = write_ganix_inner(source, project, target, work_dir, report).await;

    let _ = std::fs::remove_dir_all(work_dir);

    if result.is_err() {
        let _ = std::fs::remove_file(part_path(target));
    }

    result
}

pub(super) fn part_path(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

/// Écrit une valeur de colonne.
pub(super) fn write_value<W: Write>(
    writer: &mut XmlWriter<W>,
    column: &str,
    kind: &str,
    row: &sqlx::sqlite::SqliteRow,
    index: usize,
    work_dir: &Path,
    export: &mut DataExport,
) -> AppResult<()> {
    let db = |e: sqlx::Error| AppError::database(&e).with_detail(format!("Lecture de {column} : {e}"));

    match kind {
        "null" => write_empty_element(writer, column, &[("type", "null")]),
        "integer" => {
            let value: i64 = row.try_get(index).map_err(db)?;
            write_text_element(writer, column, &[("type", "integer")], &value.to_string())
        }
        "real" => {
            let value: f64 = row.try_get(index).map_err(db)?;
            write_text_element(writer, column, &[("type", "real")], &value.to_string())
        }
        "text" => {
            let value: String = row.try_get(index).map_err(db)?;
            if xml_safe(&value) {
                write_text_element(writer, column, &[], &value)
            } else {
                write_text_element(writer, column, &[("type", "text-base64")], &b64().encode(value.as_bytes()))
            }
        }
        "blob" => {
            let value: Vec<u8> = row.try_get(index).map_err(db)?;

            match image_extension(&value) {
                Some(extension) => {
                    let hash = sha256_hex(&value);
                    let name = asset_entry_name(&hash, extension);

                    if !export.assets.contains_key(&name) {
                        let path = work_dir.join(STAGED_ASSETS).join(format!("{hash}.{extension}"));
                        std::fs::write(&path, &value).map_err(|e| io_error("Image", e))?;
                        export.assets_bytes += value.len() as u64;
                        export.assets.insert(name.clone(), path);
                    }

                    write_text_element(writer, column, &[("type", "asset")], &name)
                }
                // Gros contenu (documents du découpage : PDF, Word…) : fichier
                // à part, comme les images, plutôt qu'en base64 dans le XML.
                None if value.len() >= BIN_ASSET_MIN_BYTES => {
                    let hash = sha256_hex(&value);
                    let name = asset_entry_name(&hash, "bin");

                    if !export.assets.contains_key(&name) {
                        let path = work_dir.join(STAGED_ASSETS).join(format!("{hash}.bin"));
                        std::fs::write(&path, &value).map_err(|e| io_error("Document", e))?;
                        export.assets_bytes += value.len() as u64;
                        export.assets.insert(name.clone(), path);
                    }

                    write_text_element(writer, column, &[("type", "asset")], &name)
                }
                None => write_text_element(writer, column, &[("type", "blob")], &b64().encode(&value)),
            }
        }
        other => Err(AppError::internal(format!("Type SQLite inattendu : {other}"))),
    }
}

/// Écrit `project.xml` depuis la base du projet, dans une seule transaction
/// de lecture (instantané cohérent).
pub(super) async fn write_data(
    source: &SqlitePool,
    data_path: &Path,
    work_dir: &Path,
    report: Reporter<'_>,
) -> AppResult<DataExport> {
    std::fs::create_dir_all(work_dir.join(STAGED_ASSETS)).map_err(|e| io_error("Dossier de travail", e))?;

    let mut tx = source.begin().await?;
    let schema_version = schema_version_of(&mut tx).await?;
    let tables = user_tables(&mut tx).await?;

    let mut export = DataExport {
        schema_version,
        counts: counts(&mut tx).await,
        tables: tables.len() as u64,
        rows: 0,
        assets: BTreeMap::new(),
        assets_bytes: 0,
    };

    // Nombre total de lignes, pour la barre de progression.
    let mut total_rows: u64 = 0;
    for table in tables.keys() {
        total_rows += count(&mut tx, table).await.max(0) as u64;
    }
    report(Progress { stage: Stage::Data, done: 0, total: total_rows });

    let file = File::create(data_path).map_err(|e| io_error("Création de project.xml", e))?;
    let mut writer = Writer::new_with_indent(BufWriter::new(file), b' ', 2);
    write_decl(&mut writer)?;

    let schema = schema_version.to_string();
    writer
        .write_event(Event::Start(BytesStart::new("project").with_attributes([("schemaVersion", schema.as_str())])))
        .map_err(xml_error)?;

    for (table, columns) in &tables {
        writer
            .write_event(Event::Start(BytesStart::new("table").with_attributes([("name", table.as_str())])))
            .map_err(xml_error)?;

        if !columns.is_empty() {
            // typeof(col) puis col, pour chaque colonne : le type réel de
            // chaque valeur (SQLite autorise des types mélangés).
            let select = columns
                .iter()
                .map(|c| format!("typeof({0}), {0}", quote_ident(c)))
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!("SELECT {select} FROM {}", quote_ident(table));

            let mut rows = sqlx::query(&sql).fetch(&mut *tx);

            while let Some(row) = rows.try_next().await? {
                writer
                    .write_event(Event::Start(BytesStart::new("row")))
                    .map_err(xml_error)?;

                for (i, column) in columns.iter().enumerate() {
                    let kind: String = row.try_get(2 * i)?;
                    write_value(&mut writer, column, &kind, &row, 2 * i + 1, work_dir, &mut export)?;
                }

                writer
                    .write_event(Event::End(BytesEnd::new("row")))
                    .map_err(xml_error)?;
                export.rows += 1;
                report(Progress { stage: Stage::Data, done: export.rows, total: total_rows.max(export.rows) });
            }
        }

        writer
            .write_event(Event::End(BytesEnd::new("table")))
            .map_err(xml_error)?;
    }

    writer
        .write_event(Event::End(BytesEnd::new("project")))
        .map_err(xml_error)?;

    tx.rollback().await?;

    writer
        .into_inner()
        .into_inner()
        .map_err(|e| io_error("Écriture de project.xml", e))?
        .sync_all()
        .map_err(|e| io_error("Écriture de project.xml", e))?;

    Ok(export)
}

pub(super) async fn write_ganix_inner(
    source: &SqlitePool,
    project: &Project,
    target: &Path,
    work_dir: &Path,
    report: Reporter<'_>,
) -> AppResult<()> {
    // 1-3. Données en XML, images à part.
    let data_path = work_dir.join(DATA);
    let export = write_data(source, &data_path, work_dir, report).await?;

    // 4. Empreintes.
    let data_size = std::fs::metadata(&data_path).map_err(|e| io_error("Taille", e))?.len();
    let mut checksums = Checksums::default();
    checksums.files.insert(DATA.to_owned(), sha256_file(&data_path)?);
    for name in export.assets.keys() {
        let (hash, _) = parse_asset_name(name).ok_or_else(|| AppError::internal("Nom d'image"))?;
        checksums.files.insert(name.clone(), hash.to_owned());
    }

    // 5. Manifeste.
    let manifest = Manifest {
        format: "ganix".to_owned(),
        format_version: FORMAT_VERSION,
        min_app_version: MIN_APP_VERSION.to_owned(),
        created_with: app_version().to_owned(),
        schema_version: export.schema_version,
        export: ExportInfo { id: new_id(), exported_at: now_utc(), kind: "full".to_owned() },
        project: ProjectInfo {
            id: project.id.clone(),
            name: project.name.clone(),
            description: project.description.clone(),
            kind: project.project_type.as_str().to_owned(),
            status: project.status.as_str().to_owned(),
            created_at: project.created_at.clone(),
            updated_at: project.updated_at.clone(),
        },
        author: AuthorInfo::default(),
        content: ContentInfo {
            counts: export.counts.clone(),
            assets: AssetsInfo {
                count: export.assets.len() as u64,
                total_bytes: export.assets_bytes,
            },
            data: DataInfo {
                file: DATA.to_owned(),
                size_bytes: data_size,
                tables: export.tables,
                rows: export.rows,
            },
        },
        encryption: EncryptionInfo { enabled: false },
    };

    // 6. Archive sous un nom temporaire. XML compressé, images stockées
    //    telles quelles (déjà compressées).
    let part = part_path(target);
    {
        let file = File::create(&part).map_err(|e| io_error("Création du fichier", e))?;
        let mut zip = zip::ZipWriter::new(BufWriter::new(file));
        let deflated = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .large_file(data_size > u32::MAX as u64);
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        let zip_err = |e: zip::result::ZipError| io_error("Écriture de l'archive", e);
        let write_err = |e: std::io::Error| io_error("Écriture de l'archive", e);

        zip.start_file(MANIFEST, deflated).map_err(zip_err)?;
        zip.write_all(&manifest_xml(&manifest)?).map_err(write_err)?;

        zip.start_file(CHECKSUMS, deflated).map_err(zip_err)?;
        zip.write_all(&checksums_xml(&checksums)?).map_err(write_err)?;

        zip.start_file(DATA, deflated).map_err(zip_err)?;
        let mut data = BufReader::new(File::open(&data_path).map_err(write_err)?);
        std::io::copy(&mut data, &mut zip).map_err(write_err)?;

        let files = export.assets.len() as u64;
        report(Progress { stage: Stage::Files, done: 0, total: files });

        for (index, (name, path)) in export.assets.iter().enumerate() {
            zip.start_file(name.as_str(), stored).map_err(zip_err)?;
            let mut image = BufReader::new(File::open(path).map_err(write_err)?);
            std::io::copy(&mut image, &mut zip).map_err(write_err)?;
            report(Progress { stage: Stage::Files, done: index as u64 + 1, total: files });
        }

        let writer = zip.finish().map_err(zip_err)?;
        writer
            .into_inner()
            .map_err(|e| io_error("Écriture", e))?
            .sync_all()
            .map_err(write_err)?;
    }

    // 7. Relecture : mêmes contrôles qu'à l'import (niveaux 1 et 2).
    report(Progress { stage: Stage::Verify, done: 0, total: 0 });
    verify_archive(&part)?;

    // 8. Renommage seulement si tout est bon.
    std::fs::rename(&part, target).map_err(|e| io_error("Renommage du fichier", e))?;

    Ok(())
}

