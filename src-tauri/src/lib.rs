#[allow(dead_code)] // utilisé progressivement à partir de la Phase 2
mod error;
mod logger;
#[allow(dead_code)]
mod utils;

use error::AppResult;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    offline: bool,
}

/// Commande de test du pont Rust <-> interface (remplace `greet`).
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
            let log_dir = app.path().app_log_dir()?;
            match logger::init(&log_dir) {
                Ok(guard) => {
                    app.manage(guard);
                    tracing::info!(version = env!("CARGO_PKG_VERSION"), "GANIS démarré");
                }
                Err(e) => eprintln!("Journalisation indisponible : {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
