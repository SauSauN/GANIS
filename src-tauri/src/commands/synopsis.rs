//! Commandes Tauri liées à la gestion du synopsis.
//!
//! Chaque commande obtient la base du projet concerné auprès de
//! `project_storage`, qui vérifie d'abord que l'utilisateur connecté
//! en est bien le propriétaire.

use crate::error::AppResult;
use crate::services::project_storage;
use crate::services::synopsis_service::{self, Synopsis};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

/// Récupère le synopsis du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_synopsis(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Synopsis> {
    let user = state.require_user().await?;
    let project_pool =
        project_storage::pool_for_user(&state, &project_id, &user.id).await?;

    synopsis_service::get_synopsis(&project_pool).await
}

/// Entrée de mise à jour du synopsis.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSynopsisInput {
    pub content: String,
    pub genres: Vec<String>,
    pub subgenres: Vec<String>,
    pub tone: Vec<String>,
}

/// Met à jour le synopsis du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_synopsis(
    state: State<'_, AppState>,
    project_id: String,
    input: UpdateSynopsisInput,
) -> AppResult<Synopsis> {
    let user = state.require_user().await?;
    let project_pool =
        project_storage::pool_for_user(&state, &project_id, &user.id).await?;

    synopsis_service::update_synopsis(
        &project_pool,
        &input.content,
        &input.genres,
        &input.subgenres,
        &input.tone,
    )
    .await
}