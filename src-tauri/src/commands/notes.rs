//! Commandes Tauri des notes, dossiers de notes et post-it (voir
//! `services::note_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::note_service::{
    self, Note, NoteFolder, NoteSummary, NoteUpdate, StickyNote, StickyUpdate,
};
use crate::services::project_storage;
use crate::services::system_note_service::{self, SystemNotesSettings};
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

// --- Dossiers ----------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_note_folders(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<NoteFolder>> {
    let pool = project_pool(&state, &project_id).await?;
    system_note_service::sync(&pool, None).await?;
    note_service::list_folders(&pool).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_note_folder(
    state: State<'_, AppState>,
    project_id: String,
    parent_id: Option<String>,
    name: String,
) -> AppResult<NoteFolder> {
    let pool = project_pool(&state, &project_id).await?;
    let created = note_service::create_folder(&pool, parent_id.as_deref(), &name).await?;
    history::record(&pool, "created", "noteFolder", &created.id, &created.name, "").await;
    Ok(created)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rename_note_folder(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: String,
    name: String,
) -> AppResult<NoteFolder> {
    note_service::rename_folder(&project_pool(&state, &project_id).await?, &folder_id, &name).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn move_note_folder(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: String,
    parent_id: Option<String>,
) -> AppResult<NoteFolder> {
    note_service::move_folder(&project_pool(&state, &project_id).await?, &folder_id, parent_id.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_note_folder(state: State<'_, AppState>, project_id: String, folder_id: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = note_service::delete_folder(&pool, &folder_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}

// --- Notes ------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_notes(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<NoteSummary>> {
    let pool = project_pool(&state, &project_id).await?;
    system_note_service::sync(&pool, None).await?;
    note_service::list_notes(&pool).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_note(state: State<'_, AppState>, project_id: String, note_id: String) -> AppResult<Note> {
    let pool = project_pool(&state, &project_id).await?;
    system_note_service::sync(&pool, None).await?;
    note_service::get_note(&pool, &note_id).await
}

// --- Notes système ------------------------------------------------------------

/// Option « notes système » du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_system_notes(state: State<'_, AppState>, project_id: String) -> AppResult<SystemNotesSettings> {
    system_note_service::settings(&project_pool(&state, &project_id).await?).await
}

/// Active ou désactive les notes système (titres dans `language`).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_system_notes(
    state: State<'_, AppState>,
    project_id: String,
    enabled: bool,
    language: String,
) -> AppResult<SystemNotesSettings> {
    let pool = project_pool(&state, &project_id).await?;
    let result = system_note_service::set_enabled(&pool, enabled, &language).await?;
    history::touch_day(&pool).await;
    Ok(result)
}

/// Met les notes système à jour (langue du logiciel pour les titres).
#[tauri::command(rename_all = "camelCase")]
pub async fn sync_system_notes(state: State<'_, AppState>, project_id: String, language: String) -> AppResult<()> {
    system_note_service::sync(&project_pool(&state, &project_id).await?, Some(&language)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_note(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: Option<String>,
    title: String,
) -> AppResult<Note> {
    let pool = project_pool(&state, &project_id).await?;
    let created = note_service::create_note(&pool, folder_id.as_deref(), &title).await?;
    history::record(&pool, "created", "note", &created.id, &created.title, "").await;
    Ok(created)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_note(
    state: State<'_, AppState>,
    project_id: String,
    note_id: String,
    input: NoteUpdate,
) -> AppResult<Note> {
    let pool = project_pool(&state, &project_id).await?;
    // Titre ou contenu : une version et une ligne au journal. Épingle seule : non.
    let edits_text = input.title.is_some() || input.content.is_some();
    if edits_text {
        history::snapshot_before(&pool, "note", &note_id).await;
    }
    let saved = note_service::update_note(&pool, &note_id, &input).await?;
    if edits_text {
        history::record(&pool, "updated", "note", &saved.id, &saved.title, "").await;
    }
    Ok(saved)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn move_note(
    state: State<'_, AppState>,
    project_id: String,
    note_id: String,
    folder_id: Option<String>,
) -> AppResult<Note> {
    let pool = project_pool(&state, &project_id).await?;
    let result = note_service::move_note(&pool, &note_id, folder_id.as_deref()).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_note(state: State<'_, AppState>, project_id: String, note_id: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = note_service::delete_note(&pool, &note_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}

// --- Post-it ----------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_sticky_notes(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<StickyNote>> {
    note_service::list_stickies(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_sticky_note(
    state: State<'_, AppState>,
    project_id: String,
    color: String,
    x: f64,
    y: f64,
) -> AppResult<StickyNote> {
    let pool = project_pool(&state, &project_id).await?;
    let result = note_service::create_sticky(&pool, &color, x, y).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_sticky_note(
    state: State<'_, AppState>,
    project_id: String,
    sticky_id: String,
    input: StickyUpdate,
) -> AppResult<StickyNote> {
    let pool = project_pool(&state, &project_id).await?;
    let result = note_service::update_sticky(&pool, &sticky_id, &input).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn raise_sticky_note(state: State<'_, AppState>, project_id: String, sticky_id: String) -> AppResult<StickyNote> {
    note_service::raise_sticky(&project_pool(&state, &project_id).await?, &sticky_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_sticky_note(state: State<'_, AppState>, project_id: String, sticky_id: String) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = note_service::delete_sticky(&pool, &sticky_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}
