//! Point d'entrée de la bibliothèque GANIS.
//!
//! Initialise la journalisation, la base de données de l'application,
//! et enregistre l'état partagé accessible depuis toutes les commandes Tauri.

mod error;
mod logger;
mod utils;

mod db;
mod models;
mod security;
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
        .plugin(tauri_plugin_dialog::init())
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
            let state = AppState::new(app_db, data_dir);

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
            commands::auth::recover_account,
            commands::auth::regenerate_recovery_key,
            commands::auth::save_recovery_key_file,
            //commands::users::list_users,
            //commands::users::create_user,
            //commands::users::update_user_role,
            //commands::users::delete_user,
            commands::users::update_profile,
            commands::users::change_password,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::open_project,
            commands::projects::update_project,
            commands::projects::duplicate_project,
            commands::projects::delete_project,
            commands::synopsis::get_synopsis,
            commands::synopsis::update_synopsis,
            commands::characters::get_character_settings,
            commands::characters::set_character_detail_level,
            commands::characters::set_character_list,
            commands::characters::list_character_gallery,
            commands::characters::get_character_gallery_image,
            commands::characters::add_character_gallery_image,
            commands::characters::delete_character_gallery_image,
            commands::characters::list_characters,
            commands::characters::create_character,
            commands::characters::update_character,
            commands::characters::delete_character,
            commands::characters::get_character_portrait,
            commands::characters::set_character_portrait,
            commands::characters::remove_character_portrait,
            commands::relations::list_relations,
            commands::relations::create_relation,
            commands::relations::update_relation,
            commands::relations::delete_relation,
            commands::relations::get_graph_positions,
            commands::relations::save_graph_positions,
            commands::relations::clear_graph_positions,
            commands::structure::get_structure,
            commands::structure::set_structure_template,
            commands::structure::create_structure_node,
            commands::structure::update_structure_node,
            commands::structure::move_structure_node,
            commands::structure::delete_structure_node,
            commands::packages::become_developer,
            commands::packages::leave_developer_mode,
            commands::packages::list_my_packages,
            commands::packages::create_theme_package,
            commands::packages::update_theme_package,
            commands::packages::delete_package,
            //commands::diagnostics::get_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}