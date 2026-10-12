//! Commandes Tauri du découpage du récit (voir `services::structure_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::{AppError, AppResult};
use crate::services::history_service as history;
use crate::models::project::ProjectType;
use crate::services::structure_service::{self, LevelInput, MoveDirection, Structure, StructureNode};
use crate::services::{project_service, project_storage};
use crate::state::AppState;
use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;

/// Base du projet, après vérification du propriétaire.
async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Base du projet et type du projet (qui donne le modèle par défaut).
async fn project_pool_and_type(state: &AppState, project_id: &str) -> AppResult<(SqlitePool, ProjectType)> {
    let user = state.require_user().await?;
    let pool = project_storage::pool_for_user(state, project_id, &user.id).await?;

    // Le type du projet n'est pas chiffré : pas besoin de la clé du compte.
    let project = project_service::find_stored(&state.app_db, project_id, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;

    Ok((pool, project.project_type))
}

/// Découpage complet du projet (modèle et éléments).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_structure(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Structure> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    structure_service::get_structure(&pool, project_type).await
}

/// Active ou désactive la mise à jour automatique des numéros.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_auto_numbering(
    state: State<'_, AppState>,
    project_id: String,
    enabled: bool,
) -> AppResult<()> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    structure_service::set_auto_numbering(&pool, project_type, enabled).await
}

/// Remet tous les numéros dans l'ordre du plan (« Renuméroter »).
#[tauri::command(rename_all = "camelCase")]
pub async fn renumber_structure(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    structure_service::renumber(&pool, project_type).await
}

/// Choisit le modèle de découpage (`null` : il suit le type du projet). Les
/// niveaux redeviennent ceux du modèle.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_template(
    state: State<'_, AppState>,
    project_id: String,
    template: Option<String>,
) -> AppResult<()> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    structure_service::set_template(&pool, project_type, template.as_deref()).await
}

/// Personnalise les niveaux (noms, numérotation, ajout ou retrait).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_levels(
    state: State<'_, AppState>,
    project_id: String,
    levels: Vec<LevelInput>,
) -> AppResult<()> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    structure_service::set_levels(&pool, project_type, &levels).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStructureNodeInput {
    pub parent_id: Option<String>,
    pub level: i64,
    /// Facultatif : sans titre, l'élément s'affiche « Chapitre 3 ».
    #[serde(default)]
    pub title: String,
    /// Élément après lequel insérer (même parent) ; absent : à la fin.
    pub after_id: Option<String>,
}

/// Ajoute un élément à la fin de son parent (ou de la racine), ou juste
/// après un autre.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    input: CreateStructureNodeInput,
) -> AppResult<StructureNode> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;

    let created = structure_service::create_node(
        &pool,
        project_type,
        input.parent_id.as_deref(),
        input.level,
        &input.title,
        input.after_id.as_deref(),
    )
    .await?;
    history::record(&pool, "created", "structureNode", &created.id, &created.title, "").await;
    Ok(created)
}

#[derive(Debug, Deserialize)]
pub struct UpdateStructureNodeInput {
    pub title: Option<String>,
    pub summary: Option<String>,
    /// Faux : élément hors numérotation (prologue, interlude…).
    pub numbered: Option<bool>,
    /// Numéro choisi (numérotation non automatique).
    pub number: Option<i64>,
}

/// Modifie le titre, le résumé et/ou la numérotation d'un élément.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    input: UpdateStructureNodeInput,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;

    history::snapshot_before(&pool, "structureNode", &node_id).await;
    let saved = structure_service::update_node(
        &pool,
        &node_id,
        input.title.as_deref(),
        input.summary.as_deref(),
        input.numbered,
        input.number,
    )
    .await?;
    history::record(&pool, "updated", "structureNode", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Monte ou descend un élément parmi ceux de même parent.
#[tauri::command(rename_all = "camelCase")]
pub async fn move_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    direction: MoveDirection,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;

    let result = structure_service::move_node(&pool, &node_id, direction).await;
    if result.is_ok() {
        history::touch_day(&pool).await;
    }
    result
}

/// Supprime un élément et tout ce qu'il contient.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;

    let trash_id = structure_service::delete_node(&pool, &node_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}