//! Commandes Tauri des liens entre personnages et lieux (voir
//! `services::character_location_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_location_service::{
    self, CharacterLocation, CharacterLocationInput,
};
use crate::services::project_storage;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

/// Base du projet, après vérification du propriétaire.
async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Tous les liens personnage ↔ lieu du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_character_locations(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<CharacterLocation>> {
    let pool = project_pool(&state, &project_id).await?;
    character_location_service::list_links(&pool).await
}

/// Crée un lien.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_character_location(
    state: State<'_, AppState>,
    project_id: String,
    input: CharacterLocationInput,
) -> AppResult<CharacterLocation> {
    let pool = project_pool(&state, &project_id).await?;
    character_location_service::create_link(&pool, &input).await
}

/// Remplace un lien.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_character_location(
    state: State<'_, AppState>,
    project_id: String,
    link_id: String,
    input: CharacterLocationInput,
) -> AppResult<CharacterLocation> {
    let pool = project_pool(&state, &project_id).await?;
    character_location_service::update_link(&pool, &link_id, &input).await
}

/// Supprime un lien.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_character_location(
    state: State<'_, AppState>,
    project_id: String,
    link_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    character_location_service::delete_link(&pool, &link_id).await
}
