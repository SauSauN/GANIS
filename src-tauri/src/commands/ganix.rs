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
use std::sync::Mutex;
use tauri::{Emitter, State};
use tauri_plugin_dialog::DialogExt;

const FILTER_NAME: &str = "Projet GANIS";
const EXTENSION: &str = "ganix";

/// Événement d'avancement envoyé à l'interface (barre de progression).
const PROGRESS_EVENT: &str = "ganix-progress";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    /// « export » ou « import ».
    operation: &'static str,
    /// Étape en cours ; `None` : opération terminée (réussie ou non).
    stage: Option<ganix_service::Stage>,
    done: u64,
    total: u64,
}

/// Transmet l'avancement à l'interface, au plus une fois par pour cent et
/// par étape (pas un événement par ligne).
fn progress_reporter(
    app: tauri::AppHandle,
    operation: &'static str,
) -> impl Fn(ganix_service::Progress) + Send + Sync {
    let last = Mutex::new(None::<(ganix_service::Stage, u64)>);

    move |progress: ganix_service::Progress| {
        let percent = if progress.total == 0 { 0 } else { progress.done * 100 / progress.total };
        let mut last = last.lock().unwrap_or_else(|e| e.into_inner());

        if *last == Some((progress.stage, percent)) {
            return;
        }
        *last = Some((progress.stage, percent));

        let _ = app.emit(
            PROGRESS_EVENT,
            ProgressEvent { operation, stage: Some(progress.stage), done: progress.done, total: progress.total },
        );
    }
}

/// Fin d'une opération : l'interface masque la barre.
fn progress_done(app: &tauri::AppHandle, operation: &'static str) {
    let _ = app.emit(PROGRESS_EVENT, ProgressEvent { operation, stage: None, done: 0, total: 0 });
}

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

    let report = progress_reporter(app.clone(), "export");
    let written = ganix_service::write_ganix_reporting(
        &pool,
        &project,
        &target,
        &ganix_service::work_dir(&state.data_dir),
        &report,
    )
    .await;
    progress_done(&app, "export");
    written?;

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

    let report = progress_reporter(app.clone(), "import");
    let staged =
        ganix_service::stage_import_reporting(&state.data_dir, &state.app_db, &user.id, &source, &report)
            .await;
    progress_done(&app, "import");

    staged.map(Some)
}

// ----------------------------------------------------------------------------
// Fichier ouvert depuis Windows (double-clic, « Ouvrir avec »)
// ----------------------------------------------------------------------------

/// Événement envoyé à l'interface quand un `.ganix` est ouvert alors que
/// GANIS tourne déjà (voir `tauri_plugin_single_instance` dans `lib.rs`).
pub const OPENED_EVENT: &str = "ganix-opened";

/// `.ganix` reçu du système, en attente d'être montré à l'utilisateur.
///
/// Le chemin vient de la ligne de commande donnée par Windows, jamais de
/// l'interface : celle-ci demande seulement « y a-t-il un fichier ? »
/// (`take_opened_ganix`).
#[derive(Default)]
pub struct OpenedGanix(pub Mutex<Option<PathBuf>>);

impl OpenedGanix {
    pub fn set(&self, path: PathBuf) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(path);
    }

    fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    fn is_pending(&self) -> bool {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }
}

/// Premier fichier `.ganix` existant parmi les arguments d'un lancement
/// (le premier argument, le programme lui-même, est ignoré). Un chemin
/// relatif est lu depuis `cwd`.
pub fn ganix_in_args(args: impl IntoIterator<Item = String>, cwd: Option<&std::path::Path>) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)
        .map(PathBuf::from)
        .map(|path| match cwd {
            Some(cwd) if path.is_relative() => cwd.join(path),
            _ => path,
        })
        .find(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case(EXTENSION)) && path.is_file())
}

/// Fichier `.ganix` ouvert depuis Windows : contrôlé et placé dans la zone
/// d'attente, comme par « Importer » ; retourne l'aperçu, ou `None` s'il
/// n'y en a pas.
///
/// Sans connexion, le fichier est gardé pour après la connexion et l'erreur
/// `ganix.signInFirst` le signale.
#[tauri::command]
pub async fn take_opened_ganix(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opened: State<'_, OpenedGanix>,
) -> AppResult<Option<ganix_service::ImportPreview>> {
    let Some(user) = state.current_user().await else {
        if opened.is_pending() {
            return Err(AppError::validation("Connectez-vous pour importer ce projet.").with_key("ganix.signInFirst"));
        }
        return Ok(None);
    };

    let Some(source) = opened.take() else {
        return Ok(None);
    };

    let report = progress_reporter(app.clone(), "import");
    let staged =
        ganix_service::stage_import_reporting(&state.data_dir, &state.app_db, &user.id, &source, &report).await;
    progress_done(&app, "import");

    staged.map(Some)
}

#[cfg(test)]
mod tests {
    use super::ganix_in_args;

    #[test]
    fn finds_the_ganix_file_among_launch_arguments() {
        let dir = std::env::temp_dir().join(format!("ganis-args-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Roman.GANIX"), b"x").unwrap();
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        // Le programme lui-même est ignoré, un chemin relatif est lu depuis `cwd`.
        let found = ganix_in_args(args(&["ganis.exe", "--flag", "Roman.GANIX"]), Some(&dir));
        assert_eq!(found, Some(dir.join("Roman.GANIX")));

        // Fichier absent ou autre extension : rien.
        assert_eq!(ganix_in_args(args(&["ganis.exe", "Absent.ganix", "notes.txt"]), Some(&dir)), None);
        assert_eq!(ganix_in_args(args(&["Roman.GANIX"]), Some(&dir)), None);

        let _ = std::fs::remove_dir_all(&dir);
    }
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