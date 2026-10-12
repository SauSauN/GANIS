//! Commandes Tauri des notes, dossiers de notes et post-it (voir
//! `services::note_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::note_service::{
    self, Note, NoteFolder, NoteSummary, NoteUpdate, StickyNote, StickyUpdate,
};
use crate::services::project_storage;
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
    note_service::list_folders(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_note_folder(
    state: State<'_, AppState>,
    project_id: String,
    parent_id: Option<String>,
    name: String,
) -> AppResult<NoteFolder> {
    note_service::create_folder(&project_pool(&state, &project_id).await?, parent_id.as_deref(), &name).await
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
pub async fn delete_note_folder(state: State<'_, AppState>, project_id: String, folder_id: String) -> AppResult<()> {
    note_service::delete_folder(&project_pool(&state, &project_id).await?, &folder_id).await
}

// --- Notes ------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_notes(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<NoteSummary>> {
    note_service::list_notes(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_note(state: State<'_, AppState>, project_id: String, note_id: String) -> AppResult<Note> {
    note_service::get_note(&project_pool(&state, &project_id).await?, &note_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_note(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: Option<String>,
    title: String,
) -> AppResult<Note> {
    note_service::create_note(&project_pool(&state, &project_id).await?, folder_id.as_deref(), &title).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_note(
    state: State<'_, AppState>,
    project_id: String,
    note_id: String,
    input: NoteUpdate,
) -> AppResult<Note> {
    note_service::update_note(&project_pool(&state, &project_id).await?, &note_id, &input).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn move_note(
    state: State<'_, AppState>,
    project_id: String,
    note_id: String,
    folder_id: Option<String>,
) -> AppResult<Note> {
    note_service::move_note(&project_pool(&state, &project_id).await?, &note_id, folder_id.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_note(state: State<'_, AppState>, project_id: String, note_id: String) -> AppResult<()> {
    note_service::delete_note(&project_pool(&state, &project_id).await?, &note_id).await
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
    note_service::create_sticky(&project_pool(&state, &project_id).await?, &color, x, y).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_sticky_note(
    state: State<'_, AppState>,
    project_id: String,
    sticky_id: String,
    input: StickyUpdate,
) -> AppResult<StickyNote> {
    note_service::update_sticky(&project_pool(&state, &project_id).await?, &sticky_id, &input).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn raise_sticky_note(state: State<'_, AppState>, project_id: String, sticky_id: String) -> AppResult<StickyNote> {
    note_service::raise_sticky(&project_pool(&state, &project_id).await?, &sticky_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_sticky_note(state: State<'_, AppState>, project_id: String, sticky_id: String) -> AppResult<()> {
    note_service::delete_sticky(&project_pool(&state, &project_id).await?, &sticky_id).await
}
