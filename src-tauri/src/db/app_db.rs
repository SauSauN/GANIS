//! Gestion de la base de données de l'application.
//!
//! Cette base est unique et partagée par tous les utilisateurs locaux.
//! Elle contient les comptes, les sessions et les paramètres globaux.
//!
//! Elle est chiffrée (SQLCipher) avec la clé d'appareil (voir
//! `security::device_key`) : copiée sur un autre ordinateur, elle est
//! illisible. Une ancienne base en clair est chiffrée au premier démarrage.

use crate::db::migrations::{run_migrations, APP_MIGRATOR};
use crate::db::project_db::{export_encrypted, is_plaintext_sqlite, opens_with_key};
use crate::error::{AppError, AppResult};
use crate::security::crypto::SecretKey;
use crate::security::device_key::{self, DeviceKeyIssue};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

/// Fichier de la base de l'application.
pub const APP_DB_FILE: &str = "app.db";

/// Copie chiffrée d'une ancienne base en clair, en cours de création.
const ENCRYPTING_FILE: &str = "app.db.encrypting";

/// Résultat de l'ouverture de la base de l'application.
pub enum AppDbOpen {
    Ready(SqlitePool),
    /// La base est chiffrée mais la clé d'appareil manque ou ne convient
    /// pas : la clé de secours est nécessaire.
    Locked(DeviceKeyIssue),
}

pub fn app_db_path(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_DB_FILE)
}

/// Ouvre une connexion à `app.db`, chiffrée si `key` est donnée.
async fn connect(db_path: &Path, key: Option<&SecretKey>) -> Result<SqlitePool, sqlx::Error> {
    // Chemin passé tel quel (et non sous forme d'URL « sqlite://… ») : une
    // URL échoue dès que le chemin contient « % » ou « ? ».
    let mut options = SqliteConnectOptions::new().filename(db_path);

    // La clé doit être la toute première instruction envoyée à SQLCipher.
    if let Some(key) = key {
        options = options.pragma("key", key.sqlcipher_pragma().to_string());
    }

    let options = options
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        // Les données supprimées ou remplacées sont effacées du fichier
        // (mises à zéro), pas seulement marquées comme libres.
        .pragma("secure_delete", "ON");

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
}

/// Supprime une base et ses fichiers annexes ; avec `wipe`, ils sont
/// d'abord écrasés par des zéros.
fn remove_db_files(db_path: &Path, wipe: bool) -> AppResult<()> {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let path = PathBuf::from(format!("{}{suffix}", db_path.display()));

        if wipe {
            if let Ok(len) = std::fs::metadata(&path).map(|m| m.len()) {
                let _ = std::fs::OpenOptions::new().write(true).open(&path).and_then(|mut file| {
                    use std::io::Write;
                    let zeros = vec![0u8; 64 * 1024];
                    let mut remaining = len;
                    while remaining > 0 {
                        let chunk = remaining.min(zeros.len() as u64) as usize;
                        file.write_all(&zeros[..chunk])?;
                        remaining -= chunk as u64;
                    }
                    file.sync_all()
                });
            }
        }

        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(AppError::io(&e)
                    .with_detail(format!("Suppression d'un fichier de base impossible : {e}")))
            }
        }
    }

    Ok(())
}

/// Chiffre une ancienne `app.db` en clair : copie chiffrée, puis l'ancienne
/// est écrasée et remplacée. Un arrêt brutal pendant la copie laisse
/// l'ancienne base intacte (la copie est refaite au démarrage suivant).
async fn encrypt_plain_app_db(data_dir: &Path, key: &SecretKey) -> AppResult<()> {
    let db_path = app_db_path(data_dir);
    let copy = data_dir.join(ENCRYPTING_FILE);

    remove_db_files(&copy, false)?;

    let plain = connect(&db_path, None).await.map_err(|e| {
        AppError::database(&e).with_detail("Ouverture de l'ancienne base de l'application")
    })?;

    let exported = export_encrypted(&plain, &copy, key).await;
    plain.close().await;

    if let Err(error) = exported {
        let _ = remove_db_files(&copy, false);
        return Err(error);
    }

    remove_db_files(&db_path, true)?;
    std::fs::rename(&copy, &db_path).map_err(|e| {
        AppError::io(&e).with_detail(format!("Mise en place de la base chiffrée : {e}"))
    })?;

    tracing::info!("Base de l'application chiffrée avec la clé d'appareil");
    Ok(())
}

/// Ouvre la base de l'application avec la clé d'appareil, en créant l'une
/// ou l'autre au premier démarrage.
pub async fn open_app_db(data_dir: &Path) -> AppResult<AppDbOpen> {
    std::fs::create_dir_all(data_dir).map_err(|e| {
        AppError::io(e).with_detail("Impossible de créer le répertoire de données")
    })?;

    let db_path = app_db_path(data_dir);
    let copy = data_dir.join(ENCRYPTING_FILE);
    let loaded = device_key::load(data_dir);

    // Arrêt entre l'effacement de l'ancienne base et la mise en place de la
    // copie chiffrée : la copie, complète, prend sa place.
    if !db_path.exists() && copy.exists() {
        if let Ok(Some(key)) = &loaded {
            if opens_with_key(&copy, key).await {
                std::fs::rename(&copy, &db_path).map_err(|e| {
                    AppError::io(&e).with_detail(format!("Mise en place de la base chiffrée : {e}"))
                })?;
            }
        }
    }

    let exists = db_path.exists();
    let plain = exists && is_plaintext_sqlite(&db_path);
    let encrypted = exists && !plain;

    let key = match loaded {
        Ok(Some(key)) => key,
        Ok(None) if encrypted => return Ok(AppDbOpen::Locked(DeviceKeyIssue::Missing)),
        Err(issue) if encrypted => return Ok(AppDbOpen::Locked(issue)),
        // Première ouverture (ou base encore en clair) : nouvelle clé. Un
        // `device.key` illisible est gardé à côté (`device.key.old`).
        Ok(None) | Err(_) => {
            let key = SecretKey::generate();
            device_key::save(data_dir, &key)?;
            tracing::info!("Clé d'appareil créée");
            key
        }
    };

    if plain {
        encrypt_plain_app_db(data_dir, &key).await?;
    }

    let pool = match connect(&db_path, Some(&key)).await {
        Ok(pool) => pool,
        Err(e) if encrypted && e.to_string().contains("not a database") => {
            tracing::error!("La clé d'appareil ne déchiffre pas la base de l'application");
            return Ok(AppDbOpen::Locked(DeviceKeyIssue::WrongKey));
        }
        Err(e) => {
            return Err(AppError::database(e)
                .with_detail("Impossible de se connecter à la base de l'application"))
        }
    };

    run_migrations(&pool, &APP_MIGRATOR).await?;

    tracing::info!("Base de données de l'application initialisée");
    Ok(AppDbOpen::Ready(pool))
}

/// Initialise ou ouvre la base de données de l'application ; échoue si la
/// clé d'appareil manque (tests, projets d'exemple en ligne de commande).
#[cfg(test)]
pub async fn init_app_db(data_dir: &Path) -> AppResult<SqlitePool> {
    match open_app_db(data_dir).await? {
        AppDbOpen::Ready(pool) => Ok(pool),
        AppDbOpen::Locked(issue) => Err(AppError::internal("Clé d'appareil indisponible")
            .with_detail(format!("device.key : {}", issue.as_str()))),
    }
}

/// Vrai si `key` déchiffre la base de l'application (clé de secours).
pub async fn key_opens_app_db(data_dir: &Path, key: &SecretKey) -> bool {
    opens_with_key(&app_db_path(data_dir), key).await
}

/// Vérifie si au moins un utilisateur existe dans la base.
/// Utilisé pour déterminer si la configuration initiale est nécessaire.
pub async fn has_any_user(pool: &SqlitePool) -> AppResult<bool> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::database(e).with_detail("Échec de comptage des utilisateurs"))?;
    Ok(count.0 > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ganis-app-db-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn insert_marker(pool: &SqlitePool) {
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) \
             VALUES ('u1', 'marqueur_secret', '', '', 'user', 'now', 'now')",
        )
        .execute(pool)
        .await
        .unwrap();
    }

    fn file_contains(path: &Path, needle: &str) -> bool {
        std::fs::read(path)
            .map(|bytes| String::from_utf8_lossy(&bytes).contains(needle))
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn app_db_is_encrypted_with_the_device_key() {
        let dir = temp_dir("new");
        let pool = init_app_db(&dir).await.unwrap();
        insert_marker(&pool).await;
        pool.close().await;

        assert!(device_key::key_path(&dir).exists());
        assert!(!is_plaintext_sqlite(&app_db_path(&dir)));
        assert!(!file_contains(&app_db_path(&dir), "marqueur_secret"));

        // Réouverture : mêmes données.
        let pool = init_app_db(&dir).await.unwrap();
        let name: String = sqlx::query_scalar("SELECT username FROM users").fetch_one(&pool).await.unwrap();
        assert_eq!(name, "marqueur_secret");
        pool.close().await;

        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn plaintext_app_db_is_encrypted_at_startup() {
        let dir = temp_dir("legacy");

        let plain = connect(&app_db_path(&dir), None).await.unwrap();
        run_migrations(&plain, &APP_MIGRATOR).await.unwrap();
        insert_marker(&plain).await;
        plain.close().await;
        assert!(is_plaintext_sqlite(&app_db_path(&dir)));

        let pool = init_app_db(&dir).await.unwrap();
        let name: String = sqlx::query_scalar("SELECT username FROM users").fetch_one(&pool).await.unwrap();
        assert_eq!(name, "marqueur_secret");
        pool.close().await;

        assert!(!is_plaintext_sqlite(&app_db_path(&dir)));
        assert!(!file_contains(&app_db_path(&dir), "marqueur_secret"));
        assert!(!dir.join(ENCRYPTING_FILE).exists());

        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn missing_or_wrong_device_key_locks_the_data() {
        let dir = temp_dir("locked");
        let pool = init_app_db(&dir).await.unwrap();
        pool.close().await;

        let key = device_key::load(&dir).unwrap().unwrap();
        assert!(key_opens_app_db(&dir, &key).await);

        // Clé disparue : verrouillé, rien n'est écrasé.
        std::fs::remove_file(device_key::key_path(&dir)).unwrap();
        assert!(matches!(open_app_db(&dir).await.unwrap(), AppDbOpen::Locked(DeviceKeyIssue::Missing)));
        assert!(!device_key::key_path(&dir).exists());

        // Autre clé : verrouillé aussi.
        device_key::save(&dir, &SecretKey::generate()).unwrap();
        assert!(matches!(open_app_db(&dir).await.unwrap(), AppDbOpen::Locked(DeviceKeyIssue::WrongKey)));

        // La clé de secours rétablit l'accès.
        let backup = device_key::backup_text(&key, "fr", "2026-11-23");
        let restored = device_key::parse_backup(&backup).unwrap();
        assert!(key_opens_app_db(&dir, &restored).await);
        device_key::save(&dir, &restored).unwrap();
        assert!(matches!(open_app_db(&dir).await.unwrap(), AppDbOpen::Ready(_)));

        std::fs::remove_dir_all(dir).ok();
    }
}
