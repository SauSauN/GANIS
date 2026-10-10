//! Stockage des données propres à chaque projet.
//!
//! Chaque projet possède sa base SQLite dans le dossier de données de
//! l'application : `<données>/projets/<id>/project.db`, chiffrée avec la
//! clé du projet (SQLCipher).
//!
//! Ce module est le seul à ouvrir ces bases. Il garantit :
//!
//! - qu'un projet n'est ouvert que par son propriétaire, connecté (sa clé
//!   de compte est nécessaire pour ouvrir la clé du projet) ;
//! - qu'une seule connexion (pool) existe par projet, partagée entre les
//!   commandes, même lorsque plusieurs arrivent en même temps ;
//! - qu'une base disparue est signalée par une erreur claire, au lieu
//!   d'être recréée vide en silence ;
//! - qu'un projet d'avant le chiffrement est chiffré au premier passage de
//!   son propriétaire, sans risque de perte si l'application s'arrête en
//!   plein milieu.

use crate::db::project_db::{self, export_encrypted, init_project_db, open_db, DB_FILE};
use crate::error::{AppError, AppResult};
use crate::models::project::Project;
use crate::security::crypto::SecretKey;
use crate::services::project_service;
use crate::state::AppState;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Sous-dossier du dossier de données qui contient les projets.
const PROJECTS_DIR: &str = "projets";

/// Copie chiffrée en cours de préparation, à côté de `project.db`.
///
/// Si elle existe au démarrage, un chiffrement a été interrompu : voir
/// [`finish_interrupted_encryption`].
const ENCRYPTING_FILE: &str = "project.db.encrypting";

/// Ancien emplacement (dossier temporaire du système), utilisé avant
/// que les bases soient rangées dans le dossier de données.
const LEGACY_DIR: &str = "ganis_projects";

/// Dossier d'un projet.
///
/// L'identifiant doit être un UUID : cela interdit toute tentative de
/// sortir du dossier des projets (`..`, séparateurs, etc.).
pub fn project_dir(state: &AppState, project_id: &str) -> AppResult<PathBuf> {
    let id = Uuid::parse_str(project_id)
        .map_err(|_| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;

    Ok(state
        .data_dir
        .join(PROJECTS_DIR)
        .join(id.hyphenated().to_string()))
}

/// Ancien dossier temporaire d'un projet (identifiant déjà validé).
fn legacy_dir(project_id: &str) -> PathBuf {
    std::env::temp_dir().join(LEGACY_DIR).join(project_id)
}

fn not_found() -> AppError {
    AppError::not_found("Projet non trouvé ou non autorisé.").with_key("project.notFound")
}

// ----------------------------------------------------------------------------
// Indicateur « base créée » (colonne `projects.db_ready`)
// ----------------------------------------------------------------------------

async fn is_db_ready(state: &AppState, project_id: &str) -> AppResult<bool> {
    let value: Option<i64> =
        sqlx::query_scalar("SELECT db_ready FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(&state.app_db)
            .await
            .map_err(|e| {
                AppError::database(&e)
                    .with_detail(format!("Lecture de db_ready impossible : {e}"))
            })?;

    Ok(value.unwrap_or(0) != 0)
}

async fn mark_db_ready(state: &AppState, project_id: &str) -> AppResult<()> {
    sqlx::query("UPDATE projects SET db_ready = 1 WHERE id = ?")
        .bind(project_id)
        .execute(&state.app_db)
        .await
        .map_err(|e| {
            AppError::database(&e)
                .with_detail(format!("Écriture de db_ready impossible : {e}"))
        })?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Fichiers
// ----------------------------------------------------------------------------

/// Remplace le contenu d'un fichier par des zéros avant sa suppression.
///
/// Sert aux anciennes bases en clair : leur contenu n'est pas seulement
/// détaché du système de fichiers, il est écrasé. Protection « au mieux » :
/// sur un SSD, le contrôleur peut garder d'anciennes copies des blocs.
fn overwrite_with_zeros(path: &Path) {
    use std::io::Write;

    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };

    let result = std::fs::OpenOptions::new().write(true).open(path).and_then(|mut file| {
        let zeros = vec![0u8; 64 * 1024];
        let mut remaining = metadata.len();

        while remaining > 0 {
            let chunk = remaining.min(zeros.len() as u64) as usize;
            file.write_all(&zeros[..chunk])?;
            remaining -= chunk as u64;
        }

        file.sync_all()
    });

    if let Err(e) = result {
        tracing::warn!(error = %e, "Ancienne base en clair non écrasée");
    }
}

/// Supprime une base et ses fichiers annexes (journal WAL, mémoire partagée).
///
/// Avec `wipe`, le contenu est d'abord écrasé (base en clair).
fn remove_db_files(db_path: &Path, wipe: bool) -> AppResult<()> {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let path = PathBuf::from(format!("{}{suffix}", db_path.display()));

        if wipe {
            overwrite_with_zeros(&path);
        }

        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(AppError::io(&e)
                    .with_detail(format!("Suppression d'un fichier de base impossible : {e}")))
            }
        }
    }

    Ok(())
}

/// Remplace `project.db` (en clair) par la copie chiffrée prête à côté.
fn swap_in_encrypted_copy(dir: &Path) -> AppResult<()> {
    remove_db_files(&dir.join(DB_FILE), true)?;

    std::fs::rename(dir.join(ENCRYPTING_FILE), dir.join(DB_FILE)).map_err(|e| {
        AppError::io(&e).with_detail(format!("Mise en place de la base chiffrée impossible : {e}"))
    })
}

/// Termine ou annule un chiffrement interrompu (application fermée ou
/// arrêtée pendant l'opération).
///
/// L'ordre des étapes du chiffrement (voir [`encrypt_legacy_project`])
/// permet de savoir où il s'est arrêté :
/// - la clé du projet est enregistrée : la copie chiffrée est complète, il
///   ne restait qu'à la mettre en place ;
/// - sinon : la copie est peut-être incomplète, elle est jetée et la base
///   d'origine reste utilisée.
fn finish_interrupted_encryption(dir: &Path, key_saved: bool) -> AppResult<()> {
    if !dir.join(ENCRYPTING_FILE).exists() {
        return Ok(());
    }

    if key_saved {
        tracing::warn!("Chiffrement d'un projet interrompu : achèvement");
        swap_in_encrypted_copy(dir)
    } else {
        tracing::warn!("Chiffrement d'un projet interrompu : copie incomplète supprimée");
        remove_db_files(&dir.join(ENCRYPTING_FILE), false)
    }
}

// ----------------------------------------------------------------------------
// Ouverture
// ----------------------------------------------------------------------------

/// Retourne la connexion à la base d'un projet, après avoir vérifié que
/// le projet appartient à l'utilisateur connecté.
///
/// Un projet inexistant ou appartenant à quelqu'un d'autre donne la même
/// erreur `NotFound`, pour ne pas révéler l'existence de projets tiers.
pub async fn pool_for_user(
    state: &AppState,
    project_id: &str,
    owner_id: &str,
) -> AppResult<SqlitePool> {
    let account_key = state.require_account_key().await?;

    // 1. Propriété du projet.
    let project = project_service::find_stored(&state.app_db, project_id, owner_id)
        .await?
        .ok_or_else(not_found)?;

    // 2. Une seule ouverture à la fois : le verrou protège à la fois le
    //    cache et l'ouverture (chiffrement, création, migrations). Deux
    //    commandes simultanées sur un même projet ne se disputent donc
    //    plus la base.
    let mut pools = state.project_pools.lock().await;

    if let Some(pool) = pools.get(&project.id) {
        return Ok(pool.clone());
    }

    // 3. Projet d'avant le chiffrement : chiffré maintenant.
    let project = if project.wrapped_key.is_none() {
        encrypt_legacy_project(state, &project.id, owner_id, &account_key).await?;

        project_service::find_stored(&state.app_db, project_id, owner_id)
            .await?
            .ok_or_else(not_found)?
    } else {
        project
    };

    let pool = open_storage(state, &project, &account_key).await?;

    pools.insert(project.id.clone(), pool.clone());

    Ok(pool)
}

/// Ouvre (ou crée) la base chiffrée d'un projet absente du cache.
async fn open_storage(
    state: &AppState,
    project: &Project,
    account_key: &SecretKey,
) -> AppResult<SqlitePool> {
    let wrapped = project
        .wrapped_key
        .as_deref()
        .ok_or_else(|| AppError::internal("Projet sans clé"))?;

    let project_key = project_service::unwrap_project_key(account_key, &project.id, wrapped)?;
    let dir = project_dir(state, &project.id)?;

    finish_interrupted_encryption(&dir, true)?;

    // Cas normal : la base existe.
    if dir.join(DB_FILE).exists() {
        let pool = init_project_db(&dir, &project_key).await?;
        mark_db_ready(state, &project.id).await?;

        return Ok(pool);
    }

    // La base avait été créée mais le fichier a disparu : on le signale
    // plutôt que de repartir d'une base vide qui masquerait la perte.
    if is_db_ready(state, &project.id).await? {
        return Err(AppError::not_found(
            "Les données de ce projet sont introuvables.",
        ).with_key("project.dataMissing")
        .with_detail("project.db absent alors que db_ready = 1"));
    }

    // Projet dont la base n'avait jamais été créée.
    let pool = init_project_db(&dir, &project_key).await?;
    mark_db_ready(state, &project.id).await?;

    Ok(pool)
}

// ----------------------------------------------------------------------------
// Chiffrement des projets d'avant le chiffrement
// ----------------------------------------------------------------------------

/// Chiffre un projet créé avant le chiffrement : sa base, son nom et sa
/// description.
///
/// Étapes, dans cet ordre (voir [`finish_interrupted_encryption`]) :
/// 1. copie chiffrée de la base en clair vers `project.db.encrypting` ;
/// 2. enregistrement de la clé du projet et des champs chiffrés, en une
///    seule requête ;
/// 3. remplacement de la base en clair par la copie chiffrée.
///
/// À aucun moment les données n'existent seulement sous une forme
/// incomplète.
///
/// L'appelant doit tenir le verrou `project_pools` : aucune ouverture du
/// projet ne peut avoir lieu pendant l'opération.
async fn encrypt_legacy_project(
    state: &AppState,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
) -> AppResult<()> {
    // Relu sous le verrou : le projet a peut-être été chiffré entre-temps.
    let project = project_service::find_stored(&state.app_db, project_id, owner_id)
        .await?
        .ok_or_else(not_found)?;

    if project.wrapped_key.is_some() {
        return Ok(());
    }

    let dir = project_dir(state, &project.id)?;

    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::io(&e).with_detail(format!("Impossible de créer le dossier du projet : {e}"))
    })?;

    // Reste d'une tentative précédente interrompue avant l'étape 2.
    finish_interrupted_encryption(&dir, false)?;

    // Base en clair à chiffrer : dans le dossier du projet, ou encore dans
    // l'ancien dossier temporaire du système.
    let current = dir.join(DB_FILE);
    let legacy = legacy_dir(&project.id).join(DB_FILE);

    let source = if current.exists() {
        Some(current)
    } else if legacy.exists() {
        Some(legacy.clone())
    } else {
        None
    };

    let project_key = SecretKey::generate();

    // Étape 1 : copie chiffrée.
    if let Some(source) = &source {
        if !project_db::is_plaintext_sqlite(source) {
            return Err(AppError::internal(
                "Base de projet ni en clair ni rattachée à une clé",
            ));
        }

        let plain = open_db(source, None).await?;
        let exported = export_encrypted(&plain, &dir.join(ENCRYPTING_FILE), &project_key).await;
        plain.close().await;

        if let Err(error) = exported {
            let _ = remove_db_files(&dir.join(ENCRYPTING_FILE), false);
            return Err(error);
        }
    }

    // Étape 2 : clé du projet et champs chiffrés.
    let revealed = project_service::reveal(project.clone(), account_key)?;
    let sealed = project_service::seal_text(
        account_key,
        &project.id,
        &revealed.name,
        &revealed.description,
    )?;
    let wrapped_key = project_service::wrap_project_key(account_key, &project.id, &project_key)?;

    let result = sqlx::query(
        r#"
        UPDATE projects
        SET name = '', description = '',
            name_sealed = ?, description_sealed = ?, wrapped_key = ?
        WHERE id = ? AND wrapped_key IS NULL
        "#,
    )
    .bind(&sealed.name)
    .bind(&sealed.description)
    .bind(&wrapped_key)
    .bind(&project.id)
    .execute(&state.app_db)
    .await
    .map_err(|e| AppError::database(&e).with_detail(format!("Enregistrement de la clé du projet : {e}")))?;

    if result.rows_affected() == 0 {
        // Déjà chiffré entre-temps : la copie préparée ne sert pas.
        let _ = remove_db_files(&dir.join(ENCRYPTING_FILE), false);
        return Ok(());
    }

    // Étape 3 : la base chiffrée remplace la base en clair.
    if let Some(source) = &source {
        swap_in_encrypted_copy(&dir)?;

        if *source == legacy {
            let _ = remove_db_files(&legacy, true);

            if let Some(legacy_parent) = legacy.parent() {
                if let Err(e) = std::fs::remove_dir_all(legacy_parent) {
                    tracing::warn!(error = %e, "Ancien dossier temporaire du projet non supprimé");
                }
            }
        }

        mark_db_ready(state, &project.id).await?;
    }

    tracing::info!("Projet chiffré");

    Ok(())
}

/// Chiffre tous les projets d'avant le chiffrement d'un utilisateur.
///
/// Appelé à la connexion. Un échec est journalisé sans bloquer : le projet
/// sera chiffré à sa prochaine ouverture.
pub async fn encrypt_legacy_projects(state: &AppState, owner_id: &str, account_key: &SecretKey) {
    let projects = match project_service::list_stored_for_user(&state.app_db, owner_id).await {
        Ok(projects) => projects,
        Err(error) => {
            tracing::error!(error = %error, "Liste des projets à chiffrer impossible");
            return;
        }
    };

    for project in projects.iter().filter(|p| p.wrapped_key.is_none()) {
        // Même verrou que l'ouverture : pas de chiffrement pendant qu'une
        // commande ouvre ce projet.
        let _pools = state.project_pools.lock().await;

        if let Err(error) = encrypt_legacy_project(state, &project.id, owner_id, account_key).await {
            tracing::error!(
                error = %error,
                detail = error.detail().unwrap_or_default(),
                "Chiffrement d'un projet reporté"
            );
        }
    }
}

// ----------------------------------------------------------------------------
// Création, duplication, suppression
// ----------------------------------------------------------------------------

/// Crée le stockage chiffré d'un nouveau projet (dossier et base migrée).
///
/// En cas d'échec, rien ne reste sur le disque : l'appelant doit alors
/// annuler la création du projet.
pub async fn create_storage(
    state: &AppState,
    project_id: &str,
    project_key: &SecretKey,
) -> AppResult<()> {
    let dir = project_dir(state, project_id)?;

    let mut pools = state.project_pools.lock().await;

    let created = async {
        let pool = init_project_db(&dir, project_key).await?;
        mark_db_ready(state, project_id).await?;

        Ok::<SqlitePool, AppError>(pool)
    }
    .await;

    match created {
        Ok(pool) => {
            pools.insert(project_id.to_string(), pool);

            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_dir_all(&dir);

            Err(error)
        }
    }
}

/// Duplique la base d'un projet vers un projet déjà créé (`target_id`),
/// chiffrée avec la clé de la copie.
///
/// En cas d'échec, le dossier de la copie est supprimé : l'appelant doit
/// alors annuler la création du projet copié.
pub async fn duplicate_storage(
    state: &AppState,
    source_id: &str,
    target_id: &str,
    owner_id: &str,
    target_key: &SecretKey,
) -> AppResult<()> {
    let source_pool = pool_for_user(state, source_id, owner_id).await?;

    let dir = project_dir(state, target_id)?;

    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::io(&e).with_detail(format!(
            "Impossible de créer le dossier du projet : {e}"
        ))
    })?;

    let copied = async {
        export_encrypted(&source_pool, &dir.join(DB_FILE), target_key).await?;

        let pool = init_project_db(&dir, target_key).await?;
        mark_db_ready(state, target_id).await?;

        Ok::<SqlitePool, AppError>(pool)
    }
    .await;

    match copied {
        Ok(pool) => {
            state
                .project_pools
                .lock()
                .await
                .insert(target_id.to_string(), pool);

            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_dir_all(&dir);

            Err(error)
        }
    }
}

/// Supprime le stockage d'un projet : ferme sa connexion puis efface
/// son dossier (et un éventuel reste de l'ancien dossier temporaire).
///
/// Cette fonction n'échoue jamais : le projet est déjà supprimé de la base
/// de l'application, un fichier impossible à effacer est seulement journalisé.
pub async fn delete_storage(state: &AppState, project_id: &str) {
    let cached = state.project_pools.lock().await.remove(project_id);

    if let Some(pool) = cached {
        pool.close().await;
    }

    let Ok(dir) = project_dir(state, project_id) else {
        return;
    };

    for path in [dir, legacy_dir(project_id)] {
        match std::fs::remove_dir_all(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Dossier de projet impossible à supprimer"
                );
            }
        }
    }
}
