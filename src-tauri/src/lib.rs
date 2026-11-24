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

/// Projets d'exemple en ligne de commande (`npm run seed:roman` / `seed:manga`).
#[cfg(test)]
mod seed_demo;

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
        // Une seule fenêtre GANIS : un `.ganix` ouvert depuis Windows alors
        // que GANIS tourne déjà est confié à la fenêtre existante (doit
        // être le premier plugin enregistré).
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(path) = commands::ganix::ganix_in_args(argv, Some(std::path::Path::new(&cwd))) {
                app.state::<commands::ganix::OpenedGanix>().set(path);
                let _ = tauri::Emitter::emit(app, commands::ganix::OPENED_EVENT, ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // `.ganix` ouvert par double-clic au lancement de GANIS.
        .manage(commands::ganix::OpenedGanix(std::sync::Mutex::new(commands::ganix::ganix_in_args(
            std::env::args(),
            None,
        ))))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            // `GANIS_DATA_DIR` : autre dossier de données (tests de bout en
            // bout, démonstration), comme pour `seed_demo`.
            let data_dir = match std::env::var_os("GANIS_DATA_DIR") {
                Some(dir) if !dir.is_empty() => std::path::PathBuf::from(dir),
                _ => app.path().app_data_dir()?,
            };

            let opened = tauri::async_runtime::block_on(async {
                db::app_db::open_app_db(&data_dir).await
            })?;

            // Base chiffrée sans clé d'appareil utilisable (Windows
            // réinstallé, dossier copié ailleurs) : l'interface ne propose
            // que la restauration par clé de secours (`commands::device`).
            let app_db = match opened {
                db::app_db::AppDbOpen::Ready(pool) => pool,
                db::app_db::AppDbOpen::Locked(issue) => {
                    tracing::warn!(issue = issue.as_str(), "Données verrouillées : clé d'appareil indisponible");
                    app.manage(commands::device::DeviceLock { data_dir, issue });
                    return Ok(());
                }
            };

            // -----------------------------------------------------------------
            // 3. État partagé
            // -----------------------------------------------------------------
            // Imports .ganix et exports interrompus par un arrêt brutal.
            services::ganix_service::clean_leftovers(&data_dir);
            // Copies de documents ouvertes dans une autre application lors
            // d'une séance précédente (non chiffrées) : supprimées.
            services::document_service::clean_open_copies(&data_dir);

            let state = AppState::new(app_db, data_dir);

            // Projets restés plus de 30 jours dans la corbeille : supprimés
            // définitivement.
            tauri::async_runtime::block_on(commands::projects::purge_expired_projects(&state));

            app.manage(state);

            tracing::info!("Base de données applicative initialisée");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::device::device_status,
            commands::device::restore_device_key,
            commands::device::save_device_key_backup,
            commands::window::show_snap_layouts,
            commands::ganix::take_opened_ganix,
            commands::auth::setup_first_account,
            commands::auth::has_any_user,
            commands::auth::register,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::recover_account,
            commands::auth::regenerate_recovery_key,
            commands::auth::save_recovery_key_file,
            commands::auth::enable_email_recovery,
            commands::auth::disable_email_recovery,
            commands::auth::has_email_recovery,
            commands::auth::recover_with_email,
            commands::users::update_profile,
            commands::users::update_author_profile,
            commands::users::change_password,
            commands::users::delete_account,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::demo::list_demo_projects,
            commands::demo::create_demo_project,
            commands::projects::get_project,
            commands::projects::open_project,
            commands::projects::update_project,
            commands::projects::set_project_visibility,
            commands::projects::duplicate_project,
            commands::projects::delete_project,
            commands::projects::list_project_trash,
            commands::projects::restore_project,
            commands::projects::purge_project,
            commands::ganix::export_project,
            commands::ganix::inspect_ganix,
            commands::ganix::confirm_ganix_import,
            commands::ganix::cancel_ganix_import,
            commands::synopsis::get_synopsis,
            commands::synopsis::update_synopsis,
            commands::project_images::get_project_logo,
            commands::project_images::set_project_logo,
            commands::project_images::remove_project_logo,
            commands::project_images::list_project_gallery,
            commands::project_images::get_project_gallery_image,
            commands::project_images::add_project_gallery_image,
            commands::project_images::set_project_gallery_caption,
            commands::project_images::update_project_gallery_image,
            commands::project_images::reorder_project_gallery,
            commands::project_images::move_project_gallery_images,
            commands::project_images::list_gallery_folders,
            commands::project_images::create_gallery_folder,
            commands::project_images::rename_gallery_folder,
            commands::project_images::move_gallery_folder,
            commands::project_images::delete_gallery_folder,
            commands::project_images::delete_project_gallery_image,
            commands::novel::get_structure_node_content,
            commands::novel::set_structure_node_content,
            commands::novel::get_manuscript_contents,
            commands::novel::set_structure_node_novel,
            commands::novel::set_manuscript_goal,
            commands::novel::find_in_manuscript,
            commands::novel::replace_in_manuscript,
            commands::novel::get_writing_stats,
            commands::novel::set_daily_goal,
            commands::novel::import_manuscript,
            commands::novel::get_editorial,
            commands::image_frames::list_image_frames,
            commands::image_frames::set_image_frame,
            commands::series::get_scene_script,
            commands::series::save_scene_script,
            commands::series::get_series_blocks,
            commands::series::set_series_episode,
            commands::series::get_film_details,
            commands::series::set_film_details,
            commands::series::get_scene_breakdowns,
            commands::series::set_scene_breakdown,
            commands::series::place_structure_node,
            commands::manga::get_page_script,
            commands::manga::save_page_script,
            commands::manga::get_script_panels,
            commands::manga::move_manga_panel,
            commands::manga::create_manga_pages,
            commands::manga::set_manga_chapter,
            commands::manga::get_manga_settings,
            commands::manga::set_manga_settings,
            commands::manga::list_manga_extra_pages,
            commands::manga::create_manga_extra_page,
            commands::manga::update_manga_extra_page,
            commands::manga::reorder_manga_extra_pages,
            commands::manga::delete_manga_extra_page,
            commands::manga::set_manga_production_stage,
            commands::manga::set_manga_extra_art,
            commands::manga::remove_manga_extra_art,
            commands::manga::get_manga_extra_art,
            commands::novel::update_editorial,
            commands::novel::save_export_file,
            commands::characters::get_character_settings,
            commands::characters::set_character_detail_level,
            commands::characters::set_character_list,
            commands::characters::set_character_powers_enabled,
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
            commands::character_locations::list_character_locations,
            commands::character_locations::create_character_location,
            commands::character_locations::update_character_location,
            commands::character_locations::delete_character_location,
            commands::locations::list_locations,
            commands::locations::create_location,
            commands::locations::update_location,
            commands::locations::delete_location,
            commands::locations::get_location_settings,
            commands::locations::set_location_custom_types,
            commands::locations::set_location_list,
            commands::locations::set_location_detail_level,
            commands::locations::get_location_portrait,
            commands::locations::set_location_portrait,
            commands::locations::remove_location_portrait,
            commands::locations::list_location_gallery,
            commands::locations::get_location_gallery_image,
            commands::locations::add_location_gallery_image,
            commands::locations::set_location_gallery_caption,
            commands::locations::delete_location_gallery_image,
            commands::world::get_world_settings,
            commands::world::set_world_enabled,
            commands::world::set_world_categories,
            commands::world::set_world_detail_level,
            commands::world::set_world_custom_types,
            commands::world::set_world_list,
            commands::world::list_world_entries,
            commands::world::create_world_entry,
            commands::world::update_world_entry,
            commands::world::delete_world_entry,
            commands::world::set_species_character,
            commands::world::create_species_character,
            commands::world::get_world_entry_portrait,
            commands::world::set_world_entry_portrait,
            commands::world::remove_world_entry_portrait,
            commands::world::list_world_entry_gallery,
            commands::world::get_world_entry_gallery_image,
            commands::world::add_world_entry_gallery_image,
            commands::world::set_world_entry_gallery_caption,
            commands::world::delete_world_entry_gallery_image,
            commands::world::list_world_links,
            commands::world::create_world_link,
            commands::world::update_world_link,
            commands::world::delete_world_link,
            commands::history::list_activity,
            commands::history::list_versions,
            commands::history::create_version,
            commands::history::restore_version,
            commands::history::delete_version,
            commands::history::search_project,
            commands::history::get_work_calendar,
            commands::trash::list_trash,
            commands::trash::restore_trash,
            commands::trash::purge_trash,
            commands::trash::empty_trash,
            commands::notes::list_note_folders,
            commands::notes::create_note_folder,
            commands::notes::rename_note_folder,
            commands::notes::move_note_folder,
            commands::notes::delete_note_folder,
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::move_note,
            commands::notes::delete_note,
            commands::notes::get_system_notes,
            commands::notes::set_system_notes,
            commands::notes::sync_system_notes,
            commands::notes::list_sticky_notes,
            commands::notes::create_sticky_note,
            commands::notes::update_sticky_note,
            commands::notes::raise_sticky_note,
            commands::notes::delete_sticky_note,
            commands::relations::list_relations,
            commands::relations::create_relation,
            commands::relations::update_relation,
            commands::relations::delete_relation,
            commands::relations::get_graph_positions,
            commands::relations::save_graph_positions,
            commands::relations::clear_graph_positions,
            commands::structure::get_structure,
            commands::structure::set_structure_template,
            commands::structure::set_structure_levels,
            commands::structure::set_structure_auto_numbering,
            commands::structure::renumber_structure,
            commands::structure_links::list_structure_links,
            commands::structure_links::link_structure_character,
            commands::structure_links::unlink_structure_character,
            commands::structure_links::set_structure_character_state,
            commands::structure_links::link_structure_location,
            commands::structure_links::unlink_structure_location,
            commands::structure_links::link_structure_entry,
            commands::structure_links::unlink_structure_entry,
            commands::structure::create_structure_node,
            commands::structure::update_structure_node,
            commands::structure::move_structure_node,
            commands::structure::delete_structure_node,
            commands::plot::get_plot,
            commands::plot::update_plot,
            commands::arcs_boards::list_character_arcs,
            commands::arcs_boards::save_character_arc,
            commands::arcs_boards::list_boards,
            commands::arcs_boards::create_board,
            commands::arcs_boards::rename_board,
            commands::arcs_boards::save_board_items,
            commands::arcs_boards::delete_board,
            commands::sheets::get_sheet_display,
            commands::sheets::set_sheet_display,
            commands::sheets::set_panel_tree,
            commands::glossary::list_glossary_terms,
            commands::glossary::create_glossary_term,
            commands::glossary::update_glossary_term,
            commands::glossary::delete_glossary_term,
            commands::documents::list_structure_documents,
            commands::documents::count_structure_documents,
            commands::documents::get_structure_document_content,
            commands::documents::pick_structure_documents,
            commands::documents::add_structure_document,
            commands::documents::update_structure_document_content,
            commands::documents::pick_structure_document_replacement,
            commands::documents::rename_structure_document,
            commands::documents::update_structure_document_note,
            commands::documents::move_structure_document,
            commands::documents::reorder_structure_documents,
            commands::documents::delete_structure_document,
            commands::documents::save_structure_document_as,
            commands::documents::list_document_versions,
            commands::documents::get_document_version_content,
            commands::documents::restore_document_version,
            commands::documents::delete_document_version,
            commands::documents::open_structure_document_externally,
            commands::documents::sync_structure_document_external,
            commands::documents::close_structure_document_external,
            commands::packages::become_developer,
            commands::packages::leave_developer_mode,
            commands::packages::list_my_packages,
            commands::packages::create_theme_package,
            commands::packages::update_theme_package,
            commands::packages::delete_package,
            //commands::diagnostics::get_diagnostics,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                close_open_documents_on_exit(app);
            }
        });
}

/// Fermeture de GANIS : les documents ouverts dans une autre application
/// sont repris une dernière fois, puis leurs copies de travail (en clair)
/// sont supprimées, au lieu d'attendre le prochain lancement.
fn close_open_documents_on_exit(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    tauri::async_runtime::block_on(async {
        if let Some(user) = state.current_user().await {
            services::auth_service::reclaim_open_documents(&state, &user.id).await;
        }
    });
    services::document_service::clean_open_copies(&state.data_dir);
}
