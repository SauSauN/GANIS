//! Commandes Tauri du scénario de manga / BD (voir `services::manga_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que le projet est public ou appartient au compte
//! connecté. Les modifications sont inscrites au journal du projet.

use crate::commands::documents::{body, header};
use crate::commands::structure::project_pool_and_type;
use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::manga_service::{self, ChapterFields, MangaSettings, PageScript, PageScriptInput, Panel};
use crate::services::manga_production_service::{self as production, ExtraPage, ExtraPageInput, ExtraPageUpdate};
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
    history::snapshot_before(&pool, "structureNode", &page_id).await;
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
    if let Some(source) = manga_service::page_of_panel(&pool, &panel_id).await? {
        history::snapshot_before(&pool, "structureNode", &source).await;
    }
    history::snapshot_before(&pool, "structureNode", &page_id).await;
    manga_service::move_panel(&pool, &panel_id, &page_id).await?;
    history::touch_day(&pool).await;
    Ok(())
}

/// Ajoute plusieurs pages à la fin d'un chapitre.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_manga_pages(state: State<'_, AppState>, project_id: String, chapter_id: String, count: i64) -> AppResult<Vec<StructureNode>> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;
    let created = manga_service::create_pages(&pool, project_type, &chapter_id, count).await?;
    history::record(&pool, "updated", "structureNode", &chapter_id, "", "").await;
    Ok(created)
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

// --- Fabrication et pages hors récit (voir `manga_production_service`) -------

/// Pages hors récit de tous les tomes.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_manga_extra_pages(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<ExtraPage>> {
    production::list_extra_pages(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_manga_extra_page(state: State<'_, AppState>, project_id: String, input: ExtraPageInput) -> AppResult<ExtraPage> {
    let pool = project_pool(&state, &project_id).await?;
    let created = production::create_extra_page(&pool, &input).await?;
    history::record(&pool, "created", "mangaExtraPage", &created.id, &created.title, "").await;
    Ok(created)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_manga_extra_page(
    state: State<'_, AppState>,
    project_id: String,
    page_id: String,
    update: ExtraPageUpdate,
) -> AppResult<ExtraPage> {
    let pool = project_pool(&state, &project_id).await?;
    let saved = production::update_extra_page(&pool, &page_id, &update).await?;
    history::record(&pool, "updated", "mangaExtraPage", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Nouvel ordre des pages hors récit d'un tome, avant ou après le récit.
/// Renvoie toutes les pages hors récit.
#[tauri::command(rename_all = "camelCase")]
pub async fn reorder_manga_extra_pages(
    state: State<'_, AppState>,
    project_id: String,
    volume_id: Option<String>,
    placement: String,
    ids: Vec<String>,
) -> AppResult<Vec<ExtraPage>> {
    let pool = project_pool(&state, &project_id).await?;
    let pages = production::reorder_extra_pages(&pool, volume_id.as_deref(), &placement, &ids).await?;
    history::touch_day(&pool).await;
    Ok(pages)
}

/// Met la page à la corbeille ; renvoie l'identifiant de l'entrée.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_manga_extra_page(state: State<'_, AppState>, project_id: String, page_id: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = production::delete_extra_page(&pool, &page_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}

/// Dessin d'une page hors récit : corps binaire ; en-têtes `x-project-id`,
/// `x-page-id`, `x-name`.
#[tauri::command]
pub async fn set_manga_extra_art(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> AppResult<ExtraPage> {
    let project_id = header(&request, "x-project-id")?;
    let page_id = header(&request, "x-page-id")?;
    let name = header(&request, "x-name")?;
    let bytes = body(&request)?;
    let pool = project_pool(&state, &project_id).await?;
    let saved = production::set_extra_art(&pool, &page_id, &name, &bytes).await?;
    history::record(&pool, "updated", "mangaExtraPage", &saved.id, &saved.title, "").await;
    Ok(saved)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn remove_manga_extra_art(state: State<'_, AppState>, project_id: String, page_id: String) -> AppResult<ExtraPage> {
    let pool = project_pool(&state, &project_id).await?;
    let saved = production::remove_extra_art(&pool, &page_id).await?;
    history::record(&pool, "updated", "mangaExtraPage", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Contenu du dessin d'une page hors récit, en binaire.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_manga_extra_art(state: State<'_, AppState>, project_id: String, page_id: String) -> AppResult<tauri::ipc::Response> {
    let bytes = production::extra_art(&project_pool(&state, &project_id).await?, &page_id).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Étape de fabrication de pages du récit et de pages hors récit
/// (`stage` absent : rien de commencé).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_manga_production_stage(
    state: State<'_, AppState>,
    project_id: String,
    page_ids: Vec<String>,
    extra_ids: Vec<String>,
    stage: Option<String>,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    production::set_production_stage(&pool, &page_ids, &extra_ids, stage.as_deref()).await?;
    history::touch_day(&pool).await;
    Ok(())
}
