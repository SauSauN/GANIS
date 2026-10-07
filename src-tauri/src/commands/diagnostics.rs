//! Commandes Tauri liées au diagnostic technique.

use crate::error::AppResult;
use crate::services::diagnostics_service::{self, Diagnostics};
use crate::state::AppState;
use tauri::State;

/// Retourne le rapport de diagnostic de l'application.
///
/// Réservé aux rôles administrateur et développeur : le contrôle est
/// effectué côté Rust, indépendamment de l'interface.
#[tauri::command]
pub async fn get_diagnostics(
    state: State<'_, AppState>,
) -> AppResult<Diagnostics> {
    state.require_developer().await?;

    diagnostics_service::collect(&state.app_db).await
}