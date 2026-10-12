//! Verrous de la clé de compte (`user_key_slots`).
//!
//! La clé de compte n'est jamais écrite en clair. Chaque verrou la contient,
//! chiffrée par une clé dérivée (Argon2id) d'un secret de l'utilisateur :
//!
//! | Verrou      | Secret                    | Sert à                               |
//! |-------------|---------------------------|--------------------------------------|
//! | `password`  | mot de passe              | connexion normale                    |
//! | `recovery`  | clé de récupération       | mot de passe oublié                  |
//!
//! Ajouter une nouvelle façon d'ouvrir le compte (par exemple un serveur de
//! récupération par e-mail) revient à ajouter un type de verrou ici.

use crate::error::{AppError, AppResult};
use crate::security::crypto::{self, KdfParams, SecretKey};
use crate::security::recovery_key::RecoveryKey;
use crate::security::aad;
use crate::utils::{new_id, now_utc, run_blocking};
use zeroize::Zeroizing;
use sqlx::{SqliteConnection, SqlitePool};

/// Type de verrou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotKind {
    Password,
    Recovery,
}

impl SlotKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SlotKind::Password => "password",
            SlotKind::Recovery => "recovery",
        }
    }
}

/// Verrou prêt à être enregistré.
pub struct NewSlot {
    kind: SlotKind,
    salt: String,
    params: KdfParams,
    wrapped_key: String,
}

impl NewSlot {
    /// Enferme `account_key` avec une clé dérivée de `secret`.
    ///
    /// Calcul coûteux (Argon2id) : à faire hors de toute transaction.
    pub fn seal(
        user_id: &str,
        kind: SlotKind,
        secret: &[u8],
        account_key: &SecretKey,
    ) -> AppResult<Self> {
        let salt = crypto::generate_salt();
        let params = KdfParams::CURRENT;
        let kek = crypto::derive_key(secret, &salt, params)?;
        let wrapped_key =
            crypto::wrap_key(&kek, &aad::key_slot(user_id, kind.as_str()), account_key)?;

        Ok(Self {
            kind,
            salt,
            params,
            wrapped_key,
        })
    }

    /// Comme [`NewSlot::seal`], mais le calcul Argon2id est fait sur un fil
    /// dédié pour ne pas bloquer les autres commandes.
    pub async fn seal_off_thread(
        user_id: &str,
        kind: SlotKind,
        secret: &[u8],
        account_key: &SecretKey,
    ) -> AppResult<Self> {
        let user_id = user_id.to_owned();
        let secret = Zeroizing::new(secret.to_vec());
        let account_key = account_key.clone();

        run_blocking(move || Self::seal(&user_id, kind, &secret, &account_key)).await
    }
}

/// Clé de récupération créée d'office avec chaque compte.
///
/// **Désactivée pour l'instant** : les comptes n'ont que le verrou « mot de
/// passe ». Tout le mécanisme reste en place et testé (création depuis les
/// paramètres du compte, récupération avec `recover_account`) : passer
/// cette valeur à `true`, et `RECOVERY_KEY_ENABLED` côté interface
/// (`src/lib/recoveryKey.ts`), suffit à le réactiver.
///
/// Sans clé de récupération, un mot de passe oublié rend les projets du
/// compte définitivement illisibles.
pub const RECOVERY_KEY_ON_SIGNUP: bool = false;

/// Trousseau d'un nouveau compte : la clé du compte, sa clé de récupération
/// éventuelle (à montrer une seule fois) et les verrous à enregistrer.
pub struct NewKeyring {
    pub account_key: SecretKey,
    pub recovery_key: Option<RecoveryKey>,
    pub slots: Vec<NewSlot>,
}

/// Prépare le trousseau d'un compte (calculs uniquement, rien n'est écrit).
///
/// Toujours un verrou « mot de passe » ; avec `with_recovery`, aussi une
/// clé de récupération et son verrou.
pub fn build_keyring(user_id: &str, password: &str, with_recovery: bool) -> AppResult<NewKeyring> {
    let account_key = SecretKey::generate();

    let mut slots = vec![NewSlot::seal(
        user_id,
        SlotKind::Password,
        password.as_bytes(),
        &account_key,
    )?];

    let recovery_key = if with_recovery {
        let key = RecoveryKey::generate();
        slots.push(NewSlot::seal(
            user_id,
            SlotKind::Recovery,
            key.secret_bytes(),
            &account_key,
        )?);
        Some(key)
    } else {
        None
    };

    Ok(NewKeyring {
        account_key,
        recovery_key,
        slots,
    })
}

/// Comme [`build_keyring`], mais les calculs Argon2id sont faits sur un fil
/// dédié pour ne pas bloquer les autres commandes.
pub async fn build_keyring_off_thread(
    user_id: &str,
    password: &str,
    with_recovery: bool,
) -> AppResult<NewKeyring> {
    let user_id = user_id.to_owned();
    let password = Zeroizing::new(password.to_owned());

    run_blocking(move || build_keyring(&user_id, &password, with_recovery)).await
}

const INSERT_SLOT: &str = r#"
    INSERT INTO user_key_slots (
        id, user_id, kind, kdf_salt, kdf_memory_kib, kdf_iterations,
        kdf_parallelism, wrapped_key, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"#;

/// Clause ajoutée pour remplacer un verrou existant du même type.
const ON_CONFLICT_REPLACE: &str = r#"
    ON CONFLICT (user_id, kind) DO UPDATE SET
        kdf_salt = excluded.kdf_salt,
        kdf_memory_kib = excluded.kdf_memory_kib,
        kdf_iterations = excluded.kdf_iterations,
        kdf_parallelism = excluded.kdf_parallelism,
        wrapped_key = excluded.wrapped_key,
        updated_at = excluded.updated_at
"#;

async fn write_slot(
    conn: &mut SqliteConnection,
    user_id: &str,
    slot: &NewSlot,
    replace: bool,
) -> AppResult<()> {
    let now = now_utc();

    let sql = if replace {
        format!("{INSERT_SLOT}{ON_CONFLICT_REPLACE}")
    } else {
        INSERT_SLOT.to_owned()
    };

    sqlx::query(&sql)
        .bind(new_id())
        .bind(user_id)
        .bind(slot.kind.as_str())
        .bind(&slot.salt)
        .bind(i64::from(slot.params.memory_kib))
        .bind(i64::from(slot.params.iterations))
        .bind(i64::from(slot.params.parallelism))
        .bind(&slot.wrapped_key)
        .bind(&now)
        .bind(&now)
        .execute(conn)
        .await
        .map_err(|e| AppError::database(&e).with_detail(format!("Enregistrement du verrou : {e}")))?;

    Ok(())
}

/// Ajoute un verrou. Échoue si le compte a déjà un verrou de ce type :
/// sert à la création du trousseau, qui ne doit jamais écraser une clé
/// de compte existante.
pub async fn insert_slot(conn: &mut SqliteConnection, user_id: &str, slot: &NewSlot) -> AppResult<()> {
    write_slot(conn, user_id, slot, false).await
}

/// Remplace le verrou de ce type (nouveau mot de passe, nouvelle clé de
/// récupération). La clé du compte enfermée doit être la même.
pub async fn replace_slot(conn: &mut SqliteConnection, user_id: &str, slot: &NewSlot) -> AppResult<()> {
    write_slot(conn, user_id, slot, true).await
}

#[derive(sqlx::FromRow)]
struct SlotRow {
    kdf_salt: String,
    kdf_memory_kib: i64,
    kdf_iterations: i64,
    kdf_parallelism: i64,
    wrapped_key: String,
}

/// Ouvre la clé du compte avec le secret d'un verrou.
///
/// - `Ok(None)` : ce verrou n'existe pas pour ce compte ;
/// - `Ok(Some(None))` : le secret est faux ;
/// - `Ok(Some(Some(clé)))` : clé du compte ouverte.
pub async fn unlock(
    pool: &SqlitePool,
    user_id: &str,
    kind: SlotKind,
    secret: &[u8],
) -> AppResult<Option<Option<SecretKey>>> {
    let row: Option<SlotRow> = sqlx::query_as(
        "SELECT kdf_salt, kdf_memory_kib, kdf_iterations, kdf_parallelism, wrapped_key \
         FROM user_key_slots WHERE user_id = ? AND kind = ?",
    )
    .bind(user_id)
    .bind(kind.as_str())
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::database(&e).with_detail(format!("Lecture du verrou : {e}")))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let params = checked_params(&row)?;

    // Dérivation (Argon2id) sur un fil dédié : elle dure plusieurs centaines
    // de millisecondes et bloquerait sinon le moteur async.
    let secret = Zeroizing::new(secret.to_vec());
    let aad = aad::key_slot(user_id, kind.as_str());

    run_blocking(move || {
        let kek = crypto::derive_key(&secret, &row.kdf_salt, params)?;

        Ok(Some(crypto::unwrap_key(&kek, &aad, &row.wrapped_key)?))
    })
    .await
}

/// Plafonds des paramètres de dérivation lus dans `app.db`.
///
/// Les valeurs enregistrées sont celles de `KdfParams::CURRENT` (64 Mio,
/// 3 passes, 1 fil). Une base modifiée à la main ne doit pas pouvoir
/// imposer un calcul démesuré (mémoire saturée, connexion bloquée).
const KDF_MAX_MEMORY_KIB: u32 = 1024 * 1024; // 1 Gio
const KDF_MAX_ITERATIONS: u32 = 16;
const KDF_MAX_PARALLELISM: u32 = 16;

/// Lit et vérifie les paramètres de dérivation d'un verrou.
fn checked_params(row: &SlotRow) -> AppResult<KdfParams> {
    let read = |value: i64, max: u32| {
        u32::try_from(value)
            .ok()
            .filter(|value| (1..=max).contains(value))
            .ok_or_else(|| {
                AppError::internal("Paramètre de dérivation invalide")
                    .with_detail(format!("Valeur hors limites dans user_key_slots : {value}"))
            })
    };

    Ok(KdfParams {
        memory_kib: read(row.kdf_memory_kib, KDF_MAX_MEMORY_KIB)?,
        iterations: read(row.kdf_iterations, KDF_MAX_ITERATIONS)?,
        parallelism: read(row.kdf_parallelism, KDF_MAX_PARALLELISM)?,
    })
}

/// Calcul Argon2 factice, au même coût qu'une vraie ouverture de verrou.
///
/// Utilisé quand le compte est inconnu, pour que le temps de réponse ne
/// révèle pas quels comptes existent.
pub async fn burn_equivalent_work(secret: &[u8]) {
    let secret = Zeroizing::new(secret.to_vec());

    let _ = run_blocking(move || {
        crypto::derive_key(&secret, &crypto::generate_salt(), KdfParams::CURRENT)
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool_with_user(user_id: &str) -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        crate::db::migrations::run_migrations(&pool, &crate::db::migrations::APP_MIGRATOR)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) \
             VALUES (?, 'alice', 'x', 'x', 'user', 'now', 'now')",
        )
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    async fn save_all(pool: &SqlitePool, user_id: &str, keyring: &NewKeyring) {
        let mut conn = pool.acquire().await.unwrap();
        for slot in &keyring.slots {
            insert_slot(&mut conn, user_id, slot).await.unwrap();
        }
    }

    #[tokio::test]
    async fn both_slots_open_the_same_account_key() {
        let pool = pool_with_user("u1").await;
        let keyring = build_keyring("u1", "motdepasse1", true).unwrap();
        save_all(&pool, "u1", &keyring).await;

        let by_password = unlock(&pool, "u1", SlotKind::Password, b"motdepasse1")
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let by_recovery = unlock(
            &pool,
            "u1",
            SlotKind::Recovery,
            keyring.recovery_key.as_ref().unwrap().secret_bytes(),
        )
        .await
        .unwrap()
        .unwrap()
        .unwrap();

        assert_eq!(by_password.as_bytes(), keyring.account_key.as_bytes());
        assert_eq!(by_recovery.as_bytes(), keyring.account_key.as_bytes());
    }

    #[tokio::test]
    async fn keyring_is_never_overwritten_on_creation() {
        let pool = pool_with_user("u1").await;
        let first = build_keyring("u1", "motdepasse1", true).unwrap();
        save_all(&pool, "u1", &first).await;

        let second = build_keyring("u1", "motdepasse1", true).unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert!(insert_slot(&mut conn, "u1", &second.slots[0]).await.is_err());
        drop(conn);

        let key = unlock(&pool, "u1", SlotKind::Password, b"motdepasse1")
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(key.as_bytes(), first.account_key.as_bytes());
    }

    #[tokio::test]
    async fn wrong_secret_does_not_open() {
        let pool = pool_with_user("u1").await;
        let keyring = build_keyring("u1", "motdepasse1", true).unwrap();
        save_all(&pool, "u1", &keyring).await;

        let result = unlock(&pool, "u1", SlotKind::Password, b"mauvais1").await.unwrap();
        assert!(matches!(result, Some(None)));
    }

    #[tokio::test]
    async fn missing_slot_is_reported() {
        let pool = pool_with_user("u1").await;

        assert!(unlock(&pool, "u1", SlotKind::Password, b"x").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn replacing_a_slot_keeps_the_account_key() {
        let pool = pool_with_user("u1").await;
        let keyring = build_keyring("u1", "ancien123", true).unwrap();
        save_all(&pool, "u1", &keyring).await;

        let slot = NewSlot::seal("u1", SlotKind::Password, b"nouveau123", &keyring.account_key)
            .unwrap();
        let mut conn = pool.acquire().await.unwrap();
        replace_slot(&mut conn, "u1", &slot).await.unwrap();
        drop(conn);

        assert!(matches!(
            unlock(&pool, "u1", SlotKind::Password, b"ancien123").await.unwrap(),
            Some(None)
        ));

        let key = unlock(&pool, "u1", SlotKind::Password, b"nouveau123")
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(key.as_bytes(), keyring.account_key.as_bytes());
    }

    #[tokio::test]
    async fn absurd_kdf_parameters_are_refused() {
        let pool = pool_with_user("u1").await;
        let keyring = build_keyring("u1", "motdepasse1", false).unwrap();
        save_all(&pool, "u1", &keyring).await;

        for (column, value) in [
            ("kdf_memory_kib", i64::from(u32::MAX)),
            ("kdf_iterations", 1_000_000),
            ("kdf_parallelism", 0),
            ("kdf_memory_kib", -1),
        ] {
            let mut conn = pool.acquire().await.unwrap();
            replace_slot(&mut conn, "u1", &keyring.slots[0]).await.unwrap();
            sqlx::query(&format!("UPDATE user_key_slots SET {column} = ?"))
                .bind(value)
                .execute(&mut *conn)
                .await
                .unwrap();
            drop(conn);

            assert!(
                unlock(&pool, "u1", SlotKind::Password, b"motdepasse1").await.is_err(),
                "{column} = {value} aurait dû être refusé"
            );
        }
    }

    #[tokio::test]
    async fn slot_of_one_user_cannot_be_reused_for_another() {
        let pool = pool_with_user("u1").await;
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) \
             VALUES ('u2', 'bob', 'x', 'x', 'user', 'now', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Verrou calculé pour u1, recopié sur u2 : le contexte ne correspond pas.
        let keyring = build_keyring("u1", "motdepasse1", true).unwrap();
        let mut conn = pool.acquire().await.unwrap();
        insert_slot(&mut conn, "u2", &keyring.slots[0]).await.unwrap();
        drop(conn);

        assert!(matches!(
            unlock(&pool, "u2", SlotKind::Password, b"motdepasse1").await.unwrap(),
            Some(None)
        ));
    }
}