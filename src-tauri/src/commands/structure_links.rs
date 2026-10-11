//! Commandes Tauri des personnages et lieux liés aux éléments du découpage
//! (voir `services::structure_link_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::project_storage;
use crate::services::structure_link_service::{self, StructureLinks};
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

/// Base du projet, après vérification du propriétaire.
async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Tous les personnages et lieux liés aux éléments du découpage.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_structure_links(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<StructureLinks> {
    let pool = project_pool(&state, &project_id).await?;
    structure_link_service::list_links(&pool).await
}

/// Lie un personnage à un élément (ou change son rôle).
#[tauri::command(rename_all = "camelCase")]
pub async fn link_structure_character(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    character_id: String,
    role: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    structure_link_service::link_character(&pool, &node_id, &character_id, &role).await
}

/// Retire un personnage d'un élément.
#[tauri::command(rename_all = "camelCase")]
pub async fn unlink_structure_character(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    character_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    structure_link_service::unlink_character(&pool, &node_id, &character_id).await
}

/// Lie un lieu à un élément (ou change son rôle).
#[tauri::command(rename_all = "camelCase")]
pub async fn link_structure_location(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    location_id: String,
    role: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    structure_link_service::link_location(&pool, &node_id, &location_id, &role).await
}

/// Retire un lieu d'un élément.
#[tauri::command(rename_all = "camelCase")]
pub async fn unlink_structure_location(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    location_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    structure_link_service::unlink_location(&pool, &node_id, &location_id).await
}
