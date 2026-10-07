//! Service d'authentification.
//!
//! Gère le hachage des mots de passe, la vérification des identifiants
//! et la création de sessions.

use crate::error::{AppError, AppResult};
use crate::models::user::{Role, UserPublic};
use crate::services::session_service;
use crate::services::user_service;
use crate::state::AppState;
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

/// Hache un mot de passe avec Argon2id et un sel unique.
///
/// Le hash retourné est au format PHC (contient déjà le sel encodé).
/// On retourne également le sel brut pour information et compatibilité,
/// mais le hash seul suffit pour la vérification.
fn hash_password(password: &str) -> AppResult<(String, String)> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::internal(e).with_detail("Échec du hachage du mot de passe"))?
        .to_string();
    Ok((password_hash, salt.to_string()))
}

/// Vérifie un mot de passe contre un hash et un sel stockés.
///
/// Le hash au format PHC contient déjà le sel. Le paramètre `_salt`
/// est conservé pour compatibilité avec la signature existante,
/// mais n'est pas utilisé par Argon2 pour la vérification.
fn verify_password(password: &str, hash: &str, _salt: &str) -> AppResult<bool> {
    let parsed_hash = argon2::PasswordHash::new(hash)
        .map_err(|e| AppError::internal(e).with_detail("Hash de mot de passe invalide"))?;
    let argon2 = Argon2::default();
    Ok(argon2
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Enregistre un nouvel utilisateur dans la base de données.
///
/// Le premier utilisateur créé obtient automatiquement le rôle `Admin`.
pub async fn register_user(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
) -> AppResult<UserPublic> {
    // Validation de base (le frontend fait aussi des vérifications)
    if username.len() < 3 {
        return Err(AppError::validation(
            "Le nom d'utilisateur doit contenir au moins 3 caractères.",
        ));
    }
    if password.len() < 8 {
        return Err(AppError::validation(
            "Le mot de passe doit contenir au moins 8 caractères.",
        ));
    }

    // Vérifier l'unicité du nom d'utilisateur
    if user_service::find_by_username(pool, username).await?.is_some() {
        return Err(AppError::conflict(
            "Ce nom d'utilisateur est déjà utilisé.",
        ));
    }

    let (password_hash, password_salt) = hash_password(password)?;
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let id = Uuid::new_v4().to_string();

    // Le premier utilisateur créé est administrateur
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    let role = if user_count.0 == 0 {
        Role::Admin
    } else {
        Role::User
    };

    sqlx::query(
        r#"
        INSERT INTO users (id, username, email, password_hash, password_salt, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(username)
    .bind(email)
    .bind(&password_hash)
    .bind(&password_salt)
    .bind(role.as_str())
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| {
        // On inclut le message d'erreur SQLite réel dans le détail
        // pour faciliter le diagnostic. Le détail n'est jamais envoyé
        // à l'interface, il ne va que dans le journal.
        AppError::database(&e).with_detail(format!(
            "Échec de l'insertion de l'utilisateur : {}",
            e
        ))
    })?;

    user_service::find_by_id(pool, &id)
        .await?
        .map(UserPublic::from)
        .ok_or_else(|| AppError::internal("Utilisateur non trouvé après création"))
}

const USERNAME_MIN_CHARS: usize = 3;
const USERNAME_MAX_CHARS: usize = 50;
const PASSWORD_MIN_CHARS: usize = 8;
const PASSWORD_MAX_CHARS: usize = 128;
const EMAIL_MAX_CHARS: usize = 254;

/// Valide un nom d'utilisateur (règles identiques à celles du frontend).
///
/// 3 à 50 caractères : lettres ASCII, chiffres, `_` et `-`.
pub fn validate_username(username: &str) -> AppResult<()> {
    let length = username.chars().count();

    if !(USERNAME_MIN_CHARS..=USERNAME_MAX_CHARS).contains(&length) {
        return Err(AppError::validation(
            "Le nom d'utilisateur doit contenir entre 3 et 50 caractères.",
        ));
    }

    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(AppError::validation(
            "Le nom d'utilisateur ne peut contenir que des lettres, des chiffres, « _ » et « - ».",
        ));
    }

    Ok(())
}

/// Valide un nouveau mot de passe.
///
/// 8 à 128 caractères, avec au moins une lettre et un chiffre.
/// La limite haute évite de faire hacher des entrées démesurées.
pub fn validate_new_password(password: &str) -> AppResult<()> {
    let length = password.chars().count();

    if length < PASSWORD_MIN_CHARS {
        return Err(AppError::validation(
            "Le mot de passe doit contenir au moins 8 caractères.",
        ));
    }

    if length > PASSWORD_MAX_CHARS {
        return Err(AppError::validation(
            "Le mot de passe ne peut pas dépasser 128 caractères.",
        ));
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());

    if !has_letter || !has_digit {
        return Err(AppError::validation(
            "Le mot de passe doit contenir au moins une lettre et un chiffre.",
        ));
    }

    Ok(())
}

/// Normalise une adresse e-mail facultative.
///
/// Une chaîne vide devient `None`. L'adresse est nettoyée, passée en
/// minuscules et vérifiée de façon élémentaire (la vérification réelle
/// de l'adresse n'existe pas hors connexion).
pub fn normalize_email(email: Option<&str>) -> AppResult<Option<String>> {
    let Some(raw) = email else {
        return Ok(None);
    };

    let trimmed = raw.trim();

    if trimmed.is_empty() {
        return Ok(None);
    }

    let looks_valid = trimmed.chars().count() <= EMAIL_MAX_CHARS
        && !trimmed.chars().any(char::is_whitespace)
        && trimmed.matches('@').count() == 1
        && trimmed
            .split_once('@')
            .map(|(local, domain)| {
                !local.is_empty()
                    && domain.contains('.')
                    && !domain.starts_with('.')
                    && !domain.ends_with('.')
            })
            .unwrap_or(false);

    if !looks_valid {
        return Err(AppError::validation(
            "L'adresse e-mail n'est pas valide.",
        ));
    }

    Ok(Some(trimmed.to_lowercase()))
}

/// Crée un compte avec un rôle précis (usage réservé aux administrateurs).
///
/// La commande appelante vérifie le droit administrateur. Les règles de
/// validation complètes (nom, mot de passe, e-mail) sont appliquées ici.
pub async fn create_user_with_role(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
    role: Role,
) -> AppResult<UserPublic> {
    validate_username(username)?;
    validate_new_password(password)?;

    let email = normalize_email(email)?;

    if let Some(address) = email.as_deref() {
        if user_service::find_by_email(pool, address).await?.is_some() {
            return Err(AppError::conflict(
                "Cette adresse e-mail est déjà utilisée.",
            ));
        }
    }

    let created = register_user(pool, username, password, email.as_deref()).await?;

    if created.role == role {
        return Ok(created);
    }

    let updated = user_service::update_role(pool, &created.id, role).await?;

    Ok(UserPublic::from(updated))
}

/// Change le mot de passe d'un utilisateur après vérification de l'ancien.
pub async fn change_password(
    pool: &SqlitePool,
    user_id: &str,
    current_password: &str,
    new_password: &str,
) -> AppResult<()> {
    let user = user_service::find_by_id(pool, user_id)
        .await?
        .ok_or_else(AppError::unauthorized)?;

    if !verify_password(current_password, &user.password_hash, &user.password_salt)? {
        return Err(AppError::validation(
            "Le mot de passe actuel est incorrect.",
        ));
    }

    validate_new_password(new_password)?;

    if new_password == current_password {
        return Err(AppError::validation(
            "Le nouveau mot de passe doit être différent de l'ancien.",
        ));
    }

    let (password_hash, password_salt) = hash_password(new_password)?;

    user_service::update_password(pool, user_id, &password_hash, &password_salt).await
}

/// Tente de connecter un utilisateur et crée une session.
///
/// En cas de succès, l'utilisateur est stocké dans l'état partagé
/// de l'application pour être accessible aux commandes suivantes.
pub async fn login_user(
    state: &AppState,
    username: &str,
    password: &str,
) -> AppResult<UserPublic> {
    let user = user_service::find_by_username(&state.app_db, username)
        .await?
        .ok_or_else(|| AppError::unauthorized())?;

    if !verify_password(password, &user.password_hash, &user.password_salt)? {
        return Err(AppError::unauthorized());
    }

    // Crée une session en base pour tracer la connexion.
    // Le token retourné n'est pas exposé au frontend pour l'instant.
    // Il sera utilisé plus tard pour renforcer la vérification de session
    // côté Rust, sans dépendre uniquement de l'état en mémoire.
    let token = session_service::create_session(&state.app_db, &user.id).await?;
    let _ = token; // Réservé pour usage futur

    // Stocke l'utilisateur dans l'état partagé de l'application.
    // C'est cet état qui est consulté par `require_user`,
    // `require_admin` et `require_developer` dans state.rs.
    state.set_current_user(Some(user.clone())).await;

    Ok(user.into())
}

/// Déconnecte l'utilisateur actuel.
///
/// Supprime toutes les sessions de l'utilisateur de la base de données
/// et réinitialise l'état partagé.
pub async fn logout_user(state: &AppState) -> AppResult<()> {
    // Supprime les sessions de la base de données
    if let Some(user) = state.current_user().await {
        session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    }

    // Réinitialise l'état de l'utilisateur courant
    state.set_current_user(None).await;

    Ok(())
}