//! Commandes Tauri du logo et de la galerie de l'univers
//! (voir `services::project_image_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_service::Portrait;
use crate::services::project_image_service::{self, ProjectImage};
use crate::services::project_storage;
use crate::state::AppState;
use tauri::State;

/// Logo du projet (`None` : il n'en a pas).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_project_logo(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Option<Portrait>> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::get_logo(&pool).await
}

/// Remplace le logo du projet (`data` : image en base64).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_project_logo(
    state: State<'_, AppState>,
    project_id: String,
    data: String,
) -> AppResult<Portrait> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::set_logo(&pool, &data).await
}

/// Retire le logo du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn remove_project_logo(state: State<'_, AppState>, project_id: String) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::remove_logo(&pool).await
}

/// Images de la galerie de l'univers (sans leur contenu).
#[tauri::command(rename_all = "camelCase")]
pub async fn list_project_gallery(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<ProjectImage>> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::list_gallery(&pool).await
}

/// Contenu d'une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_project_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<Portrait> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::get_gallery_image(&pool, &image_id).await
}

/// Ajoute une image à la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn add_project_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    data: String,
    caption: Option<String>,
) -> AppResult<ProjectImage> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::add_gallery_image(&pool, &data, caption.as_deref()).await
}

/// Change la légende d'une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_project_gallery_caption(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
    caption: Option<String>,
) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::set_gallery_caption(&pool, &image_id, caption.as_deref()).await
}

/// Supprime une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_project_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::delete_gallery_image(&pool, &image_id).await
}
