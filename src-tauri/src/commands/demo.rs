//! Commandes Tauri des projets d'exemple (voir `services::demo_service`).
//!
//! L'exemple est créé dans l'espace de la personne qui utilise GANIS : un
//! projet privé pour un compte connecté, un projet public sinon — comme
//! « Nouveau projet ».

use crate::error::AppResult;
use crate::services::demo_service::{self, DemoOutcome, DemoSummary};
use crate::state::AppState;
use tauri::State;

/// Exemples disponibles et, pour chacun, le projet déjà créé dans l'espace
/// courant.
#[tauri::command]
pub async fn list_demo_projects(state: State<'_, AppState>) -> AppResult<Vec<DemoSummary>> {
    let viewer = state.viewer().await;
    demo_service::list(&state.app_db, &viewer).await
}

/// Crée un exemple, ou rend le projet déjà créé (jamais de doublon, rien
/// n'est remplacé).
#[tauri::command]
pub async fn create_demo_project(state: State<'_, AppState>, demo_id: String) -> AppResult<DemoOutcome> {
    let viewer = state.viewer().await;
    demo_service::create(&state, &viewer, &demo_id).await
}
