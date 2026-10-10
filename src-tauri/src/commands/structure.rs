//! Commandes Tauri du découpage du récit (voir `services::structure_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::{AppError, AppResult};
use crate::services::structure_service::{self, MoveDirection, Structure, StructureNode};
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

/// Découpage complet du projet (modèle et éléments).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_structure(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Structure> {
    let user = state.require_user().await?;
    let pool = project_storage::pool_for_user(&state, &project_id, &user.id).await?;

    // Le type du projet n'est pas chiffré : pas besoin de la clé du compte.
    let project = project_service::find_stored(&state.app_db, &project_id, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;

    structure_service::get_structure(&pool, project.project_type).await
}

/// Choisit le modèle de découpage (`null` : il suit le type du projet).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_template(
    state: State<'_, AppState>,
    project_id: String,
    template: Option<String>,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;

    structure_service::set_template(&pool, template.as_deref()).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStructureNodeInput {
    pub parent_id: Option<String>,
    pub level: i64,
    pub title: String,
}

/// Ajoute un élément à la fin de son parent (ou de la racine).
#[tauri::command(rename_all = "camelCase")]
pub async fn create_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    input: CreateStructureNodeInput,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;

    structure_service::create_node(&pool, input.parent_id.as_deref(), input.level, &input.title)
        .await
}

#[derive(Debug, Deserialize)]
pub struct UpdateStructureNodeInput {
    pub title: Option<String>,
    pub summary: Option<String>,
}

/// Modifie le titre et/ou le résumé d'un élément.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    input: UpdateStructureNodeInput,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;

    structure_service::update_node(&pool, &node_id, input.title.as_deref(), input.summary.as_deref())
        .await
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

    structure_service::move_node(&pool, &node_id, direction).await
}

/// Supprime un élément et tout ce qu'il contient.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_structure_node(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;

    structure_service::delete_node(&pool, &node_id).await
}
