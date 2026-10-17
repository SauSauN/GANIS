//! Commandes Tauri des documents rangés dans le découpage (voir
//! `services::document_service`).
//!
//! - Ajout : fenêtre de choix de fichiers ouverte côté Rust
//!   (`pick_structure_documents`), ou fichiers déposés dans la fiche,
//!   envoyés tels quels (`add_structure_document`, corps binaire : pas de
//!   base64, même pour 300 Mo).
//! - Lecture : le contenu est renvoyé en binaire (`ArrayBuffer` côté
//!   interface).
//! - Modification dans une autre application : copie de travail ouverte
//!   avec l'application associée au type de fichier, reprise dès qu'elle
//!   est enregistrée (`sync_structure_document_external`).

use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::services::document_service::{self as documents, DocumentVersion, ExternalStatus, StructureDocument};
use crate::services::history_service as history;
use crate::services::project_storage;
use crate::state::AppState;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

const KIND: &str = "document";

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

fn dialog_title(title: &str) -> String {
    title.chars().take(100).collect()
}

fn file_error(error: impl std::fmt::Display) -> AppError {
    AppError::io(error.to_string()).with_key("documents.fileError").with_detail(error)
}

// ----------------------------------------------------------------------------
// Corps binaire (fichiers déposés, texte modifié dans GANIS)
// ----------------------------------------------------------------------------

/// Décode un en-tête encodé par `encodeURIComponent`.
fn decode_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn header(request: &Request<'_>, name: &str) -> AppResult<String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(decode_component)
        .ok_or_else(|| AppError::validation(format!("En-tête manquant : {name}")))
}

fn body(request: &Request<'_>) -> AppResult<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(AppError::validation("Contenu du fichier manquant.")),
    }
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_structure_documents(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
) -> AppResult<Vec<StructureDocument>> {
    documents::list(&project_pool(&state, &project_id).await?, &node_id).await
}

/// Nombre de documents de chaque élément du découpage.
#[tauri::command(rename_all = "camelCase")]
pub async fn count_structure_documents(state: State<'_, AppState>, project_id: String) -> AppResult<HashMap<String, i64>> {
    Ok(documents::counts(&project_pool(&state, &project_id).await?).await?.into_iter().collect())
}

/// Contenu d'un document, en binaire.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_structure_document_content(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<Response> {
    let (_, data) = documents::content(&project_pool(&state, &project_id).await?, &document_id).await?;
    Ok(Response::new(data))
}

// ----------------------------------------------------------------------------
// Ajout
// ----------------------------------------------------------------------------

async fn add_files(pool: &SqlitePool, node_id: &str, paths: Vec<PathBuf>) -> AppResult<Vec<StructureDocument>> {
    if paths.len() > documents::MAX_FILES_AT_ONCE {
        return Err(AppError::validation("Trop de fichiers à la fois.")
            .with_key("documents.tooMany")
            .with_param("max", documents::MAX_FILES_AT_ONCE as i64));
    }

    // Tailles vérifiées avant de lire quoi que ce soit.
    for path in &paths {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let size = std::fs::metadata(path).map_err(file_error)?.len();
        if size > documents::MAX_DOCUMENT_BYTES {
            return Err(documents::too_large(&name));
        }
    }

    let mut added = Vec::with_capacity(paths.len());
    for path in paths {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let bytes = std::fs::read(&path).map_err(file_error)?;
        let document = documents::add(pool, node_id, &name, &bytes).await?;
        history::record(pool, "created", KIND, &document.id, &document.name, node_id).await;
        added.push(document);
    }
    Ok(added)
}

/// Fait choisir des fichiers et les range dans un élément du découpage.
/// Liste vide : l'utilisateur a annulé.
#[tauri::command(rename_all = "camelCase")]
pub async fn pick_structure_documents(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    dialog_title: String,
) -> AppResult<Vec<StructureDocument>> {
    let pool = project_pool(&state, &project_id).await?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .pick_files(move |paths| {
            let _ = sender.send(paths);
        });

    let Some(paths) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre de fichier interrompue"))?
    else {
        return Ok(Vec::new());
    };
    let paths = paths
        .into_iter()
        .map(|p| p.into_path().map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide")))
        .collect::<AppResult<Vec<_>>>()?;

    add_files(&pool, &node_id, paths).await
}

/// Fichier déposé dans la fiche : corps binaire, en-têtes `x-project-id`,
/// `x-node-id` et `x-name` (encodés par `encodeURIComponent`).
#[tauri::command]
pub async fn add_structure_document(state: State<'_, AppState>, request: Request<'_>) -> AppResult<StructureDocument> {
    let project_id = header(&request, "x-project-id")?;
    let node_id = header(&request, "x-node-id")?;
    let name = header(&request, "x-name")?;
    let bytes = body(&request)?;

    let pool = project_pool(&state, &project_id).await?;
    let document = documents::add(&pool, &node_id, &name, &bytes).await?;
    history::record(&pool, "created", KIND, &document.id, &document.name, &node_id).await;
    Ok(document)
}

// ----------------------------------------------------------------------------
// Modification
// ----------------------------------------------------------------------------

/// Nouveau contenu (texte modifié dans GANIS) : corps binaire, en-têtes
/// `x-project-id` et `x-document-id`. L'ancien contenu devient une version.
#[tauri::command]
pub async fn update_structure_document_content(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> AppResult<StructureDocument> {
    let project_id = header(&request, "x-project-id")?;
    let document_id = header(&request, "x-document-id")?;
    let bytes = body(&request)?;

    let pool = project_pool(&state, &project_id).await?;
    let document = documents::replace_content(&pool, &document_id, &bytes, None).await?;
    history::record(&pool, "updated", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(document)
}

/// Remplace un document par un autre fichier (l'ancien devient une
/// version). `None` : l'utilisateur a annulé.
#[tauri::command(rename_all = "camelCase")]
pub async fn pick_structure_document_replacement(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    dialog_title: String,
) -> AppResult<Option<StructureDocument>> {
    let pool = project_pool(&state, &project_id).await?;
    documents::find(&pool, &document_id).await?.ok_or_else(|| AppError::not_found("Document introuvable").with_key("documents.notFound"))?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .pick_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre de fichier interrompue"))?
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))?;

    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if std::fs::metadata(&path).map_err(file_error)?.len() > documents::MAX_DOCUMENT_BYTES {
        return Err(documents::too_large(&name));
    }
    let bytes = std::fs::read(&path).map_err(file_error)?;
    let document = documents::replace_content(&pool, &document_id, &bytes, Some(&name)).await?;
    history::record(&pool, "updated", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(Some(document))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rename_structure_document(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    name: String,
) -> AppResult<StructureDocument> {
    let pool = project_pool(&state, &project_id).await?;
    let document = documents::rename(&pool, &document_id, &name).await?;
    history::record(&pool, "updated", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(document)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_structure_document_note(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    note: String,
) -> AppResult<StructureDocument> {
    let pool = project_pool(&state, &project_id).await?;
    let document = documents::set_note(&pool, &document_id, &note).await?;
    history::record(&pool, "updated", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(document)
}

/// Range le document dans un autre élément du découpage.
#[tauri::command(rename_all = "camelCase")]
pub async fn move_structure_document(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    node_id: String,
) -> AppResult<StructureDocument> {
    let pool = project_pool(&state, &project_id).await?;
    let document = documents::move_to(&pool, &document_id, &node_id).await?;
    history::record(&pool, "moved", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(document)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reorder_structure_documents(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    ids: Vec<String>,
) -> AppResult<Vec<StructureDocument>> {
    let pool = project_pool(&state, &project_id).await?;
    let list = documents::reorder(&pool, &node_id, &ids).await?;
    history::touch_day(&pool).await;
    Ok(list)
}

/// Met le document à la corbeille ; renvoie l'identifiant de l'entrée.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_structure_document(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<String> {
    let pool = project_pool(&state, &project_id).await?;
    let trash_id = documents::delete(&pool, &document_id).await?;
    history::record_deleted(&pool, &trash_id).await;
    Ok(trash_id)
}

/// Enregistre une copie du document (ou d'une de ses versions) où
/// l'utilisateur le choisit. Renvoie le nom du fichier écrit, `None` si
/// l'utilisateur a annulé.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_structure_document_as(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    version_id: Option<String>,
    dialog_title: String,
) -> AppResult<Option<String>> {
    let pool = project_pool(&state, &project_id).await?;
    let (name, data) = match version_id {
        Some(version_id) => {
            let (version, data) = documents::version_content(&pool, &version_id).await?;
            (version.name, data)
        }
        None => {
            let (document, data) = documents::content(&pool, &document_id).await?;
            (document.name, data)
        }
    };

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(self::dialog_title(&dialog_title))
        .set_file_name(&name)
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver
        .await
        .map_err(|e| AppError::internal(e).with_detail("Fenêtre de fichier interrompue"))?
    else {
        return Ok(None);
    };
    let target = path.into_path().map_err(|e| AppError::io(e).with_detail("Emplacement choisi invalide"))?;

    std::fs::write(&target, data).map_err(file_error)?;
    Ok(target.file_name().map(|n| n.to_string_lossy().into_owned()))
}

// ----------------------------------------------------------------------------
// Versions
// ----------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
pub async fn list_document_versions(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<Vec<DocumentVersion>> {
    documents::list_versions(&project_pool(&state, &project_id).await?, &document_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_document_version_content(
    state: State<'_, AppState>,
    project_id: String,
    version_id: String,
) -> AppResult<Response> {
    let (_, data) = documents::version_content(&project_pool(&state, &project_id).await?, &version_id).await?;
    Ok(Response::new(data))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_document_version(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
    version_id: String,
) -> AppResult<StructureDocument> {
    let pool = project_pool(&state, &project_id).await?;
    let document = documents::restore_version(&pool, &document_id, &version_id).await?;
    history::record(&pool, "versionRestored", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(document)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_document_version(
    state: State<'_, AppState>,
    project_id: String,
    version_id: String,
) -> AppResult<()> {
    documents::delete_version(&project_pool(&state, &project_id).await?, &version_id).await
}

// ----------------------------------------------------------------------------
// Modification dans une autre application
// ----------------------------------------------------------------------------

/// Résultat d'une vérification : état de la copie, et document mis à jour
/// si ses modifications viennent d'être reprises.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSync {
    pub status: ExternalStatus,
    pub document: Option<StructureDocument>,
}

/// Dossier des copies ouvertes sans connexion (projets publics).
const PUBLIC_OPEN_DIR: &str = "public";

async fn open_dir(state: &AppState, document_id: &str) -> AppResult<PathBuf> {
    // Copies ouvertes rangées par compte ; celles d'un invité (projets
    // publics) dans un dossier commun.
    let viewer = state.viewer().await;
    let owner = viewer.user_id().unwrap_or(PUBLIC_OPEN_DIR);
    Ok(documents::open_dir(&state.data_dir, owner, document_id))
}

/// Ouvre le document avec l'application associée à son type (Word,
/// Acrobat, Clip Studio…). Les fichiers qui pourraient lancer un programme
/// (`.exe`, `.bat`…) ne sont jamais ouverts.
#[tauri::command(rename_all = "camelCase")]
pub async fn open_structure_document_externally(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<ExternalStatus> {
    let pool = project_pool(&state, &project_id).await?;
    let (document, data) = documents::content(&pool, &document_id).await?;
    if !documents::can_open_externally(&document.name) {
        return Err(AppError::validation("Ce type de fichier ne peut pas être ouvert depuis GANIS.")
            .with_key("documents.unsafeType"));
    }

    let dir = open_dir(&state, &document_id).await?;
    let path = documents::write_open_copy(&dir, &project_id, &document.name, &data)?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| {
        AppError::io(e.to_string()).with_key("documents.openFailed").with_detail(e)
    })?;

    Ok(ExternalStatus { open: true, changed: false, path: path.to_string_lossy().into_owned() })
}

async fn sync(state: &AppState, project_id: &str, document_id: &str) -> AppResult<ExternalSync> {
    let pool = project_pool(state, project_id).await?;
    let dir = open_dir(state, document_id).await?;
    let (status, bytes) = documents::check_open_copy(&dir)?;

    let Some(bytes) = bytes else {
        return Ok(ExternalSync { status, document: None });
    };
    let document = documents::replace_content(&pool, document_id, &bytes, None).await?;
    documents::mark_imported(&dir, &bytes)?;
    history::record(&pool, "updated", KIND, &document.id, &document.name, &document.node_id).await;
    Ok(ExternalSync { status, document: Some(document) })
}

/// Reprend la copie si elle a été enregistrée dans l'autre application
/// (appelée régulièrement tant que le document est ouvert ailleurs).
#[tauri::command(rename_all = "camelCase")]
pub async fn sync_structure_document_external(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<ExternalSync> {
    sync(&state, &project_id, &document_id).await
}

/// Termine la modification ailleurs : dernière reprise, puis la copie de
/// travail (non chiffrée) est supprimée.
#[tauri::command(rename_all = "camelCase")]
pub async fn close_structure_document_external(
    state: State<'_, AppState>,
    project_id: String,
    document_id: String,
) -> AppResult<Option<StructureDocument>> {
    let result = sync(&state, &project_id, &document_id).await;
    documents::close_open_copy(&open_dir(&state, &document_id).await?);
    Ok(result?.document)
}

#[cfg(test)]
mod tests {
    use super::decode_component;

    #[test]
    fn headers_are_decoded() {
        assert_eq!(decode_component("Chapitre%201%20%E2%80%94%20final.pdf").as_deref(), Some("Chapitre 1 — final.pdf"));
        assert_eq!(decode_component("abc").as_deref(), Some("abc"));
        assert_eq!(decode_component("%E2%80"), None);
        assert_eq!(decode_component("%zz"), None);
    }
}