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
//! Deux façons de créer un compte, toujours « Utilisateur » (pas
//! d'administrateur : chacun administre ses propres projets). La condition
//! est vérifiée dans la même requête SQL que l'insertion :
//!
//! | Fonction              | Condition                    |
//! |-----------------------|------------------------------|
//! | `setup_first_account` | aucun compte n'existe encore |
//! | `register_user`       | aucune                       |

use crate::db::app_db;
use crate::error::{AppError, AppResult};
use crate::models::user::{Role, User, UserPublic};
use crate::security::crypto::SecretKey;
use crate::security::recovery_key::RecoveryKey;
use crate::services::keyring_service::{self, NewKeyring, NewSlot, SlotKind};
use crate::services::{document_service, history_service, project_storage, session_service, user_service};
use crate::state::AppState;
use crate::utils::{new_id, now_utc, run_blocking};
#[cfg(test)]
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::password_hash::{PasswordHash, PasswordVerifier};
use argon2::Argon2;
use sqlx::SqlitePool;
use zeroize::Zeroizing;

const USERNAME_MIN_CHARS: usize = 3;
const USERNAME_MAX_CHARS: usize = 50;
pub const PASSWORD_MIN_CHARS: usize = 12;
const PASSWORD_MAX_CHARS: usize = 128;
const EMAIL_MAX_CHARS: usize = 254;

// ----------------------------------------------------------------------------
// Mots de passe
// ----------------------------------------------------------------------------
//
// Le mot de passe est vérifié en ouvrant le verrou « mot de passe » du
// compte (Argon2id, 64 Mio, voir `keyring_service`) : s'il s'ouvre, le mot
// de passe est bon. Aucun autre hash du mot de passe n'est gardé, car un
// hash moins coûteux serait la cible d'une personne qui copie `app.db`.
//
// Seuls les comptes d'avant le chiffrement (sans verrou) ont encore un hash
// dans `users.password_hash` : il sert une dernière fois, à la connexion qui
// crée leur verrou, puis il est effacé.

/// Hache un mot de passe avec Argon2id et un sel unique (comptes de test
/// d'avant le chiffrement uniquement).
#[cfg(test)]
fn hash_password(password: &str) -> AppResult<(String, String)> {
    let salt = SaltString::generate(&mut OsRng);

    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::internal(e).with_detail("Échec du hachage du mot de passe"))?
        .to_string();

    Ok((password_hash, salt.to_string()))
}

/// Vérifie un mot de passe contre un hash au format PHC (comptes d'avant le
/// chiffrement). Un hash vide ou illisible ne correspond à rien.
fn verify_legacy_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// [`verify_legacy_password`] sur un fil dédié (Argon2 bloquerait le moteur
/// async).
async fn verify_legacy_password_off_thread(password: &str, hash: &str) -> AppResult<bool> {
    let password = Zeroizing::new(password.to_owned());
    let hash = hash.to_owned();

    run_blocking(move || Ok(verify_legacy_password(&password, &hash))).await
}

/// Résultat de la vérification d'un mot de passe.
enum PasswordCheck {
    /// Mot de passe bon : clé du compte, et clé de récupération si le
    /// verrou vient d'être créé (compte d'avant le chiffrement).
    Valid(SecretKey, Option<RecoveryKey>),
    Invalid,
}

/// Vérifie le mot de passe d'un compte en ouvrant son verrou.
///
/// Un compte d'avant le chiffrement (sans verrou) est vérifié une dernière
/// fois avec son ancien hash ; son verrou est alors créé et le hash effacé.
async fn check_password(pool: &SqlitePool, user: &User, password: &str) -> AppResult<PasswordCheck> {
    match keyring_service::unlock(pool, &user.id, SlotKind::Password, password.as_bytes()).await? {
        Some(Some(key)) => {
            forget_legacy_hash(pool, user).await?;
            Ok(PasswordCheck::Valid(key, None))
        }
        Some(None) => Ok(PasswordCheck::Invalid),
        None => {
            if !verify_legacy_password_off_thread(password, &user.password_hash).await? {
                return Ok(PasswordCheck::Invalid);
            }

            let (key, recovery_key) = create_missing_keyring(pool, user, password).await?;
            Ok(PasswordCheck::Valid(key, recovery_key))
        }
    }
}

/// Efface l'ancien hash du mot de passe (le verrou suffit à le vérifier).
async fn forget_legacy_hash(pool: &SqlitePool, user: &User) -> AppResult<()> {
    if user.password_hash.is_empty() && user.password_salt.is_empty() {
        return Ok(());
    }

    sqlx::query("UPDATE users SET password_hash = '', password_salt = '' WHERE id = ?")
        .bind(&user.id)
        .execute(pool)
        .await
        .map_err(|e| AppError::database(&e).with_detail(format!("Effacement de l'ancien hash : {e}")))?;

    tracing::info!("Ancien hash du mot de passe effacé");
    Ok(())
}

/// Vérifie le mot de passe actuel du compte connecté (opérations sensibles :
/// changer de mot de passe, supprimer le compte…).
///
/// Les essais sont comptés comme ceux de la connexion : une session laissée
/// ouverte ne permet pas de deviner le mot de passe en essayant en boucle.
async fn confirm_current_password(state: &AppState, user: &User, password: &str) -> AppResult<()> {
    state.login_throttle.check(&user.username)?;

    match check_password(&state.app_db, user, password).await? {
        PasswordCheck::Valid(..) => {
            state.login_throttle.record_success(&user.username);
            Ok(())
        }
        PasswordCheck::Invalid => {
            state.login_throttle.record_failure(&user.username);
            Err(current_password_wrong())
        }
    }
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
/// 12 à 128 caractères, avec au moins une lettre et un chiffre, ni trop
/// courant ni construit sur le nom d'utilisateur (voir `weak_passwords`).
/// La limite haute évite de faire hacher des entrées démesurées.
///
/// Les comptes existants gardent leur mot de passe : la règle ne s'applique
/// qu'aux nouveaux mots de passe.
pub fn validate_new_password(password: &str, username: &str) -> AppResult<()> {
    let length = password.chars().count();

    if length < PASSWORD_MIN_CHARS {
        return Err(AppError::validation(
            "Le mot de passe doit contenir au moins 12 caractères.",
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

    if crate::security::weak_passwords::is_weak(password, username) {
        return Err(AppError::validation(
            "Ce mot de passe est trop facile à deviner : évitez les mots courants et votre nom d'utilisateur.",
        ).with_key("auth.passwordWeak"));
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
    /// Aucune condition (inscription publique).
    None,
    /// La table `users` doit être vide (premier compte).
    NoUserYet,
}

impl Precondition {
    fn sql(self) -> &'static str {
        match self {
            Precondition::None => "1",
            Precondition::NoUserYet => "NOT EXISTS (SELECT 1 FROM users)",
        }
    }

    fn failure(self) -> AppError {
        match self {
            Precondition::None => {
                AppError::internal("Insertion d'utilisateur ignorée sans condition")
            }
            Precondition::NoUserYet => already_configured(),
        }
    }
}

fn already_configured() -> AppError {
    AppError::conflict("La configuration initiale a déjà été effectuée.").with_key("auth.setupDone")
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
/// compte, et l'e-mail est chiffré. Sans trousseau, il sera créé à la
/// première connexion de l'utilisateur.
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
    validate_new_password(password, username)?;

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

    // Calculs coûteux (Argon2) avant la transaction. Un compte avec
    // trousseau n'a pas de hash : son verrou vérifie le mot de passe.
    #[cfg(test)]
    let (password_hash, password_salt) = if keyring {
        (String::new(), String::new())
    } else {
        let password = Zeroizing::new(password.to_owned());
        run_blocking(move || hash_password(&password)).await?
    };
    #[cfg(not(test))]
    let (password_hash, password_salt) = (String::new(), String::new());

    let new_keyring: Option<NewKeyring> = if keyring {
        Some(
            keyring_service::build_keyring_off_thread(
                &id,
                password,
                keyring_service::RECOVERY_KEY_ON_SIGNUP,
            )
            .await?,
        )
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

/// Crée le premier compte (configuration initiale, §37.9) : un compte
/// « Utilisateur », comme tous les autres.
///
/// Échoue si un compte existe déjà, y compris lorsque deux demandes
/// arrivent en même temps : une seule peut aboutir.
pub async fn setup_first_account(
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
            Role::User,
            Precondition::NoUserYet,
            true,
        )
        .await?,
    )
}

/// Inscription publique : crée toujours un compte « Utilisateur ».
pub async fn register_user(
    pool: &SqlitePool,
    username: &str,
    password: &str,
    email: Option<&str>,
) -> AppResult<CreatedAccount> {
    with_recovery_key(
        create_account(
            pool,
            username,
            password,
            email,
            Role::User,
            Precondition::None,
            true,
        )
        .await?,
    )
}

/// Tests : compte sans trousseau, comme ceux d'avant le chiffrement.
#[cfg(test)]
pub async fn create_account_without_keyring(
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

    confirm_current_password(state, &user, current_password).await?;

    validate_new_password(new_password, &user.username)?;

    if new_password == current_password {
        return Err(AppError::validation(
            "Le nouveau mot de passe doit être différent de l'ancien.",
        ).with_key("auth.passwordUnchanged"));
    }

    set_password(&state.app_db, &user.id, new_password, &account_key).await?;

    tracing::info!("Mot de passe modifié");

    Ok(())
}

/// Remplace le mot de passe d'un compte : nouveau verrou de la clé du
/// compte, et effacement d'un éventuel ancien hash, dans une même
/// transaction.
async fn set_password(
    pool: &SqlitePool,
    user_id: &str,
    new_password: &str,
    account_key: &SecretKey,
) -> AppResult<()> {
    let (password_hash, password_salt) = ("", "");
    let slot = NewSlot::seal_off_thread(
        user_id,
        SlotKind::Password,
        new_password.as_bytes(),
        account_key,
    )
    .await?;

    let mut tx = pool.begin().await?;

    user_service::update_password(&mut tx, user_id, password_hash, password_salt).await?;
    keyring_service::replace_slot(&mut tx, user_id, &slot).await?;

    tx.commit().await?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Suppression de son propre compte
// ----------------------------------------------------------------------------

/// Supprime le compte connecté, après vérification de son mot de passe.
///
/// Le compte, ses verrous de clé, ses sessions et ses projets privés (y
/// compris ceux de la corbeille) sont effacés ; la session est fermée.
/// Retourne les identifiants des projets supprimés : l'appelant efface
/// leurs dossiers. Les projets publics ne sont pas touchés.
pub async fn delete_own_account(state: &AppState, password: &str) -> AppResult<Vec<String>> {
    let (session_user, _account_key) = state.require_session().await?;

    let user = user_service::find_by_id(&state.app_db, &session_user.id)
        .await?
        .ok_or_else(AppError::unauthorized)?;

    confirm_current_password(state, &user, password).await?;

    let project_ids =
        crate::services::project_service::list_project_ids_for_user(&state.app_db, &user.id).await?;

    session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    user_service::delete_by_id(&state.app_db, &user.id).await?;
    state.close_session().await;

    tracing::info!(projects = project_ids.len(), "Compte supprimé par son titulaire");

    Ok(project_ids)
}

// ----------------------------------------------------------------------------
// Connexion / déconnexion
// ----------------------------------------------------------------------------

/// Résultat d'une connexion réussie.
pub struct LoginOutcome {
    pub user: UserPublic,
    /// Présente uniquement si le compte vient d'être chiffré à cette
    /// connexion (compte créé avant le chiffrement) et que les clés de récupération sont activées
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

    // Le mot de passe est vérifié en ouvrant le verrou du compte. Pour un
    // nom inconnu, un calcul de même coût est fait quand même.
    let authenticated = match candidate {
        Some(user) => match check_password(&state.app_db, &user, password).await? {
            PasswordCheck::Valid(key, recovery_key) => Some((user, key, recovery_key)),
            PasswordCheck::Invalid => None,
        },
        None => {
            keyring_service::burn_equivalent_work(password.as_bytes()).await;
            None
        }
    };

    let Some((user, account_key, recovery_key)) = authenticated else {
        state.login_throttle.record_failure(username);
        tracing::warn!("Échec de connexion");

        return Err(AppError::invalid_credentials());
    };

    state.login_throttle.record_success(username);

    let user = user_service::reveal(user, &account_key)?;

    // Crée une session en base pour tracer la connexion.
    // Le jeton n'est pas encore exposé à l'interface : il servira à
    // renforcer la vérification de session côté Rust.
    let _token = session_service::create_session(&state.app_db, &user.id).await?;

    // C'est cet état qui est consulté par `require_user`,
    // `require_developer` et `require_session` (state.rs).
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
    let keyring = keyring_service::build_keyring_off_thread(
        &user.id,
        password,
        keyring_service::RECOVERY_KEY_ON_SIGNUP,
    )
    .await?;

    let sealed_email = match user.email.as_deref() {
        Some(address) => Some(user_service::seal_email(&keyring.account_key, &user.id, address)?),
        None => user.email_sealed.clone(),
    };

    let mut tx = pool.begin().await?;

    for slot in &keyring.slots {
        keyring_service::insert_slot(&mut tx, &user.id, slot).await?;
    }

    // L'ancien hash du mot de passe est effacé : le verrou le remplace.
    sqlx::query(
        "UPDATE users SET email = NULL, email_sealed = ?, password_hash = '', password_salt = '' \
         WHERE id = ?",
    )
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
        // Tant que la clé du compte est là : dernières modifications des
        // documents ouverts ailleurs reprises dans les projets.
        reclaim_open_documents(state, &user.id).await;
        session_service::delete_user_sessions(&state.app_db, &user.id).await?;
    }

    // Ferme la session ; les copies de travail (en clair) sont supprimées.
    state.close_session().await;

    Ok(())
}

/// Reprend dans leurs projets les documents enregistrés dans une autre
/// application (Word, Acrobat…) depuis leur dernière reprise, avant que
/// leurs copies de travail soient supprimées à la fin de la session.
///
/// Un échec n'empêche pas la déconnexion : il est seulement journalisé.
pub async fn reclaim_open_documents(state: &AppState, owner: &str) {
    for copy in document_service::open_copies_of(&state.data_dir, owner) {
        if let Err(error) = reclaim_open_document(state, &copy).await {
            tracing::warn!(error = %error, "Document ouvert ailleurs non repris");
        }
    }
}

async fn reclaim_open_document(state: &AppState, copy: &document_service::OpenCopy) -> AppResult<()> {
    let (_, bytes) = document_service::check_open_copy(&copy.dir)?;
    let Some(bytes) = bytes else {
        return Ok(());
    };

    let pool = project_storage::pool_for_request(state, &copy.project_id).await?;
    let document = document_service::replace_content(&pool, &copy.document_id, &bytes, None).await?;
    document_service::mark_imported(&copy.dir, &bytes)?;
    history_service::record(&pool, "updated", "document", &document.id, &document.name, &document.node_id).await;

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
    validate_new_password(new_password, username)?;
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
                    keyring_service::burn_equivalent_work(recovery_key.secret_bytes()).await;
                    None
                }
            }
        }
        None => {
            keyring_service::burn_equivalent_work(recovery_key.secret_bytes()).await;
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

    confirm_current_password(state, &user, current_password).await?;

    let recovery_key = RecoveryKey::generate();
    let slot = NewSlot::seal_off_thread(
        &user.id,
        SlotKind::Recovery,
        recovery_key.secret_bytes(),
        &account_key,
    )
    .await?;

    let mut conn = state.app_db.acquire().await?;
    keyring_service::replace_slot(&mut conn, &user.id, &slot).await?;

    tracing::info!("Nouvelle clé de récupération créée");

    Ok(recovery_key)
}

// ----------------------------------------------------------------------------
// Récupération par e-mail (Supabase)
// ----------------------------------------------------------------------------

/// Nombre maximal de secrets essayés par une récupération par e-mail : une
/// même adresse peut servir à plusieurs comptes de cet appareil, mais une
/// liste démesurée bloquerait le calcul (Argon2id à chaque essai).
const EMAIL_RECOVERY_MAX_SECRETS: usize = 10;

/// Secret du verrou « email », à confier au serveur de récupération puis à
/// oublier. `user_id` identifie le compte local dans la table du serveur.
pub struct EmailRecoverySecret {
    pub user_id: String,
    pub secret: Zeroizing<String>,
}

fn email_recovery_login_first() -> AppError {
    AppError::validation(
        "Connectez-vous une première fois avant d'activer la récupération par e-mail.",
    )
    .with_key("emailRecovery.loginFirst")
}

fn invalid_email_recovery() -> AppError {
    AppError::new(
        crate::error::ErrorCode::Unauthorized,
        "Aucun compte de cet appareil ne correspond à ce nom d'utilisateur et à cette adresse e-mail.",
    )
    .with_key("emailRecovery.invalid")
}

/// Active (ou renouvelle) la récupération par e-mail d'un compte.
///
/// Le mot de passe ouvre la clé du compte, qu'un nouveau secret aléatoire
/// referme dans le verrou « email ». Le secret est retourné une seule fois :
/// l'interface l'envoie à Supabase et ne le garde pas. Un ancien secret
/// cesse aussitôt de fonctionner.
///
/// Ne demande pas de session : sert aussi juste après l'inscription, avant
/// la première connexion. Mêmes protections que la connexion (tentatives
/// limitées, même message que le compte existe ou non).
pub async fn enable_email_recovery(
    state: &AppState,
    username: &str,
    password: &str,
) -> AppResult<EmailRecoverySecret> {
    let username = username.trim();

    state.login_throttle.check(username)?;

    let candidate = user_service::find_by_username(&state.app_db, username).await?;

    let unlocked = match &candidate {
        Some(user) => {
            match keyring_service::unlock(
                &state.app_db,
                &user.id,
                SlotKind::Password,
                password.as_bytes(),
            )
            .await?
            {
                Some(result) => result,
                // Compte sans trousseau (créé avant le chiffrement) : il
                // doit d'abord se connecter une fois.
                None => return Err(email_recovery_login_first()),
            }
        }
        None => {
            keyring_service::burn_equivalent_work(password.as_bytes()).await;
            None
        }
    };

    let (Some(user), Some(account_key)) = (candidate, unlocked) else {
        state.login_throttle.record_failure(username);
        tracing::warn!("Échec d'activation de la récupération par e-mail");

        return Err(AppError::invalid_credentials());
    };

    state.login_throttle.record_success(username);

    let secret = SecretKey::generate();
    let slot =
        NewSlot::seal_off_thread(&user.id, SlotKind::Email, secret.as_bytes(), &account_key).await?;

    let mut conn = state.app_db.acquire().await?;
    keyring_service::replace_slot(&mut conn, &user.id, &slot).await?;

    tracing::info!("Récupération par e-mail activée");

    Ok(EmailRecoverySecret {
        user_id: user.id,
        secret: secret.to_base64(),
    })
}

/// Désactive la récupération par e-mail du compte connecté. Le secret
/// gardé par le serveur n'ouvre plus rien.
pub async fn disable_email_recovery(state: &AppState) -> AppResult<()> {
    let (user, _account_key) = state.require_session().await?;

    keyring_service::delete_slot(&state.app_db, &user.id, SlotKind::Email).await?;

    tracing::info!("Récupération par e-mail désactivée");

    Ok(())
}

/// Indique si le compte connecté peut être récupéré par e-mail.
pub async fn has_email_recovery(state: &AppState) -> AppResult<bool> {
    let (user, _account_key) = state.require_session().await?;

    keyring_service::has_slot(&state.app_db, &user.id, SlotKind::Email).await
}

/// Mot de passe oublié, par e-mail : l'interface a vérifié le code envoyé
/// par Supabase, qui lui a rendu les secrets gardés pour cette adresse. Le
/// premier qui ouvre le verrou « email » du compte permet de choisir un
/// nouveau mot de passe. Tous les projets sont conservés.
///
/// Mêmes protections que la récupération par clé.
pub async fn recover_with_email(
    state: &AppState,
    username: &str,
    secrets: &[String],
    new_password: &str,
) -> AppResult<()> {
    let username = username.trim();

    state.recovery_throttle.check(username)?;

    validate_new_password(new_password, username)?;

    // Secrets mal formés ignorés : ils ne viennent pas de GANIS.
    let secrets: Vec<SecretKey> = secrets
        .iter()
        .take(EMAIL_RECOVERY_MAX_SECRETS)
        .filter_map(|encoded| SecretKey::from_base64(encoded.trim()).ok())
        .collect();

    let candidate = user_service::find_by_username(&state.app_db, username).await?;

    let mut unlocked = None;

    match &candidate {
        Some(user) => {
            for secret in &secrets {
                match keyring_service::unlock(
                    &state.app_db,
                    &user.id,
                    SlotKind::Email,
                    secret.as_bytes(),
                )
                .await?
                {
                    Some(Some(key)) => {
                        unlocked = Some(key);
                        break;
                    }
                    Some(None) => continue,
                    None => {
                        // Pas de verrou « email » : même coût qu'un essai.
                        keyring_service::burn_equivalent_work(secret.as_bytes()).await;
                        break;
                    }
                }
            }
        }
        None => keyring_service::burn_equivalent_work(b"ganis").await,
    }

    let (Some(user), Some(account_key)) = (candidate, unlocked) else {
        state.recovery_throttle.record_failure(username);
        tracing::warn!("Échec de récupération par e-mail");

        return Err(invalid_email_recovery());
    };

    state.recovery_throttle.record_success(username);
    state.login_throttle.record_success(username);

    set_password(&state.app_db, &user.id, new_password, &account_key).await?;

    session_service::delete_user_sessions(&state.app_db, &user.id).await?;

    if state.current_user().await.is_some_and(|current| current.id == user.id) {
        state.close_session().await;
    }

    tracing::info!("Compte récupéré par e-mail");

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
        assert!(validate_new_password("plume-violette-1", "alice").is_ok());
        assert!(validate_new_password("court1", "alice").is_err());
        assert!(validate_new_password("motdepasse1", "alice").is_err());
        assert!(validate_new_password("seulementdeslettres", "alice").is_err());
        assert!(validate_new_password("123456789012", "alice").is_err());
        assert!(validate_new_password("motdepasse123", "alice").is_err());
        assert!(validate_new_password("alice-plume-12", "alice").is_err());
        assert!(validate_new_password(&format!("a1{}", "x".repeat(127)), "alice").is_err());
    }

    #[tokio::test]
    async fn accounts_keep_no_password_hash() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::migrations::run_migrations(&pool, &crate::db::migrations::APP_MIGRATOR)
            .await
            .unwrap();

        let created = register_user(&pool, "alice", "plume-violette-1", None).await.unwrap();
        let stored = user_service::find_by_id(&pool, &created.user.id).await.unwrap().unwrap();

        assert!(stored.password_hash.is_empty());
        assert!(stored.password_salt.is_empty());
        assert!(matches!(
            check_password(&pool, &stored, "plume-violette-1").await.unwrap(),
            PasswordCheck::Valid(..)
        ));
        assert!(matches!(
            check_password(&pool, &stored, "plume-violette-2").await.unwrap(),
            PasswordCheck::Invalid
        ));
    }

    #[tokio::test]
    async fn legacy_hash_is_erased_once_the_keyring_exists() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::migrations::run_migrations(&pool, &crate::db::migrations::APP_MIGRATOR)
            .await
            .unwrap();

        let created =
            create_account_without_keyring(&pool, "bob", "plume-violette-1", None, Role::User)
                .await
                .unwrap();
        let legacy = user_service::find_by_id(&pool, &created.id).await.unwrap().unwrap();
        assert!(!legacy.password_hash.is_empty());

        assert!(matches!(
            check_password(&pool, &legacy, "mauvais-essai-1").await.unwrap(),
            PasswordCheck::Invalid
        ));
        assert!(matches!(
            check_password(&pool, &legacy, "plume-violette-1").await.unwrap(),
            PasswordCheck::Valid(..)
        ));

        let migrated = user_service::find_by_id(&pool, &created.id).await.unwrap().unwrap();
        assert!(migrated.password_hash.is_empty());
        assert!(keyring_service::has_slot(&pool, &created.id, SlotKind::Password).await.unwrap());
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

        assert!(verify_legacy_password("secret123", &hash));
        assert!(!verify_legacy_password("autre123", &hash));
        assert!(!verify_legacy_password("secret123", ""));
    }
}