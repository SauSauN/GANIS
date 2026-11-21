//! Commandes Tauri du cadrage des images (voir `services::image_frame_service`).

use crate::error::AppResult;
use crate::services::image_frame_service::{self, Frame, ImageFrame};
use crate::services::project_storage;
use crate::state::AppState;
use tauri::State;

/// Tous les cadrages d'images du projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_image_frames(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<ImageFrame>> {
    image_frame_service::list(&project_storage::pool_for_request(&state, &project_id).await?).await
}

/// Cadrage d'une image ; `null` : de nouveau centrée, sans zoom.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_image_frame(state: State<'_, AppState>, project_id: String, key: String, frame: Option<Frame>) -> AppResult<()> {
    image_frame_service::set(&project_storage::pool_for_request(&state, &project_id).await?, &key, frame).await
}
