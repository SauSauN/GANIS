//! Commandes Tauri des lieux (voir `services::location_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_service::Portrait;
use crate::services::location_service::{
    self, CustomTypeInput, Location, LocationImage, LocationInput, LocationSettings,
};
use crate::services::project_storage;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

/// Base du projet, après vérification du propriétaire.
async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Tous les lieux du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_locations(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<Location>> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::list_locations(&pool).await
}

/// Crée un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_location(
    state: State<'_, AppState>,
    project_id: String,
    input: LocationInput,
) -> AppResult<Location> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::create_location(&pool, &input).await
}

/// Remplace la fiche d'un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_location(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
    input: LocationInput,
) -> AppResult<Location> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::update_location(&pool, &location_id, &input).await
}

/// Supprime un lieu (ses lieux contenus remontent d'un niveau).
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_location(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::delete_location(&pool, &location_id).await
}

/// Réglages des lieux du projet (types ajoutés, listes).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_location_settings(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<LocationSettings> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::get_settings(&pool).await
}

/// Remplace les types de lieux ajoutés par l'auteur.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_location_custom_types(
    state: State<'_, AppState>,
    project_id: String,
    types: Vec<CustomTypeInput>,
) -> AppResult<LocationSettings> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::set_custom_types(&pool, &types).await
}

/// Remplace une liste personnalisable (`values` absent : valeurs par défaut).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_location_list(
    state: State<'_, AppState>,
    project_id: String,
    list: String,
    values: Option<Vec<String>>,
) -> AppResult<LocationSettings> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::set_list(&pool, &list, values.as_deref()).await
}

/// Image principale d'un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_location_portrait(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
) -> AppResult<Option<Portrait>> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::get_portrait(&pool, &location_id).await
}

/// Remplace l'image principale d'un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_location_portrait(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
    data: String,
) -> AppResult<Location> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::set_portrait(&pool, &location_id, &data).await
}

/// Retire l'image principale d'un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn remove_location_portrait(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
) -> AppResult<Location> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::remove_portrait(&pool, &location_id).await
}

/// Images de la galerie d'un lieu (sans leur contenu).
#[tauri::command(rename_all = "camelCase")]
pub async fn list_location_gallery(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
) -> AppResult<Vec<LocationImage>> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::list_gallery(&pool, &location_id).await
}

/// Contenu d'une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_location_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<Portrait> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::get_gallery_image(&pool, &image_id).await
}

/// Ajoute une image à la galerie d'un lieu.
#[tauri::command(rename_all = "camelCase")]
pub async fn add_location_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    location_id: String,
    data: String,
    caption: Option<String>,
) -> AppResult<LocationImage> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::add_gallery_image(&pool, &location_id, &data, caption.as_deref()).await
}

/// Change la légende d'une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_location_gallery_caption(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
    caption: Option<String>,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::set_gallery_caption(&pool, &image_id, caption.as_deref()).await
}

/// Supprime une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_location_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    location_service::delete_gallery_image(&pool, &image_id).await
}
