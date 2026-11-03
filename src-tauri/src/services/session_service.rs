//! Service de gestion des sessions utilisateur.
//!
//! Les sessions sont stockées en base de données avec un hash de token.
//! Le token brut n'est jamais stocké.

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc, now_unix};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Durée de vie d'une session en secondes (7 jours).
const SESSION_DURATION: i64 = 7 * 24 * 60 * 60;

/// Crée une nouvelle session pour un utilisateur.
/// Retourne le token brut (à ne pas stocker) et enregistre le hash en base.
pub async fn create_session(pool: &SqlitePool, user_id: &str) -> AppResult<String> {
    // Génère un token aléatoire
    let token = Uuid::new_v4().to_string();
    // Hache le token avec SHA-256
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = format!("{:x}", hasher.finalize());

    let id = new_id();
    let expires_at = now_unix() + SESSION_DURATION;
    let created_at = now_utc();

    sqlx::query(
        r#"
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .bind(&created_at)
    .execute(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la création de la session"))?;

    Ok(token)
}

/// Supprime toutes les sessions d'un utilisateur.
pub async fn delete_user_sessions(pool: &SqlitePool, user_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM sessions WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::database(e).with_detail("Échec de la suppression des sessions"))?;
    Ok(())
}