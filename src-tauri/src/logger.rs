//! Journalisation : fichier rotatif quotidien (14 jours conservés).
//! Règle : ne jamais journaliser de mot de passe, de jeton de session
//! ni de contenu narratif de l'utilisateur.

use std::path::Path;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::filter::LevelFilter;
use tracing_subscriber::fmt;
use tracing_subscriber::prelude::*;

/// À conserver dans l'état Tauri : l'écriture du journal s'arrête si ce garde est détruit.
pub struct LogGuard(#[allow(dead_code)] WorkerGuard);

pub fn init(log_dir: &Path) -> Result<LogGuard, String> {
    std::fs::create_dir_all(log_dir).map_err(|e| e.to_string())?;

    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("ganis")
        .filename_suffix("log")
        .max_log_files(14)
        .build(log_dir)
        .map_err(|e| e.to_string())?;

    let (writer, guard) = tracing_appender::non_blocking(appender);

    let level = if cfg!(debug_assertions) { LevelFilter::DEBUG } else { LevelFilter::INFO };
    let file_layer = fmt::layer().with_writer(writer).with_ansi(false).with_target(false);
    // Console uniquement en développement
    let console_layer = cfg!(debug_assertions).then(|| fmt::layer().with_target(false));

    tracing_subscriber::registry()
        .with(level)
        .with(file_layer)
        .with(console_layer)
        .try_init()
        .map_err(|e| e.to_string())?;

    Ok(LogGuard(guard))
}
