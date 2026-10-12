//! Commandes Tauri liées à l'authentification et à la clé de récupération.

use crate::error::AppResult;
use crate::models::user::UserPublic;
use crate::services::auth_service::{self, CreatedAccount, LoginOutcome};
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

/// Compte créé, avec sa clé de récupération.
///
/// La clé n'est envoyée qu'à cet instant : elle n'est stockée nulle part
/// en clair et ne pourra plus jamais être relue.
///
/// `recovery_key` est `null` tant que les clés de récupération ne sont pas
/// activées (`keyring_service::RECOVERY_KEY_ON_SIGNUP`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCreatedResponse {
    pub user: UserPublic,
    pub recovery_key: Option<String>,
}

impl From<CreatedAccount> for AccountCreatedResponse {
    fn from(created: CreatedAccount) -> Self {
        Self {
            user: created.user,
            recovery_key: created.recovery_key.map(|key| key.display()),
        }
    }
}

/// Connexion réussie.
///
/// `recovery_key` n'est présente que si le compte vient d'être chiffré à
/// cette connexion (compte antérieur au chiffrement) : elle doit être
/// montrée une seule fois.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub user: UserPublic,
    pub recovery_key: Option<String>,
}

impl From<LoginOutcome> for LoginResponse {
    fn from(outcome: LoginOutcome) -> Self {
        Self {
            user: outcome.user,
            recovery_key: outcome.recovery_key.map(|key| key.display()),
        }
    }
}

/// Inscription publique.
///
/// Crée toujours un compte « Utilisateur ». Refusée tant que la
/// configuration initiale (compte administrateur) n'est pas faite.
#[tauri::command]
pub async fn register(
    state: State<'_, AppState>,
    input: RegisterInput,
) -> AppResult<AccountCreatedResponse> {
    auth_service::register_user(
        &state.app_db,
        &input.username,
        &input.password,
        input.email.as_deref(),
    )
    .await
    .map(Into::into)
}

/// Connecte un utilisateur existant.
///
/// Les tentatives sont limitées (voir `services::login_throttle`).
#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    input: LoginInput,
) -> AppResult<LoginResponse> {
    auth_service::login_user(&state, &input.username, &input.password)
        .await
        .map(Into::into)
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
) -> AppResult<AccountCreatedResponse> {
    auth_service::setup_first_admin(
        &state.app_db,
        &input.username,
        &input.password,
        input.email.as_deref(),
    )
    .await
    .map(Into::into)
}

/// Mot de passe oublié : choisit un nouveau mot de passe grâce à la clé
/// de récupération. Tous les projets sont conservés.
#[tauri::command]
pub async fn recover_account(
    state: State<'_, AppState>,
    input: RecoverAccountInput,
) -> AppResult<()> {
    auth_service::recover_account(
        &state,
        &input.username,
        &input.recovery_key,
        &input.new_password,
    )
    .await
}

/// Remplace la clé de récupération du compte connecté et retourne la
/// nouvelle (à montrer une seule fois). L'ancienne cesse de fonctionner.
#[tauri::command]
pub async fn regenerate_recovery_key(
    state: State<'_, AppState>,
    input: RegenerateRecoveryKeyInput,
) -> AppResult<String> {
    auth_service::regenerate_recovery_key(&state, &input.current_password)
        .await
        .map(|key| key.display())
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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverAccountInput {
    pub username: String,
    pub recovery_key: String,
    pub new_password: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateRecoveryKeyInput {
    pub current_password: String,
}

// ----------------------------------------------------------------------------
// Fichier de la clé de récupération
// ----------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRecoveryKeyInput {
    pub recovery_key: String,
    pub username: String,
    /// Langue du fichier (`fr` ou `en`).
    pub language: String,
    /// Titre de la fenêtre « Enregistrer sous », déjà traduit.
    pub dialog_title: String,
}

/// Texte du fichier, dans la langue de l'interface.
fn recovery_file_text(language: &str, username: &str, key: &str, date: &str) -> String {
    if language == "en" {
        format!(
            "GANIS — Recovery key\n\
             \n\
             Account: {username}\n\
             Created: {date}\n\
             \n\
             {key}\n\
             \n\
             This key lets you choose a new password if you forget yours,\n\
             without losing your projects. Without your password or this key,\n\
             your projects can never be recovered.\n\
             \n\
             Keep it somewhere safe, away from this computer (on paper, on a\n\
             USB stick or in a password manager). Anyone who has this key and\n\
             access to this computer can open your account.\n"
        )
    } else {
        format!(
            "GANIS — Clé de récupération\n\
             \n\
             Compte : {username}\n\
             Créée le : {date}\n\
             \n\
             {key}\n\
             \n\
             Cette clé permet de choisir un nouveau mot de passe si vous\n\
             oubliez le vôtre, sans perdre vos projets. Sans votre mot de passe\n\
             ni cette clé, vos projets ne pourront jamais être récupérés.\n\
             \n\
             Rangez-la en lieu sûr, hors de cet ordinateur (sur papier, une clé\n\
             USB ou dans un gestionnaire de mots de passe). Toute personne qui\n\
             possède cette clé et accède à cet ordinateur peut ouvrir votre compte.\n"
        )
    }
}

/// Enregistre la clé de récupération dans un fichier texte choisi par
/// l'utilisateur. Retourne `false` s'il a annulé.
///
/// La fenêtre « Enregistrer sous » est ouverte par Rust et le contenu est
/// construit ici : l'interface ne choisit ni l'emplacement ni le texte
/// écrit, seulement une clé qui doit avoir le bon format.
#[tauri::command]
pub async fn save_recovery_key_file(
    app: tauri::AppHandle,
    input: SaveRecoveryKeyInput,
) -> AppResult<bool> {
    use crate::error::AppError;
    use crate::security::recovery_key::RecoveryKey;
    use tauri_plugin_dialog::DialogExt;

    let key = RecoveryKey::parse(&input.recovery_key)?;
    auth_service::validate_username(input.username.trim())?;

    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .set_title(input.dialog_title.chars().take(100).collect::<String>())
        .set_file_name(format!("GANIS-{}-recovery-key.txt", input.username.trim()))
        .add_filter("Texte", &["txt"])
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(path) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre d'enregistrement interrompue"))?
    else {
        return Ok(false);
    };

    let path = path
        .into_path()
        .map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))?;

    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let text = zeroize::Zeroizing::new(recovery_file_text(
        &input.language,
        input.username.trim(),
        &key.display(),
        &date,
    ));

    std::fs::write(&path, text.as_bytes())
        .map_err(|e| AppError::io(&e).with_detail(format!("Écriture du fichier de clé : {e}")))?;

    Ok(true)
}
