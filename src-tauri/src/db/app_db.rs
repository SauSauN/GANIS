//! Gestion de la base de données de l'application.
//!
//! Cette base est unique et partagée par tous les utilisateurs locaux.
//! Elle contient les comptes, les sessions et les paramètres globaux.

use crate::db::migrations::{run_migrations, APP_MIGRATOR};
use crate::error::{AppError, AppResult};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;

/// Initialise ou ouvre la base de données de l'application.
///
/// Le fichier `app.db` est créé dans `data_dir` s'il n'existe pas.
/// Les migrations sont exécutées automatiquement.
pub async fn init_app_db(data_dir: &Path) -> AppResult<SqlitePool> {
    // S'assurer que le répertoire existe
    std::fs::create_dir_all(data_dir).map_err(|e| {
        AppError::io(e).with_detail("Impossible de créer le répertoire de données")
    })?;

    let db_path = data_dir.join("app.db");
    // Chemin passé tel quel (et non sous forme d'URL « sqlite://… ») : une
    // URL échoue dès que le chemin contient « % » ou « ? ».
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        // Les données supprimées ou remplacées sont effacées du fichier
        // (mises à zéro), pas seulement marquées comme libres : quand un
        // e-mail ou un nom de projet passe en version chiffrée, l'ancienne
        // valeur en clair ne reste pas lisible dans l'espace libéré.
        .pragma("secure_delete", "ON");

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| {
            AppError::database(e)
                .with_detail("Impossible de se connecter à la base de l'application")
        })?;

    run_migrations(&pool, &APP_MIGRATOR).await?;

    tracing::info!(path = %db_path.display(), "Base de données de l'application initialisée");
    Ok(pool)
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