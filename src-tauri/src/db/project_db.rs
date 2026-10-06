//! Gestion des bases de données de projet.
//!
//! Chaque projet dispose de son propre fichier SQLite (`project.db`)
//! dans un répertoire dédié, garantissant l'isolation des données.

use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
use crate::error::{AppError, AppResult};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

/// Initialise ou ouvre la base de données d'un projet.
///
/// Le fichier `project.db` est créé dans `project_dir` s'il n'existe pas.
/// Les migrations sont exécutées automatiquement.
pub async fn init_project_db(project_dir: &Path) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(project_dir).map_err(|e| {
        AppError::io(e).with_detail("Impossible de créer le répertoire du projet")
    })?;

    let db_path = project_dir.join("project.db");
    let db_url = format!("sqlite://{}", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| AppError::database(e).with_detail("URL de base de projet invalide"))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| {
            AppError::database(e).with_detail("Impossible de se connecter à la base du projet")
        })?;

    run_migrations(&pool, &PROJECT_MIGRATOR).await?;

    tracing::info!(path = %db_path.display(), "Base de données du projet initialisée");
    Ok(pool)
}