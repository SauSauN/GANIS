//! Gestion des migrations de base de données.
//!
//! Utilise `sqlx::migrate!` pour embarquer les scripts SQL au moment
//! de la compilation. Les migrations sont exécutées automatiquement
//! à l'ouverture d'une base.

use crate::error::{AppError, AppResult};
use sqlx::migrate::Migrator;
use sqlx::SqlitePool;

/// Migrateur pour la base de données de l'application.
pub static APP_MIGRATOR: Migrator = sqlx::migrate!("./migrations/app");

/// Migrateur pour la base de données d'un projet.
pub static PROJECT_MIGRATOR: Migrator = sqlx::migrate!("./migrations/project");

/// Exécute les migrations d'un migrateur sur une base de données.
pub async fn run_migrations(pool: &SqlitePool, migrator: &Migrator) -> AppResult<()> {
    migrator
        .run(pool)
        .await
        .map_err(|e| AppError::database(e).with_detail("Échec de l'exécution des migrations"))?;
    Ok(())
}