//! Service d'authentification.
//!
//! Création des comptes, connexion, déconnexion, changement de mot de passe
//! et récupération d'un compte avec sa clé de récupération.
//!
//! Chaque compte a une clé de compte qui chiffre ses données (voir
//! `security`). Elle est créée avec le compte, ouverte à chaque connexion
//! par le mot de passe, et peut aussi être ouverte par la clé de
//! récupération si le mot de passe est oublié.
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
use crate::models::user::{Role, User, UserPublic};
use crate::security::crypto::SecretKey;
use crate::security::recovery_key::RecoveryKey;
use crate::services::keyring_service::{self, NewKeyring, NewSlot, SlotKind};
use crate::services::{project_storage, session_service, user_service};
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

/// Compte créé, avec sa clé de récupération éventuelle, à montrer une seule
/// fois (voir `keyring_service::RECOVERY_KEY_ON_SIGNUP`).
pub struct CreatedAccount {
    pub user: UserPublic,
    pub recovery_key: Option<RecoveryKey>,
}

/// Valide les données et crée le compte si `precondition` est remplie.
///
/// Avec `keyring`, le trousseau du compte (clé de compte, verrous mot de
/// passe et clé de récupération) est créé dans la même transaction que le
/// compte, et l'e-mail est chiffré. Sans trousseau (compte créé par un
/// administrateur), il sera créé à la première connexion de l'utilisateur :
/// l'administrateur ne voit donc jamais sa clé de récupération.
async fn create_account(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
    role: Role,
    precondition: Precondition,
    keyring: bool,
) -> AppResult<(UserPublic, Option<RecoveryKey>)> {
    let username = username.trim();

    validate_username(username)?;
    validate_new_password(password)?;

    let email = normalize_email(email)?;

    // Vérification préalable, pour un message clair.
    //
    // L'unicité des adresses e-mail n'est plus vérifiée : elles sont
    // chiffrées, chaque compte avec sa propre clé, donc impossibles à
    // comparer. Un serveur de récupération pourra la garantir plus tard.
    if user_service::find_by_username(pool, username).await?.is_some() {
        return Err(username_taken());
    }

    let id = new_id();
    let now = now_utc();

    // Calculs coûteux (Argon2) avant la transaction.
    let (password_hash, password_salt) = hash_password(password)?;

    let new_keyring: Option<NewKeyring> = if keyring {
        Some(keyring_service::build_keyring(
            &id,
            password,
            keyring_service::RECOVERY_KEY_ON_SIGNUP,
        )?)
    } else {
        None
    };

    let (plain_email, sealed_email) = match (&new_keyring, email.as_deref()) {
        (Some(k), Some(address)) => (
            None,
            Some(user_service::seal_email(&k.account_key, &id, address)?),
        ),
        (Some(_), None) => (None, None),
        (None, address) => (address.map(str::to_owned), None),
    };

    let mut tx = pool.begin().await?;

    // INSERT … SELECT … WHERE : la condition et l'insertion forment une
    // seule instruction SQLite, donc une seule opération atomique.
    let sql = format!(
        "INSERT INTO users \
            (id, username, email, email_sealed, password_hash, password_salt, role, created_at, updated_at) \
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? \
         WHERE {}",
        precondition.sql()
    );

    let result = sqlx::query(&sql)
        .bind(&id)
        .bind(username)
        .bind(plain_email.as_deref())
        .bind(sealed_email.as_deref())
        .bind(&password_hash)
        .bind(&password_salt)
        .bind(role.as_str())
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(map_insert_error)?;

    if result.rows_affected() == 0 {
        return Err(precondition.failure());
    }

    if let Some(k) = &new_keyring {
        for slot in &k.slots {
            keyring_service::insert_slot(&mut tx, &id, slot).await?;
        }
    }

    tx.commit().await?;

    tracing::info!(role = role.as_str(), "Compte utilisateur créé");

    let stored = user_service::find_by_id(pool, &id)
        .await?
        .ok_or_else(|| AppError::internal("Utilisateur non trouvé après création"))?;

    let mut user = UserPublic::from(stored);
    user.email = email;

    Ok((user, new_keyring.and_then(|k| k.recovery_key)))
}

fn with_recovery_key(
    (user, recovery_key): (UserPublic, Option<RecoveryKey>),
) -> AppResult<CreatedAccount> {
    Ok(CreatedAccount { user, recovery_key })
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
) -> AppResult<CreatedAccount> {
    if app_db::has_any_user(pool).await? {
        return Err(already_configured());
    }

    with_recovery_key(
        create_account(
            pool,
            username,
            password,
            email,
            Role::Admin,
            Precondition::NoUserYet,
            true,
        )
        .await?,
    )
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
) -> AppResult<CreatedAccount> {
    if user_service::count_admins(pool).await? == 0 {
        return Err(setup_not_done());
    }

    with_recovery_key(
        create_account(
            pool,
            username,
            password,
            email,
            Role::User,
            Precondition::AdminExists,
            true,
        )
        .await?,
    )
}

/// Crée un compte avec un rôle précis.
///
/// Réservé aux administrateurs : la commande appelante vérifie ce droit.
/// Le trousseau du compte sera créé à la première connexion de
/// l'utilisateur, qui recevra alors lui-même sa clé de récupération.
pub async fn create_user_with_role(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
    role: Role,
) -> AppResult<UserPublic> {
    create_account(pool, username, password, email, role, Precondition::None, false)
        .await
        .map(|(user, _)| user)
}

// ----------------------------------------------------------------------------
// Mot de passe
// ----------------------------------------------------------------------------

fn current_password_wrong() -> AppError {
    AppError::validation("Le mot de passe actuel est incorrect.")
        .with_key("auth.currentPasswordWrong")
}

/// Change le mot de passe de l'utilisateur connecté après vérification de
/// l'ancien.
///
/// Seul le verrou « mot de passe » est remplacé : la clé du compte, et
/// donc tous les projets, restent les mêmes. Le hash et le verrou sont
/// changés dans une même transaction.
pub async fn change_password(
    state: &AppState,
    current_password: &str,
    new_password: &str,
) -> AppResult<()> {
    let (session_user, account_key) = state.require_session().await?;

    let user = user_service::find_by_id(&state.app_db, &session_user.id)
        .await?
        .ok_or_else(AppError::unauthorized)?;

    if !verify_password(current_password, &user.password_hash)? {
        return Err(current_password_wrong());
    }

    validate_new_password(new_password)?;

    if new_password == current_password {
        return Err(AppError::validation(
            "Le nouveau mot de passe doit être différent de l'ancien.",
        ).with_key("auth.passwordUnchanged"));
    }

    set_password(&state.app_db, &user.id, new_password, &account_key).await?;

    tracing::info!("Mot de passe modifié");

    Ok(())
}

/// Remplace le mot de passe d'un compte : hash de connexion et verrou de
/// la clé du compte, dans une même transaction.
async fn set_password(
    pool: &SqlitePool,
    user_id: &str,
    new_password: &str,
    account_key: &SecretKey,
) -> AppResult<()> {
    let (password_hash, password_salt) = hash_password(new_password)?;
    let slot = NewSlot::seal(
        user_id,
        SlotKind::Password,
        new_password.as_bytes(),
        account_key,
    )?;

    let mut tx = pool.begin().await?;

    user_service::update_password(&mut tx, user_id, &password_hash, &password_salt).await?;
    keyring_service::replace_slot(&mut tx, user_id, &slot).await?;

    tx.commit().await?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Connexion / déconnexion
// ----------------------------------------------------------------------------

/// Résultat d'une connexion réussie.
pub struct LoginOutcome {
    pub user: UserPublic,
    /// Présente uniquement si le compte vient d'être chiffré à cette
    /// connexion (compte créé avant le chiffrement, ou par un
    /// administrateur) et que les clés de récupération sont activées
    /// (`RECOVERY_KEY_ON_SIGNUP`) : elle doit être montrée une seule fois.
    pub recovery_key: Option<RecoveryKey>,
}

/// Tente de connecter un utilisateur, ouvre la clé de son compte et crée
/// une session.
///
/// - Les tentatives sont limitées par nom d'utilisateur (§8.4).
/// - Nom inconnu et mot de passe faux donnent le même message et prennent
///   le même temps, pour ne pas révéler quels comptes existent.
/// - Un compte sans trousseau (antérieur au chiffrement) reçoit le sien
///   maintenant, et ses projets sont chiffrés.
pub async fn login_user(
    state: &AppState,
    username: &str,
    password: &str,
) -> AppResult<LoginOutcome> {
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

    // Clé du compte : ouverte par le mot de passe, ou créée si le compte
    // n'a pas encore de trousseau.
    let (account_key, recovery_key) =
        match keyring_service::unlock(&state.app_db, &user.id, SlotKind::Password, password.as_bytes())
            .await?
        {
            Some(Some(key)) => (key, None),
            Some(None) => {
                // Le mot de passe est juste mais n'ouvre pas le verrou : les
                // deux ne sont plus en accord. Cela ne peut venir que d'une
                // modification extérieure de la base.
                return Err(AppError::internal(
                    "Verrou du compte en désaccord avec le mot de passe",
                ));
            }
            None => {
                create_missing_keyring(&state.app_db, &user, password).await?
            }
        };

    let user = user_service::reveal(user, &account_key)?;

    // Crée une session en base pour tracer la connexion.
    // Le jeton n'est pas encore exposé à l'interface : il servira à
    // renforcer la vérification de session côté Rust.
    let _token = session_service::create_session(&state.app_db, &user.id).await?;

    // C'est cet état qui est consulté par `require_user`,
    // `require_admin`, `require_developer` et `require_session` (state.rs).
    state.open_session(user.clone(), account_key.clone()).await;

    // Projets antérieurs au chiffrement : chiffrés maintenant. Un échec
    // n'empêche pas la connexion ; le projet sera chiffré à son ouverture.
    project_storage::encrypt_legacy_projects(state, &user.id, &account_key).await;

    tracing::info!("Connexion réussie");

    Ok(LoginOutcome {
        user: user.into(),
        recovery_key,
    })
}

/// Crée le trousseau d'un compte qui n'en a pas encore, et chiffre son
/// adresse e-mail.
///
/// Les verrous sont insérés sans remplacement : si deux connexions
/// simultanées s'y essaient, la seconde échoue au lieu d'écraser une clé
/// de compte peut-être déjà utilisée.
async fn create_missing_keyring(
    pool: &SqlitePool,
    user: &User,
    password: &str,
) -> AppResult<(SecretKey, Option<RecoveryKey>)> {
    let keyring = keyring_service::build_keyring(
        &user.id,
        password,
        keyring_service::RECOVERY_KEY_ON_SIGNUP,
    )?;

    let sealed_email = match user.email.as_deref() {
        Some(address) => Some(user_service::seal_email(&keyring.account_key, &user.id, address)?),
        None => user.email_sealed.clone(),
    };

    let mut tx = pool.begin().await?;

    for slot in &keyring.slots {
        keyring_service::insert_slot(&mut tx, &user.id, slot).await?;
    }

    sqlx::query("UPDATE users SET email = NULL, email_sealed = ? WHERE id = ?")
        .bind(sealed_email.as_deref())
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    tracing::info!("Trousseau du compte créé");

    Ok((keyring.account_key, keyring.recovery_key))
}

/// Déconnecte l'utilisateur actuel.
///
/// Supprime toutes les sessions de l'utilisateur de la base de données,
/// efface la clé du compte de la mémoire et ferme ses projets.
pub async fn logout_user(state: &AppState) -> AppResult<()> {
    if let Some(user) = state.current_user().await {
        session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    }

    state.close_session().await;

    Ok(())
}

// ----------------------------------------------------------------------------
// Clé de récupération
// ----------------------------------------------------------------------------

fn invalid_recovery() -> AppError {
    AppError::new(
        crate::error::ErrorCode::Unauthorized,
        "Nom d'utilisateur ou clé de récupération incorrect.",
    )
    .with_key("recovery.invalid")
}

/// Mot de passe oublié : la clé de récupération ouvre la clé du compte, et
/// un nouveau mot de passe la referme. Tous les projets sont conservés.
///
/// Mêmes protections que la connexion : tentatives limitées, même message
/// et même temps de réponse que le compte existe ou non. Les sessions du
/// compte sont fermées.
pub async fn recover_account(
    state: &AppState,
    username: &str,
    recovery_key: &str,
    new_password: &str,
) -> AppResult<()> {
    let username = username.trim();

    state.recovery_throttle.check(username)?;

    // Vérifications sans coût, qui ne révèlent rien sur le compte.
    validate_new_password(new_password)?;
    let recovery_key = RecoveryKey::parse(recovery_key)?;

    let candidate = user_service::find_by_username(&state.app_db, username).await?;

    let unlocked = match &candidate {
        Some(user) => {
            match keyring_service::unlock(
                &state.app_db,
                &user.id,
                SlotKind::Recovery,
                recovery_key.secret_bytes(),
            )
            .await?
            {
                Some(result) => result,
                None => {
                    // Compte sans trousseau : aucune clé de récupération
                    // n'existe. Même coût qu'un vrai essai.
                    keyring_service::burn_equivalent_work(recovery_key.secret_bytes());
                    None
                }
            }
        }
        None => {
            keyring_service::burn_equivalent_work(recovery_key.secret_bytes());
            None
        }
    };

    let (Some(user), Some(account_key)) = (candidate, unlocked) else {
        state.recovery_throttle.record_failure(username);
        tracing::warn!("Échec de récupération de compte");

        return Err(invalid_recovery());
    };

    state.recovery_throttle.record_success(username);
    state.login_throttle.record_success(username);

    set_password(&state.app_db, &user.id, new_password, &account_key).await?;

    // Toute session ouverte de ce compte est fermée.
    session_service::delete_user_sessions(&state.app_db, &user.id).await?;

    if state.current_user().await.is_some_and(|current| current.id == user.id) {
        state.close_session().await;
    }

    tracing::info!("Compte récupéré avec la clé de récupération");

    Ok(())
}

/// Crée la clé de récupération du compte connecté, ou la remplace (ancienne
/// perdue ou exposée). L'ancienne cesse aussitôt de fonctionner.
///
/// Le mot de passe actuel est demandé, comme pour toute opération sensible.
pub async fn regenerate_recovery_key(
    state: &AppState,
    current_password: &str,
) -> AppResult<RecoveryKey> {
    let (session_user, account_key) = state.require_session().await?;

    let user = user_service::find_by_id(&state.app_db, &session_user.id)
        .await?
        .ok_or_else(AppError::unauthorized)?;

    if !verify_password(current_password, &user.password_hash)? {
        return Err(current_password_wrong());
    }

    let recovery_key = RecoveryKey::generate();
    let slot = NewSlot::seal(
        &user.id,
        SlotKind::Recovery,
        recovery_key.secret_bytes(),
        &account_key,
    )?;

    let mut conn = state.app_db.acquire().await?;
    keyring_service::replace_slot(&mut conn, &user.id, &slot).await?;

    tracing::info!("Nouvelle clé de récupération créée");

    Ok(recovery_key)
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
