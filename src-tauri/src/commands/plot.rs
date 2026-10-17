//! Commandes Tauri de la trame (voir `services::plot_service`).

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::plot_service::{self, Plot};
use crate::services::project_storage;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_plot(state: State<'_, AppState>, project_id: String) -> AppResult<Plot> {
    plot_service::get(&project_pool(&state, &project_id).await?).await
}

/// Enregistre toute la trame. Une version de l'état précédent est gardée
/// au début de chaque séance de travail. Renvoie l'heure d'enregistrement.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_plot(state: State<'_, AppState>, project_id: String, data: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    plot_service::validate(&data)?;
    history::snapshot_before(&pool, "plot", "default").await;
    let plot = plot_service::save(&pool, &data).await?;
    history::record(&pool, "updated", "plot", "default", "", "").await;
    Ok(plot.updated_at)
}
