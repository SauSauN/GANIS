//! Commandes Tauri des objets, de la faune et de la flore, et des liens
//! entre éléments (voir `services::world_service` et
//! `services::world_link_service`).
//!
//! Les objets et les espèces partagent les mêmes commandes : le paramètre
//! `module` (`"item"` ou `"species"`) choisit lequel.
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::character_service::{Character, Portrait};
use crate::services::history_service as history;
use crate::services::location_service::CustomTypeInput;
use crate::services::project_storage;
use crate::services::world_link_service::{self, WorldLink, WorldLinkInput};
use crate::services::world_service::{self, Module, WorldEntry, WorldEntryInput, WorldImage, WorldSettings};
use crate::state::AppState;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

// ----------------------------------------------------------------------------
// Réglages
// ----------------------------------------------------------------------------

/// Réglages d'un module (activé, catégories, types ajoutés, listes).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_world_settings(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::get_settings(&pool, module).await
}

/// Active ou désactive un module (masqué, rien n'est supprimé).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_enabled(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    enabled: bool,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_enabled(&pool, module, enabled).await
}

/// Catégories utilisées par l'auteur (au moins une).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_categories(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    categories: Vec<String>,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_categories(&pool, module, &categories).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_detail_level(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    level: String,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_detail_level(&pool, module, &level).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_custom_types(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    types: Vec<CustomTypeInput>,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_custom_types(&pool, module, &types).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_list(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    list: String,
    values: Option<Vec<String>>,
) -> AppResult<WorldSettings> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_list(&pool, module, &list, values.as_deref()).await
}

// ----------------------------------------------------------------------------
// Fiches
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_world_entries(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
) -> AppResult<Vec<WorldEntry>> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::list_entries(&pool, module).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_world_entry(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    input: WorldEntryInput,
) -> AppResult<WorldEntry> {
    let pool = project_pool(&state, &project_id).await?;
    let created = world_service::create_entry(&pool, module, &input).await?;
    history::record(&pool, "created", module.kind(), &created.id, &created.name, "").await;
    Ok(created)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_world_entry(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
    input: WorldEntryInput,
) -> AppResult<WorldEntry> {
    let pool = project_pool(&state, &project_id).await?;
    history::snapshot_before(&pool, module.kind(), &entry_id).await;
    let saved = world_service::update_entry(&pool, module, &entry_id, &input).await?;
    history::record(&pool, "updated", module.kind(), &saved.id, &saved.name, "").await;
    Ok(saved)
}

/// Supprime un élément (corbeille) ; renvoie l'identifiant de l'entrée.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_world_entry(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = world_service::delete_entry(&pool, module, &entry_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}

// ----------------------------------------------------------------------------
// Animal personnage
// ----------------------------------------------------------------------------

/// Associe un animal précis à une fiche de personnage existante, ou retire
/// ce lien (`characterId` absent).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_species_character(
    state: State<'_, AppState>,
    project_id: String,
    entry_id: String,
    character_id: Option<String>,
) -> AppResult<WorldEntry> {
    let pool = project_pool(&state, &project_id).await?;
    let saved = world_service::set_character(&pool, Module::Species, &entry_id, character_id.as_deref()).await?;
    history::record(&pool, "updated", "species", &saved.id, &saved.name, "").await;
    Ok(saved)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeciesCharacter {
    entry: WorldEntry,
    character: Character,
}

/// Crée la fiche de personnage d'un animal précis et l'y associe.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_species_character(
    state: State<'_, AppState>,
    project_id: String,
    entry_id: String,
) -> AppResult<SpeciesCharacter> {
    let pool = project_pool(&state, &project_id).await?;
    let (entry, character) = world_service::create_character(&pool, Module::Species, &entry_id).await?;
    let name = format!("{} {}", character.first_name, character.last_name);
    history::record(&pool, "created", "character", &character.id, name.trim(), "").await;
    Ok(SpeciesCharacter { entry, character })
}

// ----------------------------------------------------------------------------
// Images
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn get_world_entry_portrait(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
) -> AppResult<Option<Portrait>> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::get_portrait(&pool, module, &entry_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_entry_portrait(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
    data: String,
) -> AppResult<WorldEntry> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_portrait(&pool, module, &entry_id, &data).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn remove_world_entry_portrait(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
) -> AppResult<WorldEntry> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::remove_portrait(&pool, module, &entry_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_world_entry_gallery(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
) -> AppResult<Vec<WorldImage>> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::list_gallery(&pool, module, &entry_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_world_entry_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    image_id: String,
) -> AppResult<Portrait> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::get_gallery_image(&pool, module, &image_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn add_world_entry_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    entry_id: String,
    data: String,
    caption: Option<String>,
) -> AppResult<WorldImage> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::add_gallery_image(&pool, module, &entry_id, &data, caption.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn set_world_entry_gallery_caption(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    image_id: String,
    caption: Option<String>,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::set_gallery_caption(&pool, module, &image_id, caption.as_deref()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_world_entry_gallery_image(
    state: State<'_, AppState>,
    project_id: String,
    module: Module,
    image_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    world_service::delete_gallery_image(&pool, module, &image_id).await
}

// ----------------------------------------------------------------------------
// Liens entre éléments
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_world_links(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<WorldLink>> {
    let pool = project_pool(&state, &project_id).await?;
    world_link_service::list_links(&pool).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_world_link(
    state: State<'_, AppState>,
    project_id: String,
    input: WorldLinkInput,
) -> AppResult<WorldLink> {
    let pool = project_pool(&state, &project_id).await?;
    let result = world_link_service::create_link(&pool, &input).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_world_link(
    state: State<'_, AppState>,
    project_id: String,
    link_id: String,
    input: WorldLinkInput,
) -> AppResult<WorldLink> {
    let pool = project_pool(&state, &project_id).await?;
    let result = world_link_service::update_link(&pool, &link_id, &input).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_world_link(
    state: State<'_, AppState>,
    project_id: String,
    link_id: String,
) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = world_link_service::delete_link(&pool, &link_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}
