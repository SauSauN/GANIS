//! Commandes Tauri du scénario de manga / BD (voir `services::manga_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que le projet est public ou appartient au compte
//! connecté. Les modifications sont inscrites au journal du projet.

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::manga_service::{self, ChapterFields, MangaSettings, PageScript, PageScriptInput, Panel};
use crate::services::project_storage;
use crate::services::structure_service::StructureNode;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

/// Scénario d'une page : fonction narrative et cases.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_page_script(state: State<'_, AppState>, project_id: String, page_id: String) -> AppResult<PageScript> {
    manga_service::page_script(&project_pool(&state, &project_id).await?, &page_id).await
}

/// Enregistre le scénario d'une page d'un bloc (cases retirées : corbeille).
#[tauri::command(rename_all = "camelCase")]
pub async fn save_page_script(
    state: State<'_, AppState>,
    project_id: String,
    page_id: String,
    input: PageScriptInput,
) -> AppResult<PageScript> {
    let pool = project_pool(&state, &project_id).await?;
    let saved = manga_service::save_page_script(&pool, &page_id, &input).await?;
    history::record(&pool, "updated", "structureNode", &saved.page.id, &saved.page.title, "").await;
    Ok(saved)
}

/// Toutes les cases du projet (lecture, export, suivi, continuité).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_script_panels(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<Panel>> {
    manga_service::script_panels(&project_pool(&state, &project_id).await?).await
}

/// Déplace une case à la fin d'une autre page.
#[tauri::command(rename_all = "camelCase")]
pub async fn move_manga_panel(state: State<'_, AppState>, project_id: String, panel_id: String, page_id: String) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    manga_service::move_panel(&pool, &panel_id, &page_id).await?;
    history::touch_day(&pool).await;
    Ok(())
}

/// Objectif narratif, nombre de pages visé et statut d'un chapitre.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_manga_chapter(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    fields: ChapterFields,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;
    history::snapshot_before(&pool, "structureNode", &node_id).await;
    let saved = manga_service::set_chapter_fields(&pool, &node_id, &fields).await?;
    history::record(&pool, "updated", "structureNode", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Seuils d'alerte du volume de texte.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_manga_settings(state: State<'_, AppState>, project_id: String) -> AppResult<MangaSettings> {
    manga_service::settings(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_manga_settings(state: State<'_, AppState>, project_id: String, settings: MangaSettings) -> AppResult<MangaSettings> {
    manga_service::set_settings(&project_pool(&state, &project_id).await?, &settings).await
}
