//! Service de diagnostic technique.
//!
//! Collecte des informations non sensibles sur l'application et sur sa
//! base de données locale : aucun chemin de fichier, aucun contenu de
//! compte ni de projet n'est exposé.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::SqlitePool;

/// Longueur maximale du résultat de `integrity_check` renvoyé à l'interface.
const MAX_INTEGRITY_CHARS: usize = 500;

/// État de la base de données de l'application.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseDiagnostics {
    pub sqlite_version: String,
    pub size_bytes: u64,
    /// `"ok"` si la base est saine, sinon le message de SQLite.
    pub integrity: String,
    pub foreign_key_violations: i64,
    pub applied_migrations: i64,
}

/// Compteurs généraux de l'application.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub users: i64,
    pub admins: i64,
    pub developers: i64,
    pub active_sessions: i64,
    pub projects: i64,
}

/// Rapport de diagnostic complet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub generated_at: String,
    pub database: DatabaseDiagnostics,
    pub counts: Counts,
}

fn db_error(context: &str, e: sqlx::Error) -> AppError {
    AppError::database(&e).with_detail(format!("{context} : {e}"))
}

async fn count(pool: &SqlitePool, sql: &str, context: &str) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(sql)
        .fetch_one(pool)
        .await
        .map_err(|e| db_error(context, e))
}

/// Construit le rapport de diagnostic.
///
/// La commande appelante vérifie le rôle administrateur ou développeur.
pub async fn collect(pool: &SqlitePool) -> AppResult<Diagnostics> {
    let sqlite_version =
        sqlx::query_scalar::<_, String>("SELECT sqlite_version()")
            .fetch_one(pool)
            .await
            .map_err(|e| db_error("Lecture de la version SQLite", e))?;

    // Taille du fichier principal. Le chemin lui-même n'est pas exposé.
    let file = sqlx::query_scalar::<_, String>(
        "SELECT file FROM pragma_database_list WHERE name = 'main'",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| db_error("Lecture du fichier de base de données", e))?
    .unwrap_or_default();

    let size_bytes = if file.is_empty() {
        0
    } else {
        std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0)
    };

    let integrity_rows = sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
        .fetch_all(pool)
        .await
        .map_err(|e| db_error("Contrôle d'intégrité", e))?;

    let integrity = if integrity_rows.len() == 1 && integrity_rows[0] == "ok" {
        "ok".to_string()
    } else {
        integrity_rows
            .join("; ")
            .chars()
            .take(MAX_INTEGRITY_CHARS)
            .collect()
    };

    let foreign_key_violations = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(pool)
        .await
        .map_err(|e| db_error("Contrôle des clés étrangères", e))?
        .len() as i64;

    let applied_migrations = count(
        pool,
        "SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 1",
        "Comptage des migrations",
    )
    .await?;

    let now = crate::utils::now_unix();

    let active_sessions = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM sessions WHERE expires_at > ?",
    )
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_error("Comptage des sessions", e))?;

    let counts = Counts {
        users: count(pool, "SELECT COUNT(*) FROM users", "Comptage des utilisateurs").await?,
        admins: count(
            pool,
            "SELECT COUNT(*) FROM users WHERE role = 'admin'",
            "Comptage des administrateurs",
        )
        .await?,
        developers: count(
            pool,
            "SELECT COUNT(*) FROM users WHERE role = 'developer'",
            "Comptage des développeurs",
        )
        .await?,
        active_sessions,
        projects: count(pool, "SELECT COUNT(*) FROM projects", "Comptage des projets").await?,
    };

    Ok(Diagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        generated_at: crate::utils::now_utc(),
        database: DatabaseDiagnostics {
            sqlite_version,
            size_bytes,
            integrity,
            foreign_key_violations,
            applied_migrations,
        },
        counts,
    })
}