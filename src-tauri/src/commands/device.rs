//! Clé d'appareil : état au démarrage, clé de secours (voir
//! `security::device_key`).

use crate::db::app_db;
use crate::error::{AppError, AppResult};
use crate::security::device_key::{self, DeviceKeyIssue};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

/// État géré à la place d'`AppState` quand la base de l'application ne peut
/// pas être ouverte : seule la restauration par clé de secours est possible.
pub struct DeviceLock {
    pub data_dir: PathBuf,
    pub issue: DeviceKeyIssue,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    /// Vrai : les données sont verrouillées, la clé de secours est demandée.
    pub locked: bool,
    /// `missing`, `unreadable` ou `wrongKey` quand `locked`.
    pub issue: Option<&'static str>,
}

/// État de la clé d'appareil, appelé par l'interface avant tout le reste.
#[tauri::command]
pub fn device_status(app: tauri::AppHandle) -> DeviceStatus {
    match app.try_state::<DeviceLock>() {
        Some(lock) => DeviceStatus { locked: true, issue: Some(lock.issue.as_str()) },
        None => DeviceStatus { locked: false, issue: None },
    }
}

fn dialog_title(title: &str) -> String {
    title.chars().take(100).collect()
}

/// Données verrouillées : l'utilisateur choisit son fichier de clé de
/// secours. S'il ouvre bien la base, il devient la clé d'appareil de cet
/// ordinateur et l'application redémarre. Renvoie `false` si la fenêtre a
/// été fermée sans choix.
#[tauri::command(rename_all = "camelCase")]
pub async fn restore_device_key(app: tauri::AppHandle, dialog_title: String) -> AppResult<bool> {
    let data_dir = match app.try_state::<DeviceLock>() {
        Some(lock) => lock.data_dir.clone(),
        None => return Err(AppError::conflict("Les données ne sont pas verrouillées.")),
    };

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .add_filter("Texte", &["txt"])
        .pick_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(picked) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre de fichier interrompue"))?
    else {
        return Ok(false);
    };

    let path = picked
        .into_path()
        .map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))?;

    // Un fichier de secours fait quelques centaines d'octets.
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(u64::MAX);
    if size > 64 * 1024 {
        return Err(AppError::validation("Ce fichier n'est pas une clé de secours GANIS.")
            .with_key("deviceKey.invalidBackup"));
    }

    let text = zeroize::Zeroizing::new(
        std::fs::read_to_string(&path)
            .map_err(|e| AppError::io(&e).with_detail(format!("Lecture de la clé de secours : {e}")))?,
    );
    let key = device_key::parse_backup(&text)?;

    if !app_db::key_opens_app_db(&data_dir, &key).await {
        return Err(AppError::validation(
            "Cette clé de secours ne correspond pas aux données de GANIS sur cet ordinateur.",
        )
        .with_key("deviceKey.wrongBackup"));
    }

    device_key::save(&data_dir, &key)?;
    tracing::info!("Clé d'appareil restaurée depuis une clé de secours");

    app.restart();
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDeviceKeyBackupInput {
    pub language: String,
    pub dialog_title: String,
}

/// Enregistre la clé de secours des données de cet ordinateur (compte
/// connecté uniquement). Renvoie le nom du fichier, ou `None` si la
/// fenêtre a été fermée.
#[tauri::command]
pub async fn save_device_key_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    input: SaveDeviceKeyBackupInput,
) -> AppResult<Option<String>> {
    state.require_session().await?;

    let key = device_key::load(&state.data_dir)
        .ok()
        .flatten()
        .ok_or_else(|| AppError::internal("Clé d'appareil introuvable"))?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(dialog_title(&input.dialog_title))
        .set_file_name("GANIS-cle-de-secours.txt")
        .add_filter("Texte", &["txt"])
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(picked) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre d'enregistrement interrompue"))?
    else {
        return Ok(None);
    };

    let path = picked
        .into_path()
        .map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))?;

    // Jamais dans le dossier de données : la clé à côté des données
    // chiffrées ne protégerait plus rien.
    if path.starts_with(&state.data_dir) {
        return Err(AppError::validation(
            "Enregistrez la clé de secours hors du dossier de données de GANIS (clé USB, autre dossier).",
        )
        .with_key("deviceKey.backupInDataDir"));
    }

    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let text = device_key::backup_text(&key, &input.language, &date);

    std::fs::write(&path, text.as_bytes())
        .map_err(|e| AppError::io(&e).with_detail(format!("Écriture de la clé de secours : {e}")))?;

    tracing::info!("Clé de secours de l'appareil enregistrée");

    Ok(path.file_name().map(|name| name.to_string_lossy().into_owned()))
}
