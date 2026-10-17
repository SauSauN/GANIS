//! Commandes Tauri d'export et d'import des projets au format `.ganix`
//! (cahier des charges §23 et §24).
//!
//! Les fenêtres de choix de fichier sont ouvertes côté Rust : l'interface ne
//! fournit jamais de chemin, elle ne reçoit que le nom du fichier écrit ou
//! l'aperçu du projet à importer.
//!
//! L'import se fait en deux temps : `inspect_ganix` contrôle le fichier et
//! le place dans une zone d'attente, puis `confirm_ganix_import` (ou
//! `cancel_ganix_import`) après l'aperçu.

use crate::error::{AppError, AppResult};
use crate::services::{ganix_service, project_service, project_storage};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

const FILTER_NAME: &str = "Projet GANIS";
const EXTENSION: &str = "ganix";

fn dialog_title(title: &str) -> String {
    title.chars().take(100).collect()
}

async fn wait_for_path(
    receiver: tokio::sync::oneshot::Receiver<Option<tauri_plugin_dialog::FilePath>>,
) -> AppResult<Option<PathBuf>> {
    let Some(path) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre de fichier interrompue"))?
    else {
        return Ok(None);
    };

    path.into_path()
        .map(Some)
        .map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))
}

/// Exporte un projet accessible (public, ou privé du compte connecté) dans un fichier `.ganix` choisi par
/// lui (nom proposé : `<nom du projet>.ganix`). Retourne le nom du fichier
/// écrit, ou `None` si l'utilisateur a annulé.
///
/// Le fichier n'est pas chiffré : il doit pouvoir être ouvert depuis un
/// autre compte ou un autre ordinateur.
#[tauri::command]
pub async fn export_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    dialog_title: String,
) -> AppResult<Option<String>> {
    let viewer = state.viewer().await;

    let project = project_service::find_for_viewer(&state.app_db, &project_id, &viewer)
        .await?
        .ok_or_else(|| AppError::not_found("Projet introuvable"))?;

    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .set_file_name(ganix_service::suggested_file_name(&project.name))
        .add_filter(FILTER_NAME, &[EXTENSION])
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(mut target) = wait_for_path(receiver).await? else {
        return Ok(None);
    };

    // Extension imposée (certaines fenêtres la retirent).
    let has_extension = target
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case(EXTENSION));
    if !has_extension {
        let mut name = target.file_name().unwrap_or_default().to_os_string();
        name.push(".");
        name.push(EXTENSION);
        target.set_file_name(name);
    }

    let pool = project_storage::pool_for_viewer(&state, &project_id, &viewer).await?;

    ganix_service::write_ganix(&pool, &project, &target, &ganix_service::work_dir(&state.data_dir))
        .await?;

    tracing::info!("Projet exporté au format .ganix");

    Ok(target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned()))
}

/// Fait choisir un fichier `.ganix`, le contrôle et le place dans une zone
/// d'attente. Retourne l'aperçu à montrer, ou `None` si l'utilisateur a
/// annulé. Rien n'est encore ajouté au compte.
#[tauri::command]
pub async fn inspect_ganix(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    dialog_title: String,
) -> AppResult<Option<ganix_service::ImportPreview>> {
    let user = state.require_user().await?;

    let (sender, receiver) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .add_filter(FILTER_NAME, &[EXTENSION])
        .pick_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(source) = wait_for_path(receiver).await? else {
        return Ok(None);
    };

    ganix_service::stage_import(&state.data_dir, &state.app_db, &user.id, &source)
        .await
        .map(Some)
}

/// Ajoute au compte le projet en attente. `mode` ne sert que si
/// l'utilisateur a déjà ce projet : copie (par défaut) ou remplacement
/// après sauvegarde automatique.
#[tauri::command]
pub async fn confirm_ganix_import(
    state: State<'_, AppState>,
    staging_id: String,
    mode: Option<ganix_service::ImportMode>,
) -> AppResult<ganix_service::ImportOutcome> {
    let (user, account_key) = state.require_session().await?;

    ganix_service::confirm_import(
        &state,
        &user.id,
        &account_key,
        &staging_id,
        mode.unwrap_or_default(),
    )
    .await
}

/// Abandonne un import : la zone d'attente est supprimée.
#[tauri::command]
pub async fn cancel_ganix_import(
    state: State<'_, AppState>,
    staging_id: String,
) -> AppResult<()> {
    state.require_user().await?;

    ganix_service::cancel_import(&state.data_dir, &staging_id)
}