//! Service d'authentification.
//!
//! Création des comptes, connexion, déconnexion et changement de mot de passe.
//!
//! Toutes les règles de validation sont appliquées ici, côté Rust. L'interface
//! les vérifie aussi, mais uniquement pour le confort de l'utilisateur.
//!
//! Trois façons de créer un compte, chacune avec une condition vérifiée
//! dans la même requête SQL que l'insertion (donc sans condition de course) :
//!
//! | Fonction                 | Rôle            | Condition                       |
//! |--------------------------|-----------------|---------------------------------|
//! | `setup_first_admin`      | Administrateur  | aucun compte n'existe encore    |
//! | `register_user`          | Utilisateur     | un administrateur existe déjà   |
//! | `create_user_with_role`  | au choix        | aucune (réservé aux admins)     |

use crate::db::app_db;
use crate::error::{AppError, AppResult};
use crate::models::user::{Role, UserPublic};
use crate::services::{session_service, user_service};
use crate::state::AppState;
use crate::utils::{new_id, now_utc};
use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::Argon2;
use sqlx::SqlitePool;
use std::sync::OnceLock;

const USERNAME_MIN_CHARS: usize = 3;
const USERNAME_MAX_CHARS: usize = 50;
const PASSWORD_MIN_CHARS: usize = 8;
const PASSWORD_MAX_CHARS: usize = 128;
const EMAIL_MAX_CHARS: usize = 254;

// ----------------------------------------------------------------------------
// Mots de passe
// ----------------------------------------------------------------------------

/// Hache un mot de passe avec Argon2id et un sel unique.
///
/// Le hash retourné est au format PHC (il contient déjà le sel). Le sel est
/// aussi retourné à part, pour remplir la colonne `password_salt`.
fn hash_password(password: &str) -> AppResult<(String, String)> {
    let salt = SaltString::generate(&mut OsRng);

    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::internal(e).with_detail("Échec du hachage du mot de passe"))?
        .to_string();

    Ok((password_hash, salt.to_string()))
}

/// Vérifie un mot de passe contre un hash au format PHC.
fn verify_password(password: &str, hash: &str) -> AppResult<bool> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::internal(e).with_detail("Hash de mot de passe invalide"))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// Hash factice, calculé une seule fois.
///
/// Sert à faire une vérification Argon2 même quand le nom d'utilisateur est
/// inconnu : la réponse prend alors autant de temps que pour un vrai compte,
/// ce qui empêche de deviner les comptes existants en mesurant le temps.
fn dummy_hash() -> &'static str {
    static DUMMY: OnceLock<String> = OnceLock::new();

    DUMMY.get_or_init(|| {
        hash_password("ganis-mot-de-passe-factice-0")
            .map(|(hash, _)| hash)
            .unwrap_or_default()
    })
}

// ----------------------------------------------------------------------------
// Validation (règles identiques à celles du frontend)
// ----------------------------------------------------------------------------

/// Valide un nom d'utilisateur.
///
/// 3 à 50 caractères : lettres ASCII, chiffres, `_` et `-`.
pub fn validate_username(username: &str) -> AppResult<()> {
    let length = username.chars().count();

    if !(USERNAME_MIN_CHARS..=USERNAME_MAX_CHARS).contains(&length) {
        return Err(AppError::validation(
            "Le nom d'utilisateur doit contenir entre 3 et 50 caractères.",
        ).with_key("auth.usernameLength"));
    }

    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(AppError::validation(
            "Le nom d'utilisateur ne peut contenir que des lettres, des chiffres, « _ » et « - ».",
        ).with_key("auth.usernameChars"));
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
        ).with_key("auth.passwordTooShort"));
    }

    if length > PASSWORD_MAX_CHARS {
        return Err(AppError::validation(
            "Le mot de passe ne peut pas dépasser 128 caractères.",
        ).with_key("auth.passwordTooLong"));
    }

    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());

    if !has_letter || !has_digit {
        return Err(AppError::validation(
            "Le mot de passe doit contenir au moins une lettre et un chiffre.",
        ).with_key("auth.passwordLetterDigit"));
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
        return Err(AppError::validation("L'adresse e-mail n'est pas valide.").with_key("auth.emailInvalid"));
    }

    Ok(Some(trimmed.to_lowercase()))
}

// ----------------------------------------------------------------------------
// Création de comptes
// ----------------------------------------------------------------------------

/// Condition vérifiée par SQLite au moment même de l'insertion.
#[derive(Debug, Clone, Copy)]
enum Precondition {
    /// Aucune condition.
    None,
    /// La table `users` doit être vide (premier administrateur).
    NoUserYet,
    /// Au moins un administrateur doit exister (inscription publique).
    AdminExists,
}

impl Precondition {
    fn sql(self) -> &'static str {
        match self {
            Precondition::None => "1",
            Precondition::NoUserYet => "NOT EXISTS (SELECT 1 FROM users)",
            Precondition::AdminExists => {
                "EXISTS (SELECT 1 FROM users WHERE role = 'admin')"
            }
        }
    }

    fn failure(self) -> AppError {
        match self {
            Precondition::None => {
                AppError::internal("Insertion d'utilisateur ignorée sans condition")
            }
            Precondition::NoUserYet => already_configured(),
            Precondition::AdminExists => setup_not_done(),
        }
    }
}

fn already_configured() -> AppError {
    AppError::conflict("La configuration initiale a déjà été effectuée.").with_key("auth.setupDone")
}

fn setup_not_done() -> AppError {
    AppError::validation(
        "La configuration initiale de GANIS n'est pas terminée : créez d'abord le compte administrateur.",
    ).with_key("auth.setupRequired")
}

fn username_taken() -> AppError {
    AppError::conflict("Ce nom d'utilisateur est déjà utilisé.").with_key("auth.usernameTaken")
}

fn email_taken() -> AppError {
    AppError::conflict("Cette adresse e-mail est déjà utilisée.").with_key("auth.emailTaken")
}

/// Convertit une erreur d'insertion en erreur lisible.
///
/// Les contraintes d'unicité restent la garantie finale si deux créations
/// simultanées passent les vérifications préalables.
fn map_insert_error(error: sqlx::Error) -> AppError {
    if let Some(db_error) = error.as_database_error() {
        if db_error.is_unique_violation() {
            return if db_error.message().contains("users.email") {
                email_taken()
            } else {
                username_taken()
            };
        }
    }

    AppError::database(&error)
        .with_detail(format!("Échec de l'insertion de l'utilisateur : {error}"))
}

/// Valide les données et crée le compte si `precondition` est remplie.
async fn create_account(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
    role: Role,
    precondition: Precondition,
) -> AppResult<UserPublic> {
    let username = username.trim();

    validate_username(username)?;
    validate_new_password(password)?;

    let email = normalize_email(email)?;

    // Vérifications préalables, pour un message clair.
    if user_service::find_by_username(pool, username).await?.is_some() {
        return Err(username_taken());
    }

    if let Some(address) = email.as_deref() {
        if user_service::find_by_email(pool, address).await?.is_some() {
            return Err(email_taken());
        }
    }

    let (password_hash, password_salt) = hash_password(password)?;
    let id = new_id();
    let now = now_utc();

    // INSERT … SELECT … WHERE : la condition et l'insertion forment une
    // seule instruction SQLite, donc une seule opération atomique.
    let sql = format!(
        "INSERT INTO users \
            (id, username, email, password_hash, password_salt, role, created_at, updated_at) \
         SELECT ?, ?, ?, ?, ?, ?, ?, ? \
         WHERE {}",
        precondition.sql()
    );

    let result = sqlx::query(&sql)
        .bind(&id)
        .bind(username)
        .bind(email.as_deref())
        .bind(&password_hash)
        .bind(&password_salt)
        .bind(role.as_str())
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(map_insert_error)?;

    if result.rows_affected() == 0 {
        return Err(precondition.failure());
    }

    tracing::info!(role = role.as_str(), "Compte utilisateur créé");

    user_service::find_by_id(pool, &id)
        .await?
        .map(UserPublic::from)
        .ok_or_else(|| AppError::internal("Utilisateur non trouvé après création"))
}

/// Crée le premier compte administrateur (configuration initiale, §37.9).
///
/// Échoue si un compte existe déjà, y compris lorsque deux demandes
/// arrivent en même temps : une seule peut aboutir.
pub async fn setup_first_admin(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
) -> AppResult<UserPublic> {
    if app_db::has_any_user(pool).await? {
        return Err(already_configured());
    }

    create_account(
        pool,
        username,
        password,
        email,
        Role::Admin,
        Precondition::NoUserYet,
    )
    .await
}

/// Inscription publique : crée toujours un compte « Utilisateur ».
///
/// Refusée tant que la configuration initiale n'a pas créé
/// le compte administrateur.
pub async fn register_user(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
) -> AppResult<UserPublic> {
    if user_service::count_admins(pool).await? == 0 {
        return Err(setup_not_done());
    }

    create_account(
        pool,
        username,
        password,
        email,
        Role::User,
        Precondition::AdminExists,
    )
    .await
}

/// Crée un compte avec un rôle précis.
///
/// Réservé aux administrateurs : la commande appelante vérifie ce droit.
pub async fn create_user_with_role(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
    role: Role,
) -> AppResult<UserPublic> {
    create_account(pool, username, password, email, role, Precondition::None).await
}

// ----------------------------------------------------------------------------
// Mot de passe
// ----------------------------------------------------------------------------

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

    if !verify_password(current_password, &user.password_hash)? {
        return Err(AppError::validation(
            "Le mot de passe actuel est incorrect.",
        ).with_key("auth.currentPasswordWrong"));
    }

    validate_new_password(new_password)?;

    if new_password == current_password {
        return Err(AppError::validation(
            "Le nouveau mot de passe doit être différent de l'ancien.",
        ).with_key("auth.passwordUnchanged"));
    }

    let (password_hash, password_salt) = hash_password(new_password)?;

    user_service::update_password(pool, user_id, &password_hash, &password_salt).await
}

// ----------------------------------------------------------------------------
// Connexion / déconnexion
// ----------------------------------------------------------------------------

/// Tente de connecter un utilisateur et crée une session.
///
/// - Les tentatives sont limitées par nom d'utilisateur (§8.4).
/// - Nom inconnu et mot de passe faux donnent le même message et prennent
///   le même temps, pour ne pas révéler quels comptes existent.
pub async fn login_user(
    state: &AppState,
    username: &str,
    password: &str,
) -> AppResult<UserPublic> {
    let username = username.trim();

    state.login_throttle.check(username)?;

    let candidate = user_service::find_by_username(&state.app_db, username).await?;

    let authenticated = match candidate {
        Some(user) => {
            if verify_password(password, &user.password_hash)? {
                Some(user)
            } else {
                None
            }
        }
        None => {
            // Même coût de calcul qu'une vraie vérification.
            let _ = verify_password(password, dummy_hash());
            None
        }
    };

    let Some(user) = authenticated else {
        state.login_throttle.record_failure(username);
        tracing::warn!("Échec de connexion");

        return Err(AppError::invalid_credentials());
    };

    state.login_throttle.record_success(username);

    // Crée une session en base pour tracer la connexion.
    // Le jeton n'est pas encore exposé à l'interface : il servira à
    // renforcer la vérification de session côté Rust.
    let _token = session_service::create_session(&state.app_db, &user.id).await?;

    // C'est cet état qui est consulté par `require_user`,
    // `require_admin` et `require_developer` dans state.rs.
    state.set_current_user(Some(user.clone())).await;

    tracing::info!("Connexion réussie");

    Ok(user.into())
}

/// Déconnecte l'utilisateur actuel.
///
/// Supprime toutes les sessions de l'utilisateur de la base de données
/// et réinitialise l'état partagé.
pub async fn logout_user(state: &AppState) -> AppResult<()> {
    if let Some(user) = state.current_user().await {
        session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    }

    state.set_current_user(None).await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rules() {
        assert!(validate_username("alice_01").is_ok());
        assert!(validate_username("jean-marc").is_ok());
        assert!(validate_username("al").is_err());
        assert!(validate_username("alice bob").is_err());
        assert!(validate_username("élodie").is_err());
        assert!(validate_username(&"a".repeat(51)).is_err());
    }

    #[test]
    fn password_rules() {
        assert!(validate_new_password("motdepasse1").is_ok());
        assert!(validate_new_password("court1").is_err());
        assert!(validate_new_password("seulementdeslettres").is_err());
        assert!(validate_new_password("12345678").is_err());
        assert!(validate_new_password(&format!("a1{}", "x".repeat(127))).is_err());
    }

    #[test]
    fn email_rules() {
        assert_eq!(normalize_email(None).unwrap(), None);
        assert_eq!(normalize_email(Some("   ")).unwrap(), None);
        assert_eq!(
            normalize_email(Some(" Alice@Exemple.FR ")).unwrap(),
            Some("alice@exemple.fr".to_string())
        );
        assert!(normalize_email(Some("alice@exemple")).is_err());
        assert!(normalize_email(Some("a b@exemple.fr")).is_err());
        assert!(normalize_email(Some("a@@exemple.fr")).is_err());
    }

    #[test]
    fn password_hash_roundtrip() {
        let (hash, _) = hash_password("secret123").unwrap();

        assert!(verify_password("secret123", &hash).unwrap());
        assert!(!verify_password("autre123", &hash).unwrap());
    }

    #[test]
    fn dummy_hash_is_valid() {
        assert!(PasswordHash::new(dummy_hash()).is_ok());
    }
}
