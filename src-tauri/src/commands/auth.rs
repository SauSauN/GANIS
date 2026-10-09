//! Commandes Tauri liées à l'authentification.

use crate::error::AppResult;
use crate::models::user::UserPublic;
use crate::services::auth_service;
use crate::state::AppState;
use tauri::State;

/// Inscription publique.
///
/// Crée toujours un compte « Utilisateur ». Refusée tant que la
/// configuration initiale (compte administrateur) n'est pas faite.
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
///
/// Les tentatives sont limitées (voir `services::login_throttle`).
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

/// Indique si au moins un compte existe.
///
/// `false` signifie que la configuration initiale doit être lancée.
#[tauri::command]
pub async fn has_any_user(state: State<'_, AppState>) -> AppResult<bool> {
    crate::db::app_db::has_any_user(&state.app_db).await
}

/// Crée le premier compte administrateur (configuration initiale).
///
/// Ne réussit que si aucun compte n'existe. La vérification et la
/// création sont atomiques : deux demandes simultanées ne peuvent pas
/// créer deux administrateurs.
#[tauri::command]
pub async fn setup_admin(
    state: State<'_, AppState>,
    input: RegisterInput,
) -> AppResult<UserPublic> {
    auth_service::setup_first_admin(
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
