//! Commandes Tauri liées à la gestion des utilisateurs.

use crate::error::{AppError, AppResult};
use crate::models::user::{Role, UserPublic};
use crate::services::{auth_service, user_service};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

/// Données de création d'un compte par un administrateur.
#[derive(Debug, Deserialize)]
pub struct CreateUserInput {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub role: Role,
}

/// Données de mise à jour du profil de l'utilisateur connecté.
#[derive(Debug, Deserialize)]
pub struct UpdateProfileInput {
    pub email: Option<String>,
}

/// Données de changement de mot de passe.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordInput {
    pub current_password: String,
    pub new_password: String,
}

/// Liste tous les utilisateurs locaux.
///
/// Cette commande est strictement réservée aux administrateurs.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_users(
    state: State<'_, AppState>,
) -> AppResult<Vec<UserPublic>> {
    state.require_admin().await?;

    let users = user_service::list_all(&state.app_db).await?;

    Ok(users.into_iter().map(UserPublic::from).collect())
}

/// Crée un compte local avec le rôle demandé.
///
/// Réservé aux administrateurs.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_user(
    state: State<'_, AppState>,
    input: CreateUserInput,
) -> AppResult<UserPublic> {
    state.require_admin().await?;

    auth_service::create_user_with_role(
        &state.app_db,
        &input.username,
        &input.password,
        input.email.as_deref(),
        input.role,
    )
    .await
}

/// Modifie le rôle d'un utilisateur.
///
/// Le contrôle d'autorisation est effectué côté Rust.
/// Un administrateur ne peut pas modifier son propre rôle depuis cette commande,
/// afin d'éviter de perdre immédiatement ses privilèges pendant l'opération.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_user_role(
    state: State<'_, AppState>,
    user_id: String,
    role: String,
) -> AppResult<UserPublic> {
    let administrator = state.require_admin().await?;

    if administrator.id == user_id {
        return Err(AppError::validation(
            "Vous ne pouvez pas modifier votre propre rôle.",
        ));
    }

    let normalized_role = role.trim().to_lowercase();

    let new_role = match normalized_role.as_str() {
        "admin" => Role::Admin,
        "developer" => Role::Developer,
        "user" => Role::User,
        _ => {
            return Err(AppError::validation(
                "Le rôle demandé n'est pas valide.",
            ))
        }
    };

    let updated_user =
        user_service::update_role(&state.app_db, &user_id, new_role).await?;

    Ok(UserPublic::from(updated_user))
}

/// Supprime un compte local, avec ses sessions et ses projets.
///
/// Réservé aux administrateurs. Un administrateur ne peut pas supprimer
/// son propre compte, ni le dernier compte administrateur.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_user(
    state: State<'_, AppState>,
    user_id: String,
) -> AppResult<()> {
    let administrator = state.require_admin().await?;

    if administrator.id == user_id {
        return Err(AppError::validation(
            "Vous ne pouvez pas supprimer votre propre compte.",
        ));
    }

    user_service::delete_by_id(&state.app_db, &user_id).await
}

/// Met à jour l'adresse e-mail de l'utilisateur connecté.
///
/// Une valeur vide supprime l'adresse.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_profile(
    state: State<'_, AppState>,
    input: UpdateProfileInput,
) -> AppResult<UserPublic> {
    let current = state.require_user().await?;

    let email = auth_service::normalize_email(input.email.as_deref())?;

    if let Some(address) = email.as_deref() {
        if let Some(owner) =
            user_service::find_by_email(&state.app_db, address).await?
        {
            if owner.id != current.id {
                return Err(AppError::conflict(
                    "Cette adresse e-mail est déjà utilisée.",
                ));
            }
        }
    }

    let updated =
        user_service::update_email(&state.app_db, &current.id, email.as_deref())
            .await?;

    // Garde la session en mémoire synchronisée avec la base.
    state.set_current_user(Some(updated.clone())).await;

    Ok(UserPublic::from(updated))
}

/// Change le mot de passe de l'utilisateur connecté.
#[tauri::command(rename_all = "camelCase")]
pub async fn change_password(
    state: State<'_, AppState>,
    input: ChangePasswordInput,
) -> AppResult<()> {
    let current = state.require_user().await?;

    auth_service::change_password(
        &state.app_db,
        &current.id,
        &input.current_password,
        &input.new_password,
    )
    .await
}