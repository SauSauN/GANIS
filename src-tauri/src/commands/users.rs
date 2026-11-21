//! Commandes Tauri liées à la gestion des utilisateurs.

use crate::error::AppResult;
use crate::models::user::{AuthorProfile, UserPublic};
use crate::services::{auth_service, project_storage, user_service};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

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

/// Met à jour l'adresse e-mail de l'utilisateur connecté.
///
/// L'adresse est chiffrée avec la clé du compte. Une valeur vide la
/// supprime.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_profile(
    state: State<'_, AppState>,
    input: UpdateProfileInput,
) -> AppResult<UserPublic> {
    let (current, account_key) = state.require_session().await?;

    let email = auth_service::normalize_email(input.email.as_deref())?;

    let sealed = email
        .as_deref()
        .map(|address| user_service::seal_email(&account_key, &current.id, address))
        .transpose()?;

    let stored =
        user_service::update_email(&state.app_db, &current.id, sealed.as_deref())
            .await?;

    // Garde la session en mémoire synchronisée avec la base.
    let updated = state.refresh_current_user(stored).await?;

    Ok(UserPublic::from(updated))
}

/// Met à jour le profil d'auteur de l'utilisateur connecté (nom d'auteur,
/// nom complet, site web, biographie).
///
/// Le profil est chiffré avec la clé du compte. Tous les champs vides
/// l'effacent.
#[tauri::command(rename_all = "camelCase")]
pub async fn update_author_profile(
    state: State<'_, AppState>,
    profile: AuthorProfile,
) -> AppResult<UserPublic> {
    let (current, account_key) = state.require_session().await?;

    let profile = user_service::normalize_profile(profile)?;
    let sealed = user_service::seal_profile(&account_key, &current.id, &profile)?;

    let stored =
        user_service::update_profile_sealed(&state.app_db, &current.id, sealed.as_deref()).await?;

    // Garde la session en mémoire synchronisée avec la base.
    let updated = state.refresh_current_user(stored).await?;

    Ok(UserPublic::from(updated))
}

/// Change le mot de passe de l'utilisateur connecté.
#[tauri::command(rename_all = "camelCase")]
pub async fn change_password(
    state: State<'_, AppState>,
    input: ChangePasswordInput,
) -> AppResult<()> {
    auth_service::change_password(&state, &input.current_password, &input.new_password)
        .await
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountInput {
    pub password: String,
}

/// Supprime le compte connecté (mot de passe demandé), ses projets privés
/// et leurs données. La session est fermée.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_account(
    state: State<'_, AppState>,
    input: DeleteAccountInput,
) -> AppResult<()> {
    let project_ids = auth_service::delete_own_account(&state, &input.password).await?;

    for project_id in project_ids {
        project_storage::delete_storage(&state, &project_id).await;
    }

    Ok(())
}
