//! Commandes Tauri des arcs des personnages et des planches d'inspiration
//! (voir `services::character_arc_service` et `services::board_service`).

use crate::error::AppResult;
use crate::services::board_service::{self, Board};
use crate::services::character_arc_service::{self, CharacterArc};
use crate::services::project_storage;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

// ----------------------------------------------------------------------------
// Arcs des personnages
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_character_arcs(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<CharacterArc>> {
    character_arc_service::list(&project_pool(&state, &project_id).await?).await
}

/// Enregistre tout l'arc d'un personnage ; renvoie l'heure d'enregistrement.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_character_arc(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
    data: String,
) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    Ok(character_arc_service::save(&pool, &character_id, &data).await?.updated_at)
}

// ----------------------------------------------------------------------------
// Planches d'inspiration
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_boards(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<Board>> {
    board_service::list(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_board(state: State<'_, AppState>, project_id: String, name: String) -> AppResult<Board> {
    board_service::create(&project_pool(&state, &project_id).await?, &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rename_board(state: State<'_, AppState>, project_id: String, board_id: String, name: String) -> AppResult<Board> {
    board_service::rename(&project_pool(&state, &project_id).await?, &board_id, &name).await
}

/// Enregistre les éléments d'une planche ; renvoie l'heure d'enregistrement.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_board_items(state: State<'_, AppState>, project_id: String, board_id: String, data: String) -> AppResult<String> {
    board_service::save_items(&project_pool(&state, &project_id).await?, &board_id, &data).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_board(state: State<'_, AppState>, project_id: String, board_id: String) -> AppResult<()> {
    board_service::delete(&project_pool(&state, &project_id).await?, &board_id).await
}
