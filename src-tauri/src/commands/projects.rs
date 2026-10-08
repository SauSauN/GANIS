//! Commandes Tauri liées à la gestion des projets.
//!
//! Chaque commande exige une session ouverte. L'identifiant de l'utilisateur
//! est toujours pris dans l'état Rust, jamais fourni par l'interface : un
//! compte ne peut donc agir que sur ses propres projets.
//!
//! Les données de chaque projet (base SQLite) sont gérées par
//! `services::project_storage` : créées avec le projet, copiées à la
//! duplication, supprimées avec lui.

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType};
use crate::services::{project_service, project_storage};
use crate::state::AppState;
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

/// Crée un projet pour l'utilisateur actuellement connecté.
///
/// Si le stockage du projet ne peut pas être créé, la création est annulée.
#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    let project = project_service::create_project(
        &state.app_db,
        &user.id,
        &input.name,
        &input.description,
        input.project_type,
    )
    .await?;

    if let Err(error) = project_storage::create_storage(&state, &project.id).await {
        let _ = project_service::delete_project(&state.app_db, &project.id, &user.id).await;

        return Err(error);
    }

    Ok(project)
}

/// Liste les projets appartenant à l'utilisateur courant.
#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> AppResult<Vec<Project>> {
    let user = state.require_user().await?;

    project_service::list_projects_for_user(&state.app_db, &user.id).await
}

/// Récupère un projet appartenant à l'utilisateur courant.
#[tauri::command]
pub async fn get_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    project_service::find_by_id_for_user(&state.app_db, &project_id, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé."))
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
    let user = state.require_user().await?;

    project_storage::pool_for_user(&state, &project_id, &user.id).await?;

    project_service::mark_opened(&state.app_db, &project_id, &user.id).await
}

/// Met à jour un projet appartenant à l'utilisateur courant.
///
/// Seuls les champs fournis (`Some(...)`) sont modifiés.
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    project_id: String,
    input: UpdateProjectInput,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    project_service::update_project(
        &state.app_db,
        &project_id,
        &user.id,
        input.name.as_deref(),
        input.description.as_deref(),
        input.project_type,
        input.status,
        input.is_favorite,
        input.is_archived,
    )
    .await
}

/// Duplique un projet appartenant à l'utilisateur courant, données
/// (synopsis, etc.) comprises.
///
/// Si les données ne peuvent pas être copiées, la copie est annulée.
#[tauri::command]
pub async fn duplicate_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    let copy =
        project_service::duplicate_project(&state.app_db, &project_id, &user.id)
            .await?;

    if let Err(error) =
        project_storage::duplicate_storage(&state, &project_id, &copy.id, &user.id)
            .await
    {
        let _ = project_service::delete_project(&state.app_db, &copy.id, &user.id).await;

        return Err(error);
    }

    Ok(copy)
}

/// Supprime un projet appartenant à l'utilisateur courant, ainsi que
/// ses données.
#[tauri::command]
pub async fn delete_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let user = state.require_user().await?;

    project_service::delete_project(&state.app_db, &project_id, &user.id).await?;

    project_storage::delete_storage(&state, &project_id).await;

    Ok(())
}