//! Service de gestion des utilisateurs.

use crate::error::{AppError, AppResult};
use crate::models::user::{Role, User};
use crate::security::{aad, crypto, crypto::SecretKey};
use sqlx::SqlitePool;

// ----------------------------------------------------------------------------
// E-mail chiffré
// ----------------------------------------------------------------------------

fn email_aad(user_id: &str) -> String {
    aad::field("users", "email", user_id)
}

/// Chiffre l'adresse e-mail d'un compte avec la clé de ce compte.
pub fn seal_email(key: &SecretKey, user_id: &str, email: &str) -> AppResult<String> {
    crypto::seal_text(key, &email_aad(user_id), email)
}

/// Déchiffre l'adresse e-mail d'un utilisateur lu en base.
///
/// Un compte pas encore chiffré garde son adresse en clair : elle est
/// alors conservée telle quelle.
pub fn reveal(mut user: User, key: &SecretKey) -> AppResult<User> {
    if let Some(sealed) = user.email_sealed.take() {
        user.email = Some(crypto::open_text(key, &email_aad(&user.id), &sealed)?);
    }

    Ok(user)
}

/// Récupère un utilisateur par son identifiant.
pub async fn find_by_id(pool: &SqlitePool, id: &str) -> AppResult<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT
            id,
            username,
            email,
            email_sealed,
            role,
            password_hash,
            password_salt,
            created_at,
            updated_at
        FROM users
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        AppError::database(e)
            .with_detail("Échec de la recherche de l'utilisateur par identifiant")
    })?;

    Ok(user)
}

/// Récupère un utilisateur par son nom d'utilisateur.
pub async fn find_by_username(
    pool: &SqlitePool,
    username: &str,
) -> AppResult<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT
            id,
            username,
            email,
            email_sealed,
            role,
            password_hash,
            password_salt,
            created_at,
            updated_at
        FROM users
        WHERE username = ?
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        AppError::database(e)
            .with_detail("Échec de la recherche de l'utilisateur par nom")
    })?;

    Ok(user)
}

/// Liste tous les utilisateurs.
///
/// Cette fonction est appelée uniquement par une commande qui vérifie
/// auparavant les droits administrateur.
pub async fn list_all(pool: &SqlitePool) -> AppResult<Vec<User>> {
    let users = sqlx::query_as::<_, User>(
        r#"
        SELECT
            id,
            username,
            email,
            email_sealed,
            role,
            password_hash,
            password_salt,
            created_at,
            updated_at
        FROM users
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| {
        AppError::database(e).with_detail("Échec de la liste des utilisateurs")
    })?;

    Ok(users)
}

/// Compte les comptes ayant le rôle administrateur.
pub async fn count_admins(pool: &SqlitePool) -> AppResult<i64> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE role = 'admin'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| {
        AppError::database(e)
            .with_detail("Échec du comptage des administrateurs")
    })?;

    Ok(count)
}

/// Met à jour le rôle d'un utilisateur.
///
/// Refuse de retirer le rôle administrateur au dernier administrateur :
/// l'application doit toujours conserver au moins un compte capable
/// de gérer les comptes locaux.
pub async fn update_role(
    pool: &SqlitePool,
    id: &str,
    role: Role,
) -> AppResult<User> {
    let target = find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"))?;

    if target.role == Role::Admin
        && role != Role::Admin
        && count_admins(pool).await? <= 1
    {
        return Err(AppError::validation(
            "Impossible de retirer le rôle du dernier administrateur.",
        ).with_key("user.lastAdminRole"));
    }

    let result = sqlx::query(
        r#"
        UPDATE users
        SET role = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(role.as_str())
    .bind(crate::utils::now_utc())
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(e).with_detail("Échec de la mise à jour du rôle")
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"));
    }

    find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::internal("Utilisateur introuvable après la mise à jour."))
}

/// Met à jour l'adresse e-mail chiffrée d'un utilisateur (`None` la
/// supprime). La colonne en clair est vidée.
pub async fn update_email(
    pool: &SqlitePool,
    id: &str,
    email_sealed: Option<&str>,
) -> AppResult<User> {
    let result = sqlx::query(
        r#"
        UPDATE users
        SET email = NULL, email_sealed = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(email_sealed)
    .bind(crate::utils::now_utc())
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(e).with_detail("Échec de la mise à jour de l'e-mail")
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"));
    }

    find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::internal("Utilisateur introuvable après la mise à jour."))
}

/// Remplace le hash du mot de passe d'un utilisateur.
///
/// S'exécute sur la connexion fournie : l'appelant l'enchaîne, dans une
/// même transaction, avec le remplacement du verrou « mot de passe ».
pub async fn update_password(
    conn: &mut sqlx::SqliteConnection,
    id: &str,
    password_hash: &str,
    password_salt: &str,
) -> AppResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE users
        SET password_hash = ?, password_salt = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(password_hash)
    .bind(password_salt)
    .bind(crate::utils::now_utc())
    .bind(id)
    .execute(conn)
    .await
    .map_err(|e| {
        AppError::database(e)
            .with_detail("Échec de la mise à jour du mot de passe")
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"));
    }

    Ok(())
}

/// Supprime un utilisateur.
///
/// Ses sessions et ses projets sont supprimés par les clés étrangères
/// `ON DELETE CASCADE`. Refuse de supprimer le dernier administrateur.
pub async fn delete_by_id(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let target = find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"))?;

    if target.role == Role::Admin && count_admins(pool).await? <= 1 {
        return Err(AppError::validation(
            "Impossible de supprimer le dernier administrateur.",
        ).with_key("user.lastAdminDelete"));
    }

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::database(e)
                .with_detail("Échec de la suppression de l'utilisateur")
        })?;

    Ok(())
}
