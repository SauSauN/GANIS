//! Commandes Tauri liées à l'authentification.

use crate::error::AppResult;
use crate::models::user::UserPublic;
use crate::services::auth_service;
use crate::state::AppState;
use tauri::State;

/// Enregistre un nouvel utilisateur.
#[tauri::command]
pub async fn register(
    state: State<'_, AppState>,
    input: RegisterInput,
) -> AppResult<UserPublic> {
    auth_service::register_user(
        &state.app_db,
        &input.username,
        &input.password,
        input.email.as_deref(),
    )
    .await
}

/// Connecte un utilisateur existant.
#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    input: LoginInput,
) -> AppResult<UserPublic> {
    auth_service::login_user(&state, &input.username, &input.password).await
}

/// Déconnecte l'utilisateur actuel.
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> AppResult<()> {
    auth_service::logout_user(&state).await
}

/// Indique si un compte administrateur existe déjà.
#[tauri::command]
pub async fn has_any_user(state: State<'_, AppState>) -> AppResult<bool> {
    crate::db::app_db::has_any_user(&state.app_db).await
}

/// Crée le premier compte administrateur
/// uniquement si aucun utilisateur n'existe.
#[tauri::command]
pub async fn setup_admin(
    state: State<'_, AppState>,
    input: RegisterInput,
) -> AppResult<UserPublic> {
    // Vérifie qu'aucun utilisateur n'existe.
    if crate::db::app_db::has_any_user(&state.app_db).await? {
        return Err(crate::error::AppError::conflict(
            "Un compte administrateur existe déjà.",
        ));
    }

    auth_service::register_user(
        &state.app_db,
        &input.username,
        &input.password,
        input.email.as_deref(),
    )
    .await
}

// ----------------------------------------------------------------------------
// Types d'entrée pour les commandes
// ----------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
pub struct RegisterInput {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}