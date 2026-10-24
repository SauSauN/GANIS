//! Commandes Tauri des outils du romancier (voir `services::novel_service`).
//!
//! Chaque commande obtient la base du projet auprès de `project_storage`,
//! qui vérifie d'abord que le projet est public ou appartient au compte
//! connecté. Les modifications gardent une version (début de séance) et
//! sont inscrites au journal, comme les autres fiches.

use crate::commands::documents::{body, header};
use crate::error::{AppError, AppResult};
use crate::services::history_service as history;
use crate::models::project::ProjectType;
use crate::services::novel_import_service::{self, ImportNode, ImportResult};
use crate::services::project_service;
use crate::services::novel_replace_service::{self, FindOptions, FindResult, ReplaceResult, ReplaceTarget};
use crate::services::novel_service::{self, Editorial, EditorialUpdate, NodeContent, NovelFields, WritingStats};
use crate::services::project_storage;
use crate::services::structure_service::StructureNode;
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::ipc::Request;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    project_storage::pool_for_request(state, project_id).await
}

/// Base du projet et type du projet (modèle du découpage par défaut).
async fn project_pool_and_type(state: &AppState, project_id: &str) -> AppResult<(SqlitePool, ProjectType)> {
    let viewer = state.viewer().await;
    let pool = project_storage::pool_for_viewer(state, project_id, &viewer).await?;
    let project = project_service::find_stored_for_viewer(&state.app_db, project_id, &viewer)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;
    Ok((pool, project.project_type))
}

/// Importe un manuscrit déjà découpé par l'interface (ajouté à la fin du plan).
#[tauri::command(rename_all = "camelCase")]
pub async fn import_manuscript(state: State<'_, AppState>, project_id: String, plan: Vec<ImportNode>) -> AppResult<ImportResult> {
    let (pool, project_type) = project_pool_and_type(&state, &project_id).await?;
    novel_import_service::import(&pool, project_type, &plan).await
}

/// Texte d'un élément du découpage (HTML de l'éditeur).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_structure_node_content(state: State<'_, AppState>, project_id: String, node_id: String) -> AppResult<String> {
    novel_service::get_content(&project_pool(&state, &project_id).await?, &node_id).await
}

/// Enregistre le texte d'un élément ; renvoie l'élément (nombre de mots à jour).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_node_content(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    content: String,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;
    history::snapshot_before(&pool, "structureNode", &node_id).await;
    let saved = novel_service::set_content(&pool, &node_id, &content).await?;
    history::record(&pool, "updated", "structureNode", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Textes de tous les éléments, pour assembler le manuscrit.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_manuscript_contents(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<NodeContent>> {
    novel_service::manuscript_contents(&project_pool(&state, &project_id).await?).await
}

/// Objectif de mots, état de rédaction et narration d'un élément.
#[tauri::command(rename_all = "camelCase")]
pub async fn set_structure_node_novel(
    state: State<'_, AppState>,
    project_id: String,
    node_id: String,
    fields: NovelFields,
) -> AppResult<StructureNode> {
    let pool = project_pool(&state, &project_id).await?;
    history::snapshot_before(&pool, "structureNode", &node_id).await;
    let saved = novel_service::set_fields(&pool, &node_id, fields).await?;
    history::record(&pool, "updated", "structureNode", &saved.id, &saved.title, "").await;
    Ok(saved)
}

/// Objectif de mots du manuscrit (`None` ou 0 : aucun).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_manuscript_goal(state: State<'_, AppState>, project_id: String, goal: Option<i64>) -> AppResult<Option<i64>> {
    novel_service::set_manuscript_goal(&project_pool(&state, &project_id).await?, goal).await
}

/// Cherche un texte dans le texte de toutes les scènes.
#[tauri::command(rename_all = "camelCase")]
pub async fn find_in_manuscript(state: State<'_, AppState>, project_id: String, options: FindOptions) -> AppResult<FindResult> {
    novel_replace_service::find(&project_pool(&state, &project_id).await?, &options).await
}

/// Remplace les occurrences choisies (une version nommée par scène modifiée).
#[tauri::command(rename_all = "camelCase")]
pub async fn replace_in_manuscript(
    state: State<'_, AppState>,
    project_id: String,
    options: FindOptions,
    replacement: String,
    targets: Vec<ReplaceTarget>,
    version_name: String,
) -> AppResult<ReplaceResult> {
    let pool = project_pool(&state, &project_id).await?;
    let name: String = version_name.trim().chars().take(200).collect();
    novel_replace_service::replace(&pool, &options, &replacement, &targets, &name).await
}

/// Mots écrits aujourd'hui, objectif quotidien, série et jours récents.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_writing_stats(state: State<'_, AppState>, project_id: String) -> AppResult<WritingStats> {
    novel_service::writing_stats(&project_pool(&state, &project_id).await?).await
}

/// Objectif de mots par jour (`None` ou 0 : aucun).
#[tauri::command(rename_all = "camelCase")]
pub async fn set_daily_goal(state: State<'_, AppState>, project_id: String, goal: Option<i64>) -> AppResult<WritingStats> {
    novel_service::set_daily_goal(&project_pool(&state, &project_id).await?, goal).await
}

/// Dossier de présentation éditoriale.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_editorial(state: State<'_, AppState>, project_id: String) -> AppResult<Editorial> {
    novel_service::get_editorial(&project_pool(&state, &project_id).await?).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn update_editorial(
    state: State<'_, AppState>,
    project_id: String,
    input: EditorialUpdate,
) -> AppResult<Editorial> {
    let pool = project_pool(&state, &project_id).await?;
    history::snapshot_before(&pool, "editorial", "default").await;
    let saved = novel_service::update_editorial(&pool, input).await?;
    history::record(&pool, "updated", "editorial", "default", "", "").await;
    Ok(saved)
}

/// Extensions acceptées pour un export (manuscrit, pitch, résumés).
const EXPORT_EXTENSIONS: [&str; 4] = ["docx", "pdf", "txt", "md"];

/// Enregistre un fichier exporté (Word, PDF, texte) à l'emplacement choisi
/// dans la fenêtre du système. Corps binaire ; en-têtes : `x-file-name`,
/// `x-dialog-title`. Renvoie le nom du fichier écrit, ou `None` si
/// l'utilisateur a annulé.
#[tauri::command]
pub async fn save_export_file(app: tauri::AppHandle, request: Request<'_>) -> AppResult<Option<String>> {
    let data = body(&request)?;
    let name = header(&request, "x-file-name")?;
    let title: String = header(&request, "x-dialog-title").unwrap_or_default().chars().take(100).collect();

    // Nom proposé sans chemin ni caractère interdit ; extension connue.
    let name: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control())
        .take(150)
        .collect();
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !EXPORT_EXTENSIONS.contains(&extension.as_str()) || name.trim_start_matches('.').is_empty() {
        return Err(AppError::validation("Type de fichier non pris en charge.").with_key("novel.exportType"));
    }

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(title)
        .set_file_name(&name)
        .add_filter(extension.to_uppercase(), &[extension.as_str()])
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
    std::fs::write(&target, data)
        .map_err(|e| AppError::io(e.to_string()).with_key("documents.fileError").with_detail(e))?;
    Ok(target.file_name().map(|n| n.to_string_lossy().into_owned()))
}
