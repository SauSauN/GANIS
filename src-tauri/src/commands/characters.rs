//! Commandes Tauri des personnages (voir `services::character_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_service::{
    self, Character, CharacterInput, CharacterSettings, GalleryImage, Portrait,
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

/// Tous les personnages du projet, par ordre alphabétique.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_characters(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<Character>> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::list_characters(&pool).await
}

/// Crée un personnage.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_character(
    state: State<'_, AppState>,
    project_id: String,
    input: CharacterInput,
) -> AppResult<Character> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::create_character(&pool, &input).await
}

/// Remplace la fiche d'un personnage.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_character(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
    input: CharacterInput,
) -> AppResult<Character> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::update_character(&pool, &character_id, &input).await
}

/// Supprime un personnage et sa photo.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_character(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::delete_character(&pool, &character_id).await
}

/// Photo d'un personnage (`null` : pas de photo).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_character_portrait(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
) -> AppResult<Option<Portrait>> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::get_portrait(&pool, &character_id).await
}

/// Remplace la photo d'un personnage (image encodée en base64).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_character_portrait(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
    data: String,
) -> AppResult<Character> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::set_portrait(&pool, &character_id, &data).await
}

/// Retire la photo d'un personnage.
#[tauri::command(rename_all = "camelCase")]
pub async fn remove_character_portrait(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
) -> AppResult<Character> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::remove_portrait(&pool, &character_id).await
}

/// Réglages des personnages du projet (niveau de détail des fiches).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_character_settings(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<CharacterSettings> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::get_settings(&pool).await
}

/// Choisit le niveau de détail de toutes les fiches du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_character_detail_level(
    state: State<'_, AppState>,
    project_id: String,
    level: String,
) -> AppResult<CharacterSettings> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::set_detail_level(&pool, &level).await
}

/// Remplace une liste personnalisable (`null` : valeurs par défaut).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_character_list(
    state: State<'_, AppState>,
    project_id: String,
    list: String,
    values: Option<Vec<String>>,
) -> AppResult<CharacterSettings> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::set_list(&pool, &list, values.as_deref()).await
}

/// Images de la galerie d'un personnage (sans leur contenu).
#[tauri::command(rename_all = "camelCase")]
pub async fn list_character_gallery(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
) -> AppResult<Vec<GalleryImage>> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::list_gallery(&pool, &character_id).await
}

/// Contenu d'une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_character_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<Portrait> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::get_gallery_image(&pool, &image_id).await
}

/// Ajoute une image à la galerie (image encodée en base64).
#[tauri::command(rename_all = "camelCase")]
pub async fn add_character_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    character_id: String,
    data: String,
) -> AppResult<GalleryImage> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::add_gallery_image(&pool, &character_id, &data).await
}

/// Supprime une image de la galerie.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_character_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    character_service::delete_gallery_image(&pool, &image_id).await
}
