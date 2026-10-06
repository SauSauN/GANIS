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
fn verify_password(password: &str, hash: &str, _salt: &str) -> AppResult<bool> {
    let parsed_hash = argon2::PasswordHash::new(hash)
        .map_err(|e| AppError::internal(e).with_detail("Hash de mot de passe invalide"))?;
    let argon2 = Argon2::default();
    Ok(argon2
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Enregistre un nouvel utilisateur dans la base de données.
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
    .map_err(|e| AppError::database(e).with_detail("Échec de l'insertion de l'utilisateur"))?;

    user_service::find_by_id(pool, &id)
        .await?
        .map(UserPublic::from)
        .ok_or_else(|| AppError::internal("Utilisateur non trouvé après création"))
}

/// Tente de connecter un utilisateur et crée une session.
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

    // Crée une session en base
    let token = session_service::create_session(&state.app_db, &user.id).await?;

    // Stocke l'utilisateur et le token dans l'état partagé
    // Note: Le token est stocké côté Rust pour être vérifié plus tard.
    // Le frontend ne le voit pas directement, il passe par les commandes.
    state.set_current_user(Some(user.clone())).await;
    // On pourrait aussi stocker le token dans l'état, mais pour l'instant
    // le simple fait d'avoir un utilisateur connecté suffit.
    // Pour une vraie vérification de session, il faudrait le token.
    let _ = token; // Gardé pour usage futur

    Ok(user.into())
}

/// Déconnecte l'utilisateur actuel.
pub async fn logout_user(state: &AppState) -> AppResult<()> {
    // Supprime la session de la base de données
    if let Some(user) = state.current_user().await {
        session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    }
    state.set_current_user(None).await;
    Ok(())
}