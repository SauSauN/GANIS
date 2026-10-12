//! Commandes Tauri liées à la gestion des utilisateurs.

use crate::error::{AppError, AppResult};
use crate::models::user::{Role, UserPublic};
use crate::services::{auth_service, project_service, project_storage, user_service};
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
        ).with_key("user.ownRole"));
    }

    let normalized_role = role.trim().to_lowercase();

    let new_role = match normalized_role.as_str() {
        "admin" => Role::Admin,
        "developer" => Role::Developer,
        "user" => Role::User,
        _ => {
            return Err(AppError::validation(
                "Le rôle demandé n'est pas valide.",
            ).with_key("user.invalidRole"))
        }
    };

    let updated_user =
        user_service::update_role(&state.app_db, &user_id, new_role).await?;

    Ok(UserPublic::from(updated_user))
}

/// Supprime un compte local, avec ses sessions, ses projets et les
/// données de ces projets.
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
        ).with_key("user.deleteSelf"));
    }

    // Les projets sont relevés avant la suppression : une fois le compte
    // supprimé, la base de l'application ne les connaît plus.
    // Seuls leurs identifiants sont lus : l'administrateur n'a pas la clé
    // de ce compte et ne peut rien en déchiffrer.
    let project_ids =
        project_service::list_project_ids_for_user(&state.app_db, &user_id).await?;

    user_service::delete_by_id(&state.app_db, &user_id).await?;

    for project_id in project_ids {
        project_storage::delete_storage(&state, &project_id).await;
    }

    Ok(())
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

/// Change le mot de passe de l'utilisateur connecté.
#[tauri::command(rename_all = "camelCase")]
pub async fn change_password(
    state: State<'_, AppState>,
    input: ChangePasswordInput,
) -> AppResult<()> {
    auth_service::change_password(&state, &input.current_password, &input.new_password)
        .await
}
