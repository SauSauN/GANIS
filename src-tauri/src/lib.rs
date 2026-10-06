//! Point d'entrée de la bibliothèque GANIS.
//!
//! Initialise la journalisation, la base de données de l'application,
//! et enregistre l'état partagé accessible depuis toutes les commandes Tauri.

#[allow(dead_code)] // utilisé progressivement à partir de la Phase 2
mod error;
mod logger;
#[allow(dead_code)]
mod utils;

#[allow(dead_code)] // utilisé progressivement à partir de la Phase 2
mod db;
#[allow(dead_code)]
mod models;
#[allow(dead_code)]
mod state;

use error::AppResult;
use serde::Serialize;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    offline: bool,
}

/// Commande de test du pont Rust <-> interface.
#[tauri::command]
fn app_info() -> AppResult<AppInfo> {
    Ok(AppInfo {
        name: "GANIS",
        version: env!("CARGO_PKG_VERSION"),
        offline: true,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // -----------------------------------------------------------------
            // 1. Journalisation
            // -----------------------------------------------------------------
            let log_dir = app.path().app_log_dir()?;
            match logger::init(&log_dir) {
                Ok(guard) => {
                    app.manage(guard);
                    tracing::info!(version = env!("CARGO_PKG_VERSION"), "GANIS démarré");
                }
                Err(e) => eprintln!("Journalisation indisponible : {e}"),
            }

            // -----------------------------------------------------------------
            // 2. Base de données de l'application
            // -----------------------------------------------------------------
            let data_dir = app.path().app_data_dir()?;
            let app_db = tauri::async_runtime::block_on(async {
                db::init_app_db(&data_dir).await
            })?;

            // -----------------------------------------------------------------
            // 3. État partagé
            // -----------------------------------------------------------------
            let state: Arc<AppState> = Arc::new(AppState::new(app_db));
            app.manage(state);

            tracing::info!("Base de données applicative initialisée");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}