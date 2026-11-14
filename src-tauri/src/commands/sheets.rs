//! Commandes Tauri de l'affichage des fiches (voir
//! `services::sheet_display_service`).

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::project_storage;
use crate::services::sheet_display_service::{self, SheetDisplay};
use crate::state::AppState;
use tauri::State;

/// Sections « Récit » et « Trame » visibles ou non, pour chaque module.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_sheet_display(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<SheetDisplay>> {
    sheet_display_service::list(&project_storage::pool_for_request(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_sheet_display(
    state: State<'_, AppState>,
    project_id: String,
    module: String,
    show_story: bool,
    show_plot: bool,
) -> AppResult<SheetDisplay> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    let saved = sheet_display_service::set(&pool, &module, show_story, show_plot).await?;
    history::touch_day(&pool).await;
    Ok(saved)
}
