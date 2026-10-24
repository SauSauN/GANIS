//! Import : zone d'attente, aperçu, installation (§24.2).

use super::*;

// ----------------------------------------------------------------------------
// Import : zone d'attente, aperçu, installation
// ----------------------------------------------------------------------------

/// Aperçu montré avant d'importer (étape 5).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub staging_id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub status: String,
    pub exported_at: String,
    pub created_with: String,
    pub counts: Counts,
    pub size_bytes: u64,
    /// L'utilisateur a déjà ce projet : il sera importé comme copie.
    pub already_owned: bool,
}

pub(super) fn staging_root(data_dir: &Path) -> PathBuf {
    data_dir.join(STAGING_DIR)
}

/// Dossier de travail d'un export.
pub fn work_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(WORK_DIR).join(new_id())
}

pub(super) fn staging_dir(data_dir: &Path, staging_id: &str) -> AppResult<PathBuf> {
    let id = uuid::Uuid::parse_str(staging_id)
        .map_err(|_| ganix_error("ganix.stagingMissing", "Cet import n'est plus disponible.", "identifiant invalide"))?;
    Ok(staging_root(data_dir).join(id.hyphenated().to_string()))
}

/// Supprime les zones d'attente et dossiers de travail laissés par un arrêt
/// brutal (§24.5). Appelé au démarrage.
pub fn clean_leftovers(data_dir: &Path) {
    clean_interrupted_replacements(&data_dir.join(project_storage::PROJECTS_DIR));

    for dir in [staging_root(data_dir), data_dir.join(WORK_DIR)] {
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => tracing::info!("Zone d'attente orpheline supprimée"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => tracing::warn!(error = %e, "Zone d'attente non supprimée"),
        }
    }
}

/// Étapes 1 à 9 : contrôle le fichier et l'extrait dans une zone d'attente
/// propre à l'utilisateur. Rien n'est encore ajouté à son compte.
#[cfg(test)]
pub async fn stage_import(
    data_dir: &Path,
    app_db: &SqlitePool,
    owner_id: &str,
    source: &Path,
) -> AppResult<ImportPreview> {
    stage_import_reporting(data_dir, app_db, owner_id, source, &no_progress).await
}

/// Comme `stage_import`, en signalant l'avancement à `report`.
pub async fn stage_import_reporting(
    data_dir: &Path,
    app_db: &SqlitePool,
    owner_id: &str,
    source: &Path,
    report: Reporter<'_>,
) -> AppResult<ImportPreview> {
    let staging_id = new_id();
    let dir = staging_dir(data_dir, &staging_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| io_error("Zone d'attente", e))?;

    let result = stage_import_inner(&dir, app_db, owner_id, source, &staging_id, report).await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&dir);
    }

    result
}

/// Étapes 2 à 11, sans rien rattacher au compte : contrôle de l'archive,
/// extraction, images, reconstruction de la base dans `dir`.
#[cfg(test)]
pub(super) async fn stage_files(dir: &Path, source: &Path) -> AppResult<(Manifest, Counts)> {
    stage_files_reporting(dir, source, &no_progress).await
}

pub(super) async fn stage_files_reporting(dir: &Path, source: &Path, report: Reporter<'_>) -> AppResult<(Manifest, Counts)> {
    let mut archive = open_archive(source)?;
    let index = read_index(&mut archive)?;

    // 6-7. Extraction avec plafond de taille, puis empreinte.
    let data_path = dir.join(DATA);
    extract_entry(&mut archive, DATA, &data_path, &index.checksums.files[DATA])?;

    // 8. Images : empreinte (= nom) et type réel d'après les premiers octets.
    let assets_dir = dir.join(STAGED_ASSETS);
    std::fs::create_dir_all(&assets_dir).map_err(|e| io_error("Zone d'attente", e))?;
    let mut assets = BTreeMap::new();
    let files = index
        .checksums
        .files
        .keys()
        .filter(|name| parse_asset_name(name).is_some())
        .count() as u64;
    report(Progress { stage: Stage::Files, done: 0, total: files });

    for (name, hash) in &index.checksums.files {
        let Some((_, extension)) = parse_asset_name(name) else {
            continue;
        };

        let path = assets_dir.join(format!("{hash}.{extension}"));
        extract_entry(&mut archive, name, &path, hash)?;

        let mut head = [0u8; 16];
        let read = File::open(&path)
            .and_then(|mut f| f.read(&mut head))
            .map_err(|e| io_error("Image en attente", e))?;
        // Fichier « bin » (document) : contenu libre, mais jamais une image
        // déguisée (les images ont leur propre extension).
        let real = image_extension(&head[..read]);
        if (extension == "bin" && real.is_some()) || (extension != "bin" && real != Some(extension)) {
            return Err(unsafe_archive(format!("ASSET_TYPE_INVALID : {name}")));
        }

        assets.insert(name.clone(), path);
        report(Progress { stage: Stage::Files, done: assets.len() as u64, total: files });
    }

    // 9-11. Base reconstruite par GANIS à partir des données XML.
    let counts = build_database(dir, &index.manifest, &assets, report).await?;

    // Les fichiers extraits ne servent plus : seule la base reconstruite reste.
    let _ = std::fs::remove_file(&data_path);
    let _ = std::fs::remove_dir_all(&assets_dir);

    Ok((index.manifest, counts))
}

pub(super) async fn stage_import_inner(
    dir: &Path,
    app_db: &SqlitePool,
    owner_id: &str,
    source: &Path,
    staging_id: &str,
    report: Reporter<'_>,
) -> AppResult<ImportPreview> {
    let size_bytes = std::fs::metadata(source).map_err(unreadable)?.len();
    let (manifest, counts) = stage_files_reporting(dir, source, report).await?;

    // Zone d'attente rattachée à l'utilisateur (personne d'autre ne peut la confirmer).
    std::fs::write(dir.join("owner"), owner_id).map_err(|e| io_error("Zone d'attente", e))?;
    std::fs::write(dir.join(STAGED_MANIFEST), serde_json::to_vec(&manifest)?)
        .map_err(|e| io_error("Zone d'attente", e))?;

    let already_owned = project_service::find_stored(app_db, &manifest.project.id, owner_id)
        .await?
        .is_some();

    let project = &manifest.project;

    Ok(ImportPreview {
        staging_id: staging_id.to_owned(),
        name: project.name.clone(),
        description: project.description.clone(),
        kind: ProjectType::from_str(&project.kind).as_str().to_owned(),
        status: ProjectStatus::from_str(&project.status).as_str().to_owned(),
        exported_at: manifest.export.exported_at.clone(),
        created_with: manifest.created_with.clone(),
        counts,
        size_bytes,
        already_owned,
    })
}

/// Extrait une entrée de l'archive (taille plafonnée à celle annoncée) et
/// vérifie son empreinte.
pub(super) fn extract_entry(
    archive: &mut zip::ZipArchive<BufReader<File>>,
    name: &str,
    target: &Path,
    expected: &str,
) -> AppResult<()> {
    let entry = archive.by_name(name).map_err(|e| damaged(format!("EXTRACT_FAILED : {name} : {e}")))?;
    let declared = entry.size();
    let mut out = BufWriter::new(File::create(target).map_err(|e| io_error("EXTRACT_FAILED", e))?);
    let copied = std::io::copy(&mut entry.take(declared.saturating_add(1)), &mut out)
        .map_err(|e| io_error("EXTRACT_FAILED", e))?;
    out.flush().map_err(|e| io_error("EXTRACT_FAILED", e))?;
    drop(out);

    if copied != declared {
        return Err(damaged(format!("EXTRACT_FAILED : taille inattendue : {name}")));
    }
    if sha256_file(target)? != expected {
        return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
    }

    Ok(())
}

/// Abandonne un import (aucune trace).
pub fn cancel_import(data_dir: &Path, staging_id: &str) -> AppResult<()> {
    let dir = staging_dir(data_dir, staging_id)?;
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_error("Suppression de la zone d'attente", e)),
    }
}

/// Choix de l'utilisateur quand il possède déjà le projet du fichier
/// (§24.3). Sans conflit, l'import est direct quel que soit le choix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    /// Nouveau projet, nom suffixé « (importé) » (par défaut).
    #[default]
    Copy,
    /// Le projet existant est remplacé, après une sauvegarde automatique en
    /// `.ganix`.
    Replace,
}

/// Résultat d'un import.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub project: Project,
    /// Remplacement : nom du fichier de sauvegarde de l'ancien projet
    /// (dans le dossier des sauvegardes de GANIS).
    pub backup_file: Option<String>,
}

/// Dossier des sauvegardes automatiques (remplacement à l'import).
pub(super) const BACKUP_DIR: &str = "sauvegardes";
/// Suffixes des dossiers de projet pendant un remplacement.
pub(super) const INCOMING_SUFFIX: &str = ".import";
pub(super) const REPLACED_SUFFIX: &str = ".replaced";

pub fn backup_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKUP_DIR)
}

pub(super) fn sibling(dir: &Path, suffix: &str) -> PathBuf {
    let mut name = dir.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    dir.with_file_name(name)
}

/// Remet en ordre les dossiers de projet laissés par un remplacement
/// interrompu : l'ancien dossier est restauré si le nouveau n'a pas été mis
/// en place, et les copies inachevées sont supprimées.
pub(super) fn clean_interrupted_replacements(projects_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(projects_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.ends_with(INCOMING_SUFFIX) {
            let _ = std::fs::remove_dir_all(&path);
        } else if let Some(id) = name.strip_suffix(REPLACED_SUFFIX) {
            let current = projects_dir.join(id);
            if current.exists() {
                let _ = std::fs::remove_dir_all(&path);
            } else if std::fs::rename(&path, &current).is_ok() {
                tracing::warn!("Remplacement interrompu : ancien projet restauré");
            }
        }
    }
}

/// Étapes 10 à 14 : installe le projet en attente pour l'utilisateur.
///
/// Conflits (§24.3) :
/// - identifiant libre : import direct, identifiant du fichier gardé ;
/// - projet déjà chez l'utilisateur, `Copy` : nouvel identifiant, nom
///   suffixé « (importé) » ;
/// - projet déjà chez l'utilisateur, `Replace` : sauvegarde `.ganix` de
///   l'ancien, puis ses données sont remplacées (même identifiant) ;
/// - identifiant pris par un autre compte : copie avec un nouvel
///   identifiant (les projets des autres comptes restent invisibles).
///
/// La base reçue est rechiffrée avec la clé du projet, mise à jour par les
/// migrations et contrôlée une dernière fois. En cas d'échec, tout est
/// annulé.
pub async fn confirm_import(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    staging_id: &str,
    mode: ImportMode,
) -> AppResult<ImportOutcome> {
    let dir = staging_dir(&state.data_dir, staging_id)?;
    let missing = || ganix_error("ganix.stagingMissing", "Cet import n'est plus disponible.", "zone d'attente absente");

    let owner = std::fs::read_to_string(dir.join("owner")).map_err(|_| missing())?;
    if owner != owner_id {
        return Err(missing());
    }

    let manifest: Manifest = serde_json::from_slice(&std::fs::read(dir.join(STAGED_MANIFEST)).map_err(|_| missing())?)
        .map_err(|_| missing())?;

    // 12. Conflits d'identifiant.
    let info = &manifest.project;
    let id_valid = uuid::Uuid::parse_str(&info.id).is_ok();
    let taken = !id_valid || project_service::id_exists(&state.app_db, &info.id).await?;
    let owned = id_valid && project_service::find_stored(&state.app_db, &info.id, owner_id).await?.is_some();

    let outcome = if owned && mode == ImportMode::Replace {
        replace_project(state, owner_id, account_key, &dir, &manifest).await?
    } else {
        ImportOutcome {
            project: import_as_new(state, owner_id, account_key, &dir, &manifest, taken, owned).await?,
            backup_file: None,
        }
    };

    // 14. Nettoyage et journal (sans chemin ni contenu).
    let _ = std::fs::remove_dir_all(&dir);
    tracing::info!(
        schema = manifest.schema_version,
        replaced = outcome.backup_file.is_some(),
        "Projet importé depuis un .ganix"
    );

    Ok(outcome)
}

/// Nouveau projet pour l'utilisateur, avec une nouvelle clé.
pub(super) async fn import_as_new(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    dir: &Path,
    manifest: &Manifest,
    taken: bool,
    owned: bool,
) -> AppResult<Project> {
    let info = &manifest.project;

    let name = if owned {
        let max = project_service::MAX_PROJECT_NAME_CHARS - project_service::IMPORT_SUFFIX.chars().count();
        format!("{}{}", info.name.trim().chars().take(max).collect::<String>(), project_service::IMPORT_SUFFIX)
    } else {
        info.name.chars().take(project_service::MAX_PROJECT_NAME_CHARS).collect()
    };

    let (project, project_key) = project_service::create_imported_project(
        &state.app_db,
        owner_id,
        account_key,
        (!taken).then_some(info.id.as_str()),
        &name,
        &info.description,
        ProjectType::from_str(&info.kind),
        ProjectStatus::from_str(&info.status),
    )
    .await?;

    // 10, 11, 13. Rechiffrement, migrations, contrôle final, mise en place.
    let target_dir = project_storage::project_dir(state, &project.id)?;

    let installed = async {
        let pool = prepare_database(&dir.join(STAGED_DB), &target_dir, &project_key).await?;
        project_storage::mark_db_ready(state, &project.id).await?;
        state.project_pools.lock().await.insert(project.id.clone(), pool);
        AppResult::Ok(())
    }
    .await;

    if let Err(error) = installed {
        let _ = project_service::delete_project(&state.app_db, &project.id, owner_id).await;
        project_storage::delete_storage(state, &project.id).await;
        return Err(error);
    }

    Ok(project)
}

/// Remplace les données d'un projet de l'utilisateur par celles du fichier.
///
/// 1. sauvegarde `.ganix` de l'ancien projet (obligatoire) ;
/// 2. base reçue rechiffrée avec la clé du projet existant dans un dossier
///    voisin, migrée et contrôlée ;
/// 3. échange des dossiers, puis mise à jour du nom, de la description, du
///    type et du statut. En cas d'échec, l'ancien dossier est remis.
pub(super) async fn replace_project(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    staged: &Path,
    manifest: &Manifest,
) -> AppResult<ImportOutcome> {
    let info = &manifest.project;

    let existing = project_service::find_by_id_for_user(&state.app_db, &info.id, owner_id, account_key)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;

    // 1. Sauvegarde de l'ancien projet.
    let backups = backup_dir(&state.data_dir);
    std::fs::create_dir_all(&backups).map_err(|e| io_error("Dossier des sauvegardes", e))?;

    let stem = suggested_file_name(&existing.name);
    let stem = stem.trim_end_matches(".ganix");
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_name = format!("{stem} - avant import {stamp}.ganix");

    let pool = project_storage::pool_for_user(state, &existing.id, owner_id).await?;
    write_ganix(&pool, &existing, &backups.join(&backup_name), &work_dir(&state.data_dir)).await?;

    // 2. Nouvelle base, à côté de l'ancienne.
    let wrapped = existing
        .wrapped_key
        .as_deref()
        .ok_or_else(|| AppError::internal("Projet sans clé"))?;
    let project_key = project_service::unwrap_project_key(account_key, &existing.id, wrapped)?;

    let current = project_storage::project_dir(state, &existing.id)?;
    let incoming = sibling(&current, INCOMING_SUFFIX);
    let replaced = sibling(&current, REPLACED_SUFFIX);
    let _ = std::fs::remove_dir_all(&incoming);
    let _ = std::fs::remove_dir_all(&replaced);

    match prepare_database(&staged.join(STAGED_DB), &incoming, &project_key).await {
        Ok(new_pool) => new_pool.close().await,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&incoming);
            return Err(error);
        }
    }

    // 3. Échange, verrou tenu : aucune ouverture du projet entre-temps.
    let mut pools = state.project_pools.lock().await;
    if let Some(old_pool) = pools.remove(&existing.id) {
        old_pool.close().await;
    }

    let install_failed = |e: std::io::Error| io_error("INSTALL_FAILED", e);

    if let Err(e) = std::fs::rename(&current, &replaced) {
        let _ = std::fs::remove_dir_all(&incoming);
        return Err(install_failed(e));
    }

    if let Err(e) = std::fs::rename(&incoming, &current) {
        let _ = std::fs::rename(&replaced, &current);
        let _ = std::fs::remove_dir_all(&incoming);
        return Err(install_failed(e));
    }

    let updated = project_service::update_project(
        &state.app_db,
        &existing.id,
        owner_id,
        account_key,
        Some(&info.name.chars().take(project_service::MAX_PROJECT_NAME_CHARS).collect::<String>()),
        Some(&info.description),
        Some(ProjectType::from_str(&info.kind)),
        Some(ProjectStatus::from_str(&info.status)),
        None,
        None,
    )
    .await;

    let project = match updated {
        Ok(project) => project,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&current);
            let _ = std::fs::rename(&replaced, &current);
            return Err(error);
        }
    };

    drop(pools);

    if let Err(e) = std::fs::remove_dir_all(&replaced) {
        tracing::warn!(error = %e, "Ancien dossier du projet non supprimé");
    }

    Ok(ImportOutcome {
        project,
        backup_file: Some(backup_name),
    })
}

/// Copie chiffrée de la base reçue dans `target_dir`, mise à jour par les
/// migrations puis contrôle strict du schéma final. Retourne la base ouverte.
pub(super) async fn prepare_database(
    staged_db: &Path,
    target_dir: &Path,
    project_key: &SecretKey,
) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(target_dir).map_err(|e| io_error("INSTALL_FAILED", e))?;

    // Ouverte en écriture : ATTACH hérite des droits de la connexion et doit
    // créer la copie. La base en attente est à nous et sera supprimée.
    let plain = open_plain(staged_db).await?;
    let exported = export_encrypted(&plain, &target_dir.join(DB_FILE), project_key).await;
    plain.close().await;
    exported?;

    let pool = init_project_db(target_dir, project_key).await.map_err(|e| {
        ganix_error(
            "ganix.migrationFailed",
            "Ce projet n'a pas pu être mis à jour pour cette version de GANIS.",
            format!("MIGRATION_FAILED : {e}"),
        )
    })?;

    if let Err(error) = check_schema(&pool).await {
        pool.close().await;
        return Err(error);
    }

    Ok(pool)
}
