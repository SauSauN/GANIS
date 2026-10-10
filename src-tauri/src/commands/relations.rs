//! Commandes Tauri des relations entre personnages (voir
//! `services::relation_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que l'utilisateur connecté en est le propriétaire.

use crate::error::AppResult;
use crate::services::project_storage;
use crate::services::relation_service::{self, GraphPosition, Relation, RelationInput};
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

/// Base du projet, après vérification du propriétaire.
async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Toutes les relations du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_relations(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<Relation>> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::list_relations(&pool).await
}

/// Crée une relation.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_relation(
    state: State<'_, AppState>,
    project_id: String,
    input: RelationInput,
) -> AppResult<Relation> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::create_relation(&pool, &input).await
}

/// Remplace une relation.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_relation(
    state: State<'_, AppState>,
    project_id: String,
    relation_id: String,
    input: RelationInput,
) -> AppResult<Relation> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::update_relation(&pool, &relation_id, &input).await
}

/// Supprime une relation.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_relation(
    state: State<'_, AppState>,
    project_id: String,
    relation_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::delete_relation(&pool, &relation_id).await
}

/// Positions des personnages dans la disposition libre du graphe.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_graph_positions(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<GraphPosition>> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::get_positions(&pool).await
}

/// Enregistre des positions de la disposition libre.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_graph_positions(
    state: State<'_, AppState>,
    project_id: String,
    positions: Vec<GraphPosition>,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::save_positions(&pool, &positions).await
}

/// Efface la disposition libre.
#[tauri::command(rename_all = "camelCase")]
pub async fn clear_graph_positions(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    relation_service::clear_positions(&pool).await
}
