//! Commandes de la corbeille du projet (voir `services::trash_service`).

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::project_storage;
use crate::services::trash_service::{self, TrashItem};
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Contenu de la corbeille (les entrées de plus de 30 jours sont retirées).
#[tauri::command(rename_all = "camelCase")]
pub async fn list_trash(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<TrashItem>> {
    trash_service::list(&project_pool(&state, &project_id).await?).await
}

/// Remet un élément de la corbeille à sa place.
#[tauri::command(rename_all = "camelCase")]
pub async fn restore_trash(state: State<'_, AppState>, project_id: String, trash_id: String) -> AppResult<TrashItem> {
    let pool = project_pool(&state, &project_id).await?;
    let item = trash_service::restore(&pool, &trash_id).await?;
    // Document : l'élément du découpage qui le contient (lien du journal).
    let detail = if item.kind == "document" {
        crate::services::document_service::find(&pool, &item.item_id)
            .await
            .ok()
            .flatten()
            .map(|d| d.node_id)
            .unwrap_or_default()
    } else {
        String::new()
    };
    history::record(&pool, "restored", &item.kind, &item.item_id, &item.label, &detail).await;
    Ok(item)
}

/// Supprime définitivement un élément de la corbeille.
#[tauri::command(rename_all = "camelCase")]
pub async fn purge_trash(state: State<'_, AppState>, project_id: String, trash_id: String) -> AppResult<()> {
    trash_service::purge(&project_pool(&state, &project_id).await?, &trash_id).await
}

/// Vide la corbeille.
#[tauri::command(rename_all = "camelCase")]
pub async fn empty_trash(state: State<'_, AppState>, project_id: String) -> AppResult<()> {
    trash_service::empty(&project_pool(&state, &project_id).await?).await
}
