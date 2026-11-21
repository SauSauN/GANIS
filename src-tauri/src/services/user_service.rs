//! Service de gestion des utilisateurs.

use crate::error::{AppError, AppResult};
use crate::models::user::{AuthorProfile, Role, User};
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

    if let Some(sealed) = user.profile_sealed.take() {
        let json = crypto::open_text(key, &profile_aad(&user.id), &sealed)?;
        // Profil illisible (format inconnu) : on repart d'un profil vide plutôt que de bloquer la connexion.
        user.profile = serde_json::from_str(&json).unwrap_or_default();
    }

    Ok(user)
}

// ----------------------------------------------------------------------------
// Profil d'auteur chiffré
// ----------------------------------------------------------------------------

fn profile_aad(user_id: &str) -> String {
    aad::field("users", "profile", user_id)
}

/// Nettoie un profil saisi : espaces retirés aux bords, longueurs vérifiées.
pub fn normalize_profile(profile: AuthorProfile) -> AppResult<AuthorProfile> {
    let clean = AuthorProfile {
        pen_name: profile.pen_name.trim().to_string(),
        full_name: profile.full_name.trim().to_string(),
        website: profile.website.trim().to_string(),
        bio: profile.bio.trim().to_string(),
    };

    let too_long = clean.pen_name.chars().count() > AuthorProfile::MAX_NAME
        || clean.full_name.chars().count() > AuthorProfile::MAX_NAME
        || clean.website.chars().count() > AuthorProfile::MAX_WEBSITE
        || clean.bio.chars().count() > AuthorProfile::MAX_BIO;

    if too_long {
        return Err(AppError::validation("Un champ du profil est trop long.").with_key("profile.tooLong"));
    }

    Ok(clean)
}

/// Chiffre le profil d'auteur d'un compte (`None` s'il est vide).
pub fn seal_profile(key: &SecretKey, user_id: &str, profile: &AuthorProfile) -> AppResult<Option<String>> {
    if profile.is_empty() {
        return Ok(None);
    }

    let json = serde_json::to_string(profile)
        .map_err(|e| AppError::internal(format!("Profil illisible : {e}")))?;
    Ok(Some(crypto::seal_text(key, &profile_aad(user_id), &json)?))
}

/// Enregistre le profil d'auteur chiffré d'un utilisateur (`None` l'efface).
pub async fn update_profile_sealed(pool: &SqlitePool, id: &str, profile_sealed: Option<&str>) -> AppResult<User> {
    let result = sqlx::query("UPDATE users SET profile_sealed = ?, updated_at = ? WHERE id = ?")
        .bind(profile_sealed)
        .bind(crate::utils::now_utc())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| AppError::database(e).with_detail("Échec de la mise à jour du profil"))?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Utilisateur non trouvé.").with_key("user.notFound"));
    }

    find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::internal("Utilisateur introuvable après la mise à jour."))
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
            profile_sealed,
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
            profile_sealed,
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

/// Met à jour le rôle d'un utilisateur (mode développeur).
pub async fn update_role(
    pool: &SqlitePool,
    id: &str,
    role: Role,
) -> AppResult<User> {
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
/// `ON DELETE CASCADE`.
pub async fn delete_by_id(pool: &SqlitePool, id: &str) -> AppResult<()> {
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

#[cfg(test)]
mod profile_tests {
    use super::*;

    fn user(id: &str) -> User {
        User {
            id: id.to_string(),
            username: "auteur".to_string(),
            email: None,
            email_sealed: None,
            profile_sealed: None,
            profile: AuthorProfile::default(),
            role: Role::User,
            password_hash: String::new(),
            password_salt: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn profil_chiffre_puis_dechiffre() {
        let key = SecretKey::generate();
        let profile = AuthorProfile {
            pen_name: "C. Durand".into(),
            full_name: "Camille Durand".into(),
            website: "https://exemple.fr".into(),
            bio: "Autrice de romans policiers.".into(),
        };

        let sealed = seal_profile(&key, "u1", &profile).unwrap().expect("profil non vide");
        assert!(!sealed.contains("Durand"), "le profil ne doit pas être en clair");

        let mut stored = user("u1");
        stored.profile_sealed = Some(sealed.clone());
        assert_eq!(reveal(stored, &key).unwrap().profile, profile);

        // Lié au compte : illisible sous l'identifiant d'un autre compte.
        let mut other = user("u2");
        other.profile_sealed = Some(sealed);
        assert!(reveal(other, &key).is_err());
    }

    #[test]
    fn profil_vide_efface_et_trop_long_refuse() {
        let key = SecretKey::generate();
        assert_eq!(seal_profile(&key, "u1", &AuthorProfile::default()).unwrap(), None);

        let clean = normalize_profile(AuthorProfile { pen_name: "  Nom  ".into(), ..Default::default() }).unwrap();
        assert_eq!(clean.pen_name, "Nom");

        let long = AuthorProfile { bio: "a".repeat(AuthorProfile::MAX_BIO + 1), ..Default::default() };
        assert!(normalize_profile(long).is_err());
    }
}
