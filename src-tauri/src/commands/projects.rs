//! Commandes Tauri liées à la gestion des projets.
//!
//! Chaque commande exige une session ouverte. L'identifiant de l'utilisateur
//! est toujours pris dans l'état Rust, jamais fourni par l'interface : un
//! compte ne peut donc agir que sur ses propres projets.

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType};
use crate::services::project_service;
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
#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    project_service::create_project(
        &state.app_db,
        &user.id,
        &input.name,
        &input.description,
        input.project_type,
    )
    .await
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

/// Ouvre un projet : enregistre la date d'ouverture et retourne le projet.
#[tauri::command]
pub async fn open_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let user = state.require_user().await?;

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

/// Duplique un projet appartenant à l'utilisateur courant.
#[tauri::command]
pub async fn duplicate_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Project> {
    let user = state.require_user().await?;

    project_service::duplicate_project(&state.app_db, &project_id, &user.id)
        .await
}

/// Supprime un projet appartenant à l'utilisateur courant.
#[tauri::command]
pub async fn delete_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let user = state.require_user().await?;

    project_service::delete_project(&state.app_db, &project_id, &user.id).await
}