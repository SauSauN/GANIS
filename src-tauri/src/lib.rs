//! Point d'entrée de la bibliothèque GANIS.
//!
//! Initialise la journalisation, la base de données de l'application,
//! et enregistre l'état partagé accessible depuis toutes les commandes Tauri.

mod error;
mod logger;
mod utils;

mod db;
mod models;
mod state;

mod services;
mod commands;

use error::AppResult;
use serde::Serialize;
use state::AppState;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    offline: bool,
}

/// Commande de test du pont Rust vers l'interface.
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

                    tracing::info!(
                        version = env!("CARGO_PKG_VERSION"),
                        "GANIS démarré"
                    );
                }
                Err(e) => {
                    eprintln!("Journalisation indisponible : {e}");
                }
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
            let state = AppState::new(app_db);

            app.manage(state);

            tracing::info!("Base de données applicative initialisée");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::auth::setup_admin,
            commands::auth::has_any_user,
            commands::auth::register,
            commands::auth::login,
            commands::auth::logout,
            commands::users::list_users,
            commands::users::create_user,
            commands::users::update_user_role,
            commands::users::delete_user,
            commands::users::update_profile,
            commands::users::change_password,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::open_project,
            commands::projects::update_project,
            commands::projects::duplicate_project,
            commands::projects::delete_project,
            commands::diagnostics::get_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}