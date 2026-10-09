//! Commandes Tauri des packages (§20) et du mode développeur (§8.3).
//!
//! Les droits sont vérifiés ici, côté Rust :
//! - seul un développeur (ou un administrateur) voit, crée ou modifie ses
//!   packages ; hors mode développeur, la liste est vide ;
//! - tout utilisateur connecté peut supprimer ses propres packages.
//!
//! L'identifiant de l'auteur vient toujours de la session, jamais de
//! l'interface.

use crate::error::{AppError, AppResult};
use crate::models::package::{ThemeData, UserPackage};
use crate::models::user::{Role, UserPublic};
use crate::services::{package_service, user_service};
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

/// Contenu d'un thème envoyé par l'éditeur de thème.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePackageInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub theme: ThemeData,
}

/// Passe le compte connecté au rôle développeur (« Devenir Développeur »).
///
/// Sans effet pour un développeur ou un administrateur : un administrateur
/// a déjà tous les droits d'un développeur et ne perd jamais son rôle ici.
#[tauri::command(rename_all = "camelCase")]
pub async fn become_developer(state: State<'_, AppState>) -> AppResult<UserPublic> {
    let current = state.require_user().await?;

    if current.role != Role::User {
        return Ok(UserPublic::from(current));
    }

    let updated = user_service::update_role(&state.app_db, &current.id, Role::Developer).await?;

    // Garde la session en mémoire synchronisée avec la base.
    state.set_current_user(Some(updated.clone())).await;

    tracing::info!(user = %updated.username, "Mode développeur activé");

    Ok(UserPublic::from(updated))
}

/// Repasse le compte connecté au rôle utilisateur (« Quitter le mode
/// développeur »).
///
/// Les thèmes créés sont conservés : ils réapparaissent si le compte
/// redevient développeur. Sans effet pour un utilisateur ; refusé pour un
/// administrateur, qui ne peut pas perdre son rôle par ce biais.
#[tauri::command(rename_all = "camelCase")]
pub async fn leave_developer_mode(state: State<'_, AppState>) -> AppResult<UserPublic> {
    let current = state.require_user().await?;

    match current.role {
        Role::User => return Ok(UserPublic::from(current)),
        Role::Admin => {
            return Err(AppError::validation(
                "Un administrateur conserve toujours les outils de développement.",
            )
            .with_key("user.adminKeepsDeveloper"))
        }
        Role::Developer => {}
    }

    let updated = user_service::update_role(&state.app_db, &current.id, Role::User).await?;

    state.set_current_user(Some(updated.clone())).await;

    tracing::info!(user = %updated.username, "Mode développeur désactivé");

    Ok(UserPublic::from(updated))
}

/// Packages créés par le compte connecté.
///
/// Liste vide hors mode développeur : un utilisateur ne voit que les
/// thèmes système. Ses créations restent en base et réapparaissent s'il
/// redevient développeur.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_my_packages(state: State<'_, AppState>) -> AppResult<Vec<UserPackage>> {
    let user = state.require_user().await?;

    if user.role == Role::User {
        return Ok(Vec::new());
    }

    package_service::list_for_owner(&state.app_db, &user).await
}

/// Crée un thème (développeur ou administrateur).
#[tauri::command(rename_all = "camelCase")]
pub async fn create_theme_package(
    state: State<'_, AppState>,
    input: ThemePackageInput,
) -> AppResult<UserPackage> {
    let user = state.require_developer().await?;

    package_service::create_theme(
        &state.app_db,
        &user,
        &input.name,
        &input.description,
        input.theme,
    )
    .await
}

/// Modifie un thème du compte connecté (développeur ou administrateur).
#[tauri::command(rename_all = "camelCase")]
pub async fn update_theme_package(
    state: State<'_, AppState>,
    package_id: String,
    input: ThemePackageInput,
) -> AppResult<UserPackage> {
    let user = state.require_developer().await?;

    package_service::update_theme(
        &state.app_db,
        &user,
        &package_id,
        &input.name,
        &input.description,
        input.theme,
    )
    .await
}

/// Supprime un package du compte connecté.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_package(state: State<'_, AppState>, package_id: String) -> AppResult<()> {
    let user = state.require_user().await?;

    package_service::delete(&state.app_db, &user.id, &package_id).await
}
