//! Commandes Tauri du glossaire (voir `services::glossary_service`).

use crate::error::AppResult;
use crate::services::glossary_service::{self, GlossaryInput, GlossaryTerm};
use crate::services::history_service as history;
use crate::services::project_storage;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_glossary_terms(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<GlossaryTerm>> {
    glossary_service::list(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_glossary_term(
    state: State<'_, AppState>,
    project_id: String,
    input: GlossaryInput,
) -> AppResult<GlossaryTerm> {
    let pool = project_pool(&state, &project_id).await?;
    let created = glossary_service::create(&pool, &input).await?;
    history::record(&pool, "created", "glossaryTerm", &created.id, &created.term, "").await;
    Ok(created)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_glossary_term(
    state: State<'_, AppState>,
    project_id: String,
    term_id: String,
    input: GlossaryInput,
) -> AppResult<GlossaryTerm> {
    let pool = project_pool(&state, &project_id).await?;
    let updated = glossary_service::update(&pool, &term_id, &input).await?;
    history::record(&pool, "updated", "glossaryTerm", &updated.id, &updated.term, "").await;
    Ok(updated)
}

/// Met le terme à la corbeille ; renvoie l'identifiant de l'entrée.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_glossary_term(state: State<'_, AppState>, project_id: String, term_id: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = glossary_service::delete(&pool, &term_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}
