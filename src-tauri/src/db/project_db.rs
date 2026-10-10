//! Gestion des bases de données de projet.
//!
//! Chaque projet dispose de son propre fichier SQLite (`project.db`)
//! dans un répertoire dédié, garantissant l'isolation des données.
//!
//! Les bases sont chiffrées avec SQLCipher, chacune avec la clé de son
//! projet : sans cette clé, le fichier est illisible, y compris par un
//! outil externe.

use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
use crate::error::{AppError, AppResult};
use crate::security::crypto::SecretKey;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

/// Nom du fichier de base de données d'un projet.
pub const DB_FILE: &str = "project.db";

/// Ouvre (ou crée) une base SQLite et lui applique les migrations.
///
/// - `Some(clé)` : base chiffrée avec cette clé (SQLCipher) ;
/// - `None` : base en clair. Ne sert qu'à lire une base d'avant le
///   chiffrement, pour la chiffrer.
///
/// Une mauvaise clé fait échouer l'ouverture (« file is not a database »).
pub async fn open_db(
    db_path: &Path,
    key: Option<&SecretKey>,
) -> AppResult<SqlitePool> {
    let db_url = format!("sqlite://{}", db_path.display());

    let mut options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| AppError::database(e).with_detail("URL de base de projet invalide"))?;

    // La clé doit être la toute première instruction envoyée à SQLCipher :
    // sqlx garantit que le pragma `key` passe avant tous les autres.
    if let Some(key) = key {
        options = options.pragma("key", key.sqlcipher_pragma().to_string());
    }

    let options = options
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        // Données supprimées mises à zéro dans le fichier.
        .pragma("secure_delete", "ON");

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| {
            AppError::database(e).with_detail("Impossible de se connecter à la base du projet")
        })?;

    if let Err(error) = run_migrations(&pool, &PROJECT_MIGRATOR).await {
        pool.close().await;
        return Err(error);
    }

    Ok(pool)
}

/// Initialise ou ouvre la base chiffrée d'un projet.
///
/// Le fichier `project.db` est créé dans `project_dir` s'il n'existe pas.
/// Les migrations sont exécutées automatiquement.
pub async fn init_project_db(project_dir: &Path, key: &SecretKey) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(project_dir).map_err(|e| {
        AppError::io(e).with_detail("Impossible de créer le répertoire du projet")
    })?;

    let db_path = project_dir.join(DB_FILE);
    let pool = open_db(&db_path, Some(key)).await?;

    tracing::info!("Base de données du projet ouverte");
    Ok(pool)
}

/// Copie une base ouverte vers un nouveau fichier chiffré avec `key`.
///
/// Utilise `sqlcipher_export`, sur une seule connexion : la base cible est
/// attachée avec sa clé, toutes les tables (y compris l'historique des
/// migrations) y sont recopiées, puis elle est détachée. Les écritures
/// encore dans le journal WAL de la source sont incluses.
///
/// Sert à chiffrer une ancienne base en clair, et à dupliquer un projet
/// avec une nouvelle clé.
pub async fn export_encrypted(
    source: &SqlitePool,
    target: &Path,
    key: &SecretKey,
) -> AppResult<()> {
    if target.exists() {
        return Err(AppError::internal("Le fichier de destination existe déjà"));
    }

    let mut conn = source.acquire().await?;

    sqlx::query("ATTACH DATABASE ? AS ganis_export KEY ?")
        .bind(target.to_string_lossy().to_string())
        .bind(key.sqlcipher_raw_key().to_string())
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::database(&e).with_detail(format!("Préparation de la copie chiffrée : {e}")))?;

    let exported = sqlx::query("SELECT sqlcipher_export('ganis_export')")
        .execute(&mut *conn)
        .await;

    // Détachement dans tous les cas, pour rendre la connexion propre.
    let detached = sqlx::query("DETACH DATABASE ganis_export")
        .execute(&mut *conn)
        .await;

    if let Err(e) = exported {
        let _ = std::fs::remove_file(target);
        return Err(AppError::database(&e).with_detail(format!("Copie chiffrée impossible : {e}")));
    }

    detached.map_err(|e| AppError::database(&e).with_detail(format!("Fin de la copie chiffrée : {e}")))?;

    Ok(())
}

/// Indique si un fichier est une base SQLite en clair (en-tête lisible).
///
/// Une base SQLCipher commence par des octets aléatoires ; une base en
/// clair par « SQLite format 3 ».
pub fn is_plaintext_sqlite(path: &Path) -> bool {
    use std::io::Read;

    let mut header = [0u8; 16];

    std::fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .map(|()| &header == b"SQLite format 3\0")
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ganis-test-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn encrypted_db_is_unreadable_without_key() {
        let dir = temp_dir("enc");
        let key = SecretKey::generate();

        let pool = init_project_db(&dir, &key).await.unwrap();
        sqlx::query("UPDATE synopsis SET content = 'Un secret bien gardé' WHERE id = 'default'")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let db_path = dir.join(DB_FILE);
        assert!(!is_plaintext_sqlite(&db_path));

        let bytes = std::fs::read(&db_path).unwrap();
        let needle = b"secret bien";
        assert!(!bytes.windows(needle.len()).any(|w| w == needle));

        // Sans clé, puis avec une autre clé : refus.
        assert!(open_db(&db_path, None).await.is_err());
        assert!(open_db(&db_path, Some(&SecretKey::generate())).await.is_err());

        // Avec la bonne clé : lisible.
        let pool = init_project_db(&dir, &key).await.unwrap();
        let content: String =
            sqlx::query_scalar("SELECT content FROM synopsis WHERE id = 'default'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(content, "Un secret bien gardé");
        pool.close().await;

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn plaintext_db_can_be_exported_encrypted() {
        let dir = temp_dir("export");
        let plain_path = dir.join("plain.db");

        let plain = open_db(&plain_path, None).await.unwrap();
        sqlx::query("UPDATE synopsis SET content = 'Avant' WHERE id = 'default'")
            .execute(&plain)
            .await
            .unwrap();
        assert!(is_plaintext_sqlite(&plain_path));

        let key = SecretKey::generate();
        let target = dir.join(DB_FILE);
        export_encrypted(&plain, &target, &key).await.unwrap();
        plain.close().await;

        assert!(!is_plaintext_sqlite(&target));

        let pool = init_project_db(&dir, &key).await.unwrap();
        let content: String =
            sqlx::query_scalar("SELECT content FROM synopsis WHERE id = 'default'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(content, "Avant");
        pool.close().await;

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn encrypted_db_can_be_copied_with_a_new_key() {
        let dir = temp_dir("copy");
        let source_dir = dir.join("a");
        let target_dir = dir.join("b");
        std::fs::create_dir_all(&target_dir).unwrap();

        let key_a = SecretKey::generate();
        let key_b = SecretKey::generate();

        let source = init_project_db(&source_dir, &key_a).await.unwrap();
        sqlx::query("UPDATE synopsis SET content = 'Copie' WHERE id = 'default'")
            .execute(&source)
            .await
            .unwrap();

        export_encrypted(&source, &target_dir.join(DB_FILE), &key_b)
            .await
            .unwrap();
        source.close().await;

        assert!(open_db(&target_dir.join(DB_FILE), Some(&key_a)).await.is_err());

        let copy = init_project_db(&target_dir, &key_b).await.unwrap();
        let content: String =
            sqlx::query_scalar("SELECT content FROM synopsis WHERE id = 'default'")
                .fetch_one(&copy)
                .await
                .unwrap();
        assert_eq!(content, "Copie");
        copy.close().await;

        std::fs::remove_dir_all(dir).unwrap();
    }
}
