//! Commandes Tauri liées à la gestion des projets.
//!
//! Deux sortes de projets (voir `project_service`) :
//!
//! - **publics** : créés sans connexion (bouton « Commencer » de l'accueil).
//!   Toute personne qui utilise GANIS sur cet appareil peut les ouvrir ;
//! - **privés** : créés par un compte connecté, chiffrés avec la clé de ce
//!   compte. Seul ce compte, connecté, peut les ouvrir.
//!
//! L'identité vient toujours de l'état Rust (`AppState::viewer`), jamais de
//! l'interface : un invité n'atteint que les projets publics, un compte
//! connecté ses projets privés et les projets publics.
//!
//! Les données de chaque projet (base SQLite chiffrée) sont gérées par
//! `services::project_storage` : créées avec le projet, copiées à la
//! duplication, supprimées avec lui.

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType, ProjectVisibility};
use crate::services::{project_service, project_storage};
use crate::state::{AppState, Viewer};
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub description: String,
    pub project_type: ProjectType,
}

/// Entrée de mise à jour partielle d'un projet.
///
/// Tous les champs sont optionnels : le frontend peut n'envoyer
/// que ceux qu'il souhaite modifier. Les champs absents conservent
/// leur valeur actuelle en base. L'identifiant du projet est passé
/// séparément (`project_id`).
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub project_type: Option<ProjectType>,
    pub status: Option<ProjectStatus>,
    pub is_favorite: Option<bool>,
    pub is_archived: Option<bool>,
}

/// Crée un projet.
///
/// La visibilité est automatique, rien n'est demandé :
/// - sans connexion : projet public ;
/// - connecté : projet privé.
///
/// Elle peut ensuite être changée dans les paramètres du projet
/// (`set_project_visibility`).
///
/// Si le stockage du projet ne peut pas être créé, la création est annulée.
#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    let (project, project_key) = match &viewer {
        Viewer::Account { user_id, key } => {
            project_service::create_project(
                &state.app_db,
                user_id,
                key,
                &input.name,
                &input.description,
                input.project_type,
            )
            .await?
        }
        _ => {
            project_service::create_public_project(
                &state.app_db,
                &input.name,
                &input.description,
                input.project_type,
            )
            .await?
        }
    };

    if let Err(error) =
        project_storage::create_storage(&state, &project.id, &project_key).await
    {
        let _ = project_service::delete_for_viewer(&state.app_db, &project.id, &viewer).await;

        return Err(error);
    }

    Ok(project)
}

/// Liste les projets accessibles : projets publics, et projets privés du
/// compte connecté.
#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> AppResult<Vec<Project>> {
    let viewer = state.viewer().await;

    project_service::list_for_viewer(&state.app_db, &viewer).await
}

/// Récupère un projet accessible.
#[tauri::command]
pub async fn get_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    project_service::find_for_viewer(&state.app_db, &project_id, &viewer)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))
}

/// Ouvre un projet : vérifie que ses données sont accessibles, enregistre
/// la date d'ouverture et retourne le projet.
///
/// Si les données du projet ont disparu, l'ouverture échoue avec une
/// erreur claire.
#[tauri::command]
pub async fn open_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    project_storage::pool_for_viewer(&state, &project_id, &viewer).await?;

    project_service::mark_opened_for_viewer(&state.app_db, &project_id, &viewer).await
}

/// Met à jour un projet accessible.
///
/// Seuls les champs fournis (`Some(...)`) sont modifiés.
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    project_id: String,
    input: UpdateProjectInput,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    project_service::update_for_viewer(
        &state.app_db,
        &project_id,
        &viewer,
        input.name.as_deref(),
        input.description.as_deref(),
        input.project_type,
        input.status,
        input.is_favorite,
        input.is_archived,
    )
    .await
}

/// Rend un projet privé (rattaché au compte connecté, chiffré) ou public
/// (ouvrable sans connexion). Réservé à un compte connecté ; un projet
/// privé ne peut être rendu public que par son propriétaire.
#[tauri::command]
pub async fn set_project_visibility(
    state: State<'_, AppState>,
    project_id: String,
    visibility: ProjectVisibility,
) -> AppResult<Project> {
    let (user, account_key) = state.require_session().await?;

    // Ouvre la base : vérifie l'accès et chiffre au besoin un projet privé
    // d'avant le chiffrement (sa clé doit exister pour être conservée).
    project_storage::pool_for_request(&state, &project_id).await?;

    project_service::set_visibility(&state.app_db, &project_id, &user.id, &account_key, visibility)
        .await
}

/// Duplique un projet accessible, données (synopsis, etc.) comprises. La
/// copie garde la visibilité de l'original.
///
/// Si les données ne peuvent pas être copiées, la copie est annulée.
#[tauri::command]
pub async fn duplicate_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    let (copy, copy_key) =
        project_service::duplicate_for_viewer(&state.app_db, &project_id, &viewer).await?;

    if let Err(error) =
        project_storage::duplicate_storage(&state, &project_id, &copy.id, &viewer, &copy_key).await
    {
        let _ = project_service::delete_for_viewer(&state.app_db, &copy.id, &viewer).await;

        return Err(error);
    }

    Ok(copy)
}

/// Place un projet accessible dans la corbeille.
///
/// Le projet quitte le tableau de bord mais garde ses données : il peut
/// être restauré pendant 30 jours (`restore_project`). Ensuite, ou par
/// « Supprimer définitivement » (`purge_project`), il est effacé.
#[tauri::command]
pub async fn delete_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let viewer = state.viewer().await;

    project_service::trash_for_viewer(&state.app_db, &project_id, &viewer).await?;

    // La base n'est plus ouverte tant que le projet est dans la corbeille.
    project_storage::close_pool(&state, &project_id).await;

    Ok(())
}

/// Projets dans la corbeille accessibles au visiteur.
///
/// Les projets expirés (plus de 30 jours) sont d'abord effacés.
#[tauri::command]
pub async fn list_project_trash(
    state: State<'_, AppState>,
) -> AppResult<Vec<Project>> {
    purge_expired_projects(&state).await;

    let viewer = state.viewer().await;

    project_service::list_trash_for_viewer(&state.app_db, &viewer).await
}

/// Sort un projet de la corbeille.
#[tauri::command]
pub async fn restore_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let viewer = state.viewer().await;

    project_service::restore_for_viewer(&state.app_db, &project_id, &viewer).await
}

/// Supprime définitivement un projet de la corbeille, avec ses données.
#[tauri::command]
pub async fn purge_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let viewer = state.viewer().await;

    project_service::purge_for_viewer(&state.app_db, &project_id, &viewer).await?;

    project_storage::delete_storage(&state, &project_id).await;

    Ok(())
}

/// Efface les projets restés plus de 30 jours dans la corbeille, et leurs
/// dossiers. Appelé au démarrage et à l'ouverture de la corbeille ; une
/// erreur est journalisée sans bloquer l'application.
pub async fn purge_expired_projects(state: &AppState) {
    let cutoff = project_service::trash_cutoff(chrono::Utc::now());

    match project_service::purge_expired(&state.app_db, &cutoff).await {
        Ok(ids) => {
            for id in &ids {
                project_storage::delete_storage(state, id).await;
            }

            if !ids.is_empty() {
                tracing::info!(count = ids.len(), "Projets expirés supprimés de la corbeille");
            }
        }
        Err(error) => tracing::error!(error = %error, "Purge de la corbeille des projets impossible"),
    }
}
