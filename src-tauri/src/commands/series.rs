//! Commandes Tauri du scénario de série (voir `services::series_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que le projet est public ou appartient au compte
//! connecté. Les modifications sont inscrites au journal du projet.

use crate::error::AppResult;
use crate::services::history_service as history;
use crate::services::project_storage;
use crate::services::series_service::{self, EpisodeFields, SceneBlock, SceneScript, SceneScriptInput};
use crate::services::structure_service::StructureNode;
use crate::state::AppState;
use tauri::State;

/// Scénario d'une scène : en-tête et éléments.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_scene_script(state: State<'_, AppState>, project_id: String, scene_id: String) -> AppResult<SceneScript> {
    series_service::scene_script(&project_storage::pool_for_request(&state, &project_id).await?, &scene_id).await
}

/// Enregistre le scénario d'une scène d'un bloc (l'état précédent reste dans les versions).
#[tauri::command(rename_all = "camelCase")]
pub async fn save_scene_script(
    state: State<'_, AppState>,
    project_id: String,
    scene_id: String,
    input: SceneScriptInput,
) -> AppResult<SceneScript> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    history::snapshot_before(&pool, "structureNode", &scene_id).await;
    let saved = series_service::save_scene_script(&pool, &scene_id, &input).await?;
    history::record(&pool, "updated", "structureNode", &saved.scene.id, &saved.scene.title, "").await;
    Ok(saved)
}

/// Tout le scénario du projet (lecture, export, suivi).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_series_blocks(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<SceneBlock>> {
    series_service::series_blocks(&project_storage::pool_for_request(&state, &project_id).await?).await
}

/// Logline, durée visée, statut et scénariste d'un épisode.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_series_episode(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    fields: EpisodeFields,
) -> AppResult<StructureNode> {
    let pool = project_storage::pool_for_request(&state, &project_id).await?;
    history::snapshot_before(&pool, "structureNode", &node_id).await;
    let saved = series_service::set_episode_fields(&pool, &node_id, &fields).await?;
    history::record(&pool, "updated", "structureNode", &saved.id, &saved.title, "").await;
    Ok(saved)
}
