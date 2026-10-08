//! Stockage des données propres à chaque projet.
//!
//! Chaque projet possède sa base SQLite dans le dossier de données de
//! l'application : `<données>/projets/<id>/project.db`.
//!
//! Ce module est le seul à ouvrir ces bases. Il garantit :
//!
//! - qu'un projet n'est ouvert que par son propriétaire ;
//! - qu'une seule connexion (pool) existe par projet, partagée entre les
//!   commandes, même lorsque plusieurs arrivent en même temps ;
//! - qu'une base disparue est signalée par une erreur claire, au lieu
//!   d'être recréée vide en silence.

use crate::db::project_db::init_project_db;
use crate::error::{AppError, AppResult};
use crate::services::project_service;
use crate::state::AppState;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Sous-dossier du dossier de données qui contient les projets.
const PROJECTS_DIR: &str = "projets";

/// Nom du fichier de base de données d'un projet.
const DB_FILE: &str = "project.db";

/// Ancien emplacement (dossier temporaire du système), utilisé avant
/// que les bases soient rangées dans le dossier de données.
const LEGACY_DIR: &str = "ganis_projects";

/// Dossier d'un projet.
///
/// L'identifiant doit être un UUID : cela interdit toute tentative de
/// sortir du dossier des projets (`..`, séparateurs, etc.).
pub fn project_dir(state: &AppState, project_id: &str) -> AppResult<PathBuf> {
    let id = Uuid::parse_str(project_id)
        .map_err(|_| AppError::not_found("Projet non trouvé."))?;

    Ok(state
        .data_dir
        .join(PROJECTS_DIR)
        .join(id.hyphenated().to_string()))
}

/// Ancien dossier temporaire d'un projet (identifiant déjà validé).
fn legacy_dir(project_id: &str) -> PathBuf {
    std::env::temp_dir().join(LEGACY_DIR).join(project_id)
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
// Copie cohérente d'une base
// ----------------------------------------------------------------------------

/// Copie une base vers un nouveau fichier avec `VACUUM INTO`.
///
/// Contrairement à une copie du fichier, cette méthode inclut les écritures
/// encore présentes dans le journal WAL.
async fn vacuum_into(pool: &SqlitePool, target: &Path) -> AppResult<()> {
    if target.exists() {
        return Err(AppError::internal("Le fichier de destination existe déjà"));
    }

    sqlx::query("VACUUM INTO ?")
        .bind(target.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::database(&e)
                .with_detail(format!("Copie de la base impossible : {e}"))
        })?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Ouverture
// ----------------------------------------------------------------------------

/// Retourne la connexion à la base d'un projet, après avoir vérifié que
/// le projet appartient à l'utilisateur.
///
/// Un projet inexistant ou appartenant à quelqu'un d'autre donne la même
/// erreur `NotFound`, pour ne pas révéler l'existence de projets tiers.
pub async fn pool_for_user(
    state: &AppState,
    project_id: &str,
    owner_id: &str,
) -> AppResult<SqlitePool> {
    // 1. Propriété du projet.
    let project =
        project_service::find_by_id_for_user(&state.app_db, project_id, owner_id)
            .await?
            .ok_or_else(|| {
                AppError::not_found("Projet non trouvé ou non autorisé.")
            })?;

    // 2. Une seule ouverture à la fois : le verrou protège à la fois le
    //    cache et l'ouverture (création, migrations). Deux commandes
    //    simultanées sur un même projet ne se disputent donc plus la base.
    let mut pools = state.project_pools.lock().await;

    if let Some(pool) = pools.get(&project.id) {
        return Ok(pool.clone());
    }

    let pool = open_storage(state, &project.id).await?;

    pools.insert(project.id.clone(), pool.clone());

    Ok(pool)
}

/// Ouvre (ou crée) la base d'un projet absente du cache.
async fn open_storage(
    state: &AppState,
    project_id: &str,
) -> AppResult<SqlitePool> {
    let dir = project_dir(state, project_id)?;

    // Cas normal : la base existe.
    if dir.join(DB_FILE).exists() {
        let pool = init_project_db(&dir).await?;
        mark_db_ready(state, project_id).await?;

        return Ok(pool);
    }

    // La base avait été créée mais le fichier a disparu : on le signale
    // plutôt que de repartir d'une base vide qui masquerait la perte.
    if is_db_ready(state, project_id).await? {
        return Err(AppError::not_found(
            "Les données de ce projet sont introuvables.",
        )
        .with_detail("project.db absent alors que db_ready = 1"));
    }

    // Projet antérieur à ce stockage : on récupère sa base de l'ancien
    // dossier temporaire si elle existe encore, sinon on en crée une.
    let legacy = legacy_dir(project_id);

    let pool = if legacy.join(DB_FILE).exists() {
        migrate_legacy(&legacy, &dir).await?
    } else {
        init_project_db(&dir).await?
    };

    mark_db_ready(state, project_id).await?;

    Ok(pool)
}

/// Récupère une base de l'ancien dossier temporaire.
///
/// La base est copiée avec `VACUUM INTO` (journal WAL inclus). L'ancien
/// dossier n'est supprimé qu'une fois la copie réussie.
async fn migrate_legacy(legacy: &Path, dir: &Path) -> AppResult<SqlitePool> {
    let legacy_pool = init_project_db(legacy).await?;

    std::fs::create_dir_all(dir).map_err(|e| {
        AppError::io(&e).with_detail(format!(
            "Impossible de créer le dossier du projet : {e}"
        ))
    })?;

    let target = dir.join(DB_FILE);

    if let Err(error) = vacuum_into(&legacy_pool, &target).await {
        let _ = std::fs::remove_file(&target);
        legacy_pool.close().await;

        return Err(error);
    }

    legacy_pool.close().await;

    if let Err(e) = std::fs::remove_dir_all(legacy) {
        tracing::warn!(
            error = %e,
            "Ancien dossier temporaire du projet non supprimé"
        );
    }

    init_project_db(dir).await
}

// ----------------------------------------------------------------------------
// Création, duplication, suppression
// ----------------------------------------------------------------------------

/// Crée le stockage d'un nouveau projet (dossier et base migrée).
///
/// En cas d'échec, rien ne reste sur le disque : l'appelant doit alors
/// annuler la création du projet.
pub async fn create_storage(
    state: &AppState,
    project_id: &str,
) -> AppResult<()> {
    let dir = project_dir(state, project_id)?;

    let mut pools = state.project_pools.lock().await;

    let created = async {
        let pool = init_project_db(&dir).await?;
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

/// Duplique la base d'un projet vers un projet déjà créé (`target_id`).
///
/// En cas d'échec, le dossier de la copie est supprimé : l'appelant doit
/// alors annuler la création du projet copié.
pub async fn duplicate_storage(
    state: &AppState,
    source_id: &str,
    target_id: &str,
    owner_id: &str,
) -> AppResult<()> {
    let source_pool = pool_for_user(state, source_id, owner_id).await?;

    let dir = project_dir(state, target_id)?;

    std::fs::create_dir_all(&dir).map_err(|e| {
        AppError::io(&e).with_detail(format!(
            "Impossible de créer le dossier du projet : {e}"
        ))
    })?;

    let copied = async {
        vacuum_into(&source_pool, &dir.join(DB_FILE)).await?;

        let pool = init_project_db(&dir).await?;
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