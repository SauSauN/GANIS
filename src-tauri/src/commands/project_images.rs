//! Commandes Tauri du logo et de la galerie de l'univers
//! (voir `services::project_image_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_service::Portrait;
use crate::services::project_image_service::{self, GalleryFolder, ProjectImage};
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
    folder_id: Option<String>,
) -> AppResult<ProjectImage> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::add_gallery_image(&pool, &data, caption.as_deref(), folder_id.as_deref()).await
}

/// Nom et description d'une image de la galerie (vides : effacés).
#[tauri::command(rename_all = "camelCase")]
pub async fn update_project_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
    caption: Option<String>,
    description: Option<String>,
) -> AppResult<ProjectImage> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::update_gallery_image(&pool, &image_id, caption.as_deref(), description.as_deref()).await
}

/// Range des images dans un dossier de la galerie (`folder_id` absent : à la racine).
#[tauri::command(rename_all = "camelCase")]
pub async fn move_project_gallery_images(
    state: State<'_, AppState>,
    project_id: String,
    image_ids: Vec<String>,
    folder_id: Option<String>,
) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::move_gallery_images(&pool, &image_ids, folder_id.as_deref()).await
}

/// Dossiers de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_gallery_folders(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<GalleryFolder>> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::list_folders(&pool).await
}

/// Crée un dossier de la galerie (dans `parent_id`, ou à la racine).
#[tauri::command(rename_all = "camelCase")]
pub async fn create_gallery_folder(
    state: State<'_, AppState>,
    project_id: String,
    parent_id: Option<String>,
    name: String,
) -> AppResult<GalleryFolder> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::create_folder(&pool, parent_id.as_deref(), &name).await
}

/// Renomme un dossier de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn rename_gallery_folder(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: String,
    name: String,
) -> AppResult<GalleryFolder> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::rename_folder(&pool, &folder_id, &name).await
}

/// Déplace un dossier de la galerie (dans `parent_id`, ou à la racine).
#[tauri::command(rename_all = "camelCase")]
pub async fn move_gallery_folder(
    state: State<'_, AppState>,
    project_id: String,
    folder_id: String,
    parent_id: Option<String>,
) -> AppResult<GalleryFolder> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::move_folder(&pool, &folder_id, parent_id.as_deref()).await
}

/// Supprime un dossier et ses sous-dossiers ; leurs images reviennent à la racine.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_gallery_folder(state: State<'_, AppState>, project_id: String, folder_id: String) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::delete_folder(&pool, &folder_id).await
}

/// Range la galerie : `image_ids` donne le nouvel ordre de toutes les images.
#[tauri::command(rename_all = "camelCase")]
pub async fn reorder_project_gallery(
    state: State<'_, AppState>,
    project_id: String,
    image_ids: Vec<String>,
) -> AppResult<()> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    project_image_service::reorder_gallery(&pool, &image_ids).await
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
