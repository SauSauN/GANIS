//! Commandes de l'historique (journal, versions) et de la recherche globale.

use crate::error::AppResult;
use crate::services::history_service::{self as history, Activity, Version, VersionList};
use crate::services::project_storage;
use crate::services::search_service::{self, SearchHit};
use crate::state::AppState;
use sqlx::SqlitePool;
use tauri::State;

async fn project_pool(state: &AppState, project_id: &str) -> AppResult<SqlitePool> {
    let user = state.require_user().await?;
    project_storage::pool_for_user(state, project_id, &user.id).await
}

/// Journal du projet (ou d'un seul élément), le plus récent d'abord.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_activity(
    state: State<'_, AppState>,
    project_id: String,
    kind: Option<String>,
    item_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<Activity>> {
    let pool = project_pool(&state, &project_id).await?;
    history::list_activity(&pool, kind.as_deref(), item_id.as_deref(), limit.unwrap_or(300)).await
}

/// Versions d'un élément et son état actuel.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_versions(
    state: State<'_, AppState>,
    project_id: String,
    kind: String,
    item_id: String,
) -> AppResult<VersionList> {
    history::list_versions(&project_pool(&state, &project_id).await?, &kind, &item_id).await
}

/// Version nommée de l'état actuel.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_version(
    state: State<'_, AppState>,
    project_id: String,
    kind: String,
    item_id: String,
    name: String,
) -> AppResult<Version> {
    history::create_named_version(&project_pool(&state, &project_id).await?, &kind, &item_id, &name).await
}

/// Remet un élément dans l'état d'une version (l'état actuel est gardé).
#[tauri::command(rename_all = "camelCase")]
pub async fn restore_version(state: State<'_, AppState>, project_id: String, version_id: String) -> AppResult<()> {
    let pool = project_pool(&state, &project_id).await?;
    let (kind, item_id) = history::restore_version(&pool, &version_id).await?;
    history::record(&pool, "versionRestored", &kind, &item_id, "", "").await;
    Ok(())
}

/// Supprime une version.
#[tauri::command(rename_all = "camelCase")]
pub async fn delete_version(state: State<'_, AppState>, project_id: String, version_id: String) -> AppResult<()> {
    history::delete_version(&project_pool(&state, &project_id).await?, &version_id).await
}

/// Recherche globale dans le projet.
#[tauri::command(rename_all = "camelCase")]
pub async fn search_project(state: State<'_, AppState>, project_id: String, query: String) -> AppResult<Vec<SearchHit>> {
    search_service::search(&project_pool(&state, &project_id).await?, &query).await
}

// ----------------------------------------------------------------------------
// Calendrier de travail (tableau de bord)
// ----------------------------------------------------------------------------

/// Travail d'un projet pendant une journée.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWork {
    pub project_id: String,
    pub actions: i64,
    pub minutes: i64,
}

/// Une journée, tous projets confondus.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    pub day: String,
    pub actions: i64,
    pub minutes: i64,
    pub projects: Vec<ProjectWork>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCalendar {
    pub year: i32,
    /// Première année travaillée (pour le choix de l'année).
    pub first_year: Option<i32>,
    pub days: Vec<CalendarDay>,
}

/// Volume de travail de l'année, jour par jour, sur tous les projets du
/// compte connecté. Un projet illisible est ignoré (le reste s'affiche).
#[tauri::command(rename_all = "camelCase")]
pub async fn get_work_calendar(state: State<'_, AppState>, year: i32) -> AppResult<WorkCalendar> {
    let (user, account_key) = state.require_session().await?;
    let projects =
        crate::services::project_service::list_projects_for_user(&state.app_db, &user.id, &account_key).await?;

    let mut by_day: std::collections::BTreeMap<String, CalendarDay> = std::collections::BTreeMap::new();
    let mut first_year: Option<i32> = None;

    for project in projects {
        let pool = match project_storage::pool_for_user(&state, &project.id, &user.id).await {
            Ok(pool) => pool,
            Err(error) => {
                tracing::warn!(?error, "Calendrier de travail : projet ignoré");
                continue;
            }
        };
        if let Ok(Some(first)) = history::first_work_year(&pool).await {
            first_year = Some(first_year.map_or(first, |current| current.min(first)));
        }
        let Ok(days) = history::work_days(&pool, year).await else { continue };
        for day in days {
            let entry = by_day.entry(day.day.clone()).or_insert_with(|| CalendarDay {
                day: day.day.clone(),
                actions: 0,
                minutes: 0,
                projects: Vec::new(),
            });
            entry.actions += day.actions;
            entry.minutes += day.minutes;
            entry.projects.push(ProjectWork { project_id: project.id.clone(), actions: day.actions, minutes: day.minutes });
        }
    }

    Ok(WorkCalendar { year, first_year, days: by_day.into_values().collect() })
}
