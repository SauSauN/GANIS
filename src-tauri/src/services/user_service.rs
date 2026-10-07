//! Service de gestion des utilisateurs.

use crate::error::{AppError, AppResult};
use crate::models::user::User;
use sqlx::SqlitePool;

/// Récupère un utilisateur par son ID.
pub async fn find_by_id(pool: &SqlitePool, id: &str) -> AppResult<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, role, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la recherche de l'utilisateur par ID"))?;
    Ok(user)
}

/// Récupère un utilisateur par son nom d'utilisateur.
pub async fn find_by_username(pool: &SqlitePool, username: &str) -> AppResult<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, role, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE username = ?
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la recherche de l'utilisateur par nom"))?;
    Ok(user)
}

/// Liste tous les utilisateurs (pour l'administration).
pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<User>> {
    let users = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, role, password_hash, password_salt, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::database(e).with_detail("Échec de la liste des utilisateurs"))?;
    Ok(users)
}