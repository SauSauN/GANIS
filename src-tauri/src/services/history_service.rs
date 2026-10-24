//! Historique du projet : journal des actions et versions des éléments.
//!
//! - [`record`] ajoute une ligne au journal (« Personnage Mira modifié »).
//!   Le journal est conservé 90 jours.
//! - [`snapshot_before`] garde l'état d'un élément juste avant une
//!   modification : au début d'une séance de modification seulement (au
//!   plus une version toutes les 10 minutes par élément), pour ne pas créer
//!   une version à chaque enregistrement automatique.
//! - [`restore_version`] remet un élément dans l'état d'une version ; l'état
//!   actuel est d'abord gardé comme version, donc rien n'est perdu.
//!
//! Une version est la copie de la ligne de l'élément (toutes ses colonnes,
//! avec leur type exact). Les images ne sont pas versionnées.

use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::services::trash_service::{bind, quote, select_rows, table_columns, Val};
use crate::utils::{new_id, now_utc};

/// Durée de conservation du journal.
const ACTIVITY_DAYS: i64 = 90;
/// Écart minimal entre deux versions automatiques d'un même élément.
const SESSION_MINUTES: i64 = 10;
/// Nombre maximal de versions automatiques par élément.
const MAX_AUTO_VERSIONS: i64 = 50;
const MAX_NAME_CHARS: usize = 100;

/// Colonnes jamais remplacées par une restauration. `character_id` (faune
/// et flore) : le lien avec une fiche de personnage se gère à part.
const KEPT_COLUMNS: [&str; 3] = ["id", "created_at", "character_id"];

/// Table d'un type d'élément versionné.
fn table_of(kind: &str) -> AppResult<&'static str> {
    match kind {
        "character" => Ok("characters"),
        "location" => Ok("locations"),
        "item" => Ok("items"),
        "species" => Ok("species"),
        "structureNode" => Ok("structure_nodes"),
        "note" => Ok("notes"),
        "synopsis" => Ok("synopsis"),
        "plot" => Ok("plot"),
        "editorial" => Ok("editorial"),
        _ => Err(AppError::validation("Type d'élément sans versions.").with_key("history.unknownKind")),
    }
}

fn version_not_found() -> AppError {
    AppError::not_found("Version introuvable.").with_key("history.versionNotFound")
}

fn item_not_found() -> AppError {
    AppError::not_found("Cet élément n'existe plus.").with_key("history.itemNotFound")
}

// ----------------------------------------------------------------------------
// Journal
// ----------------------------------------------------------------------------

/// Ligne du journal.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub at: String,
    /// created, updated, deleted, restored, versionRestored, moved.
    pub action: String,
    pub kind: String,
    pub item_id: String,
    pub label: String,
    /// Suppression : identifiant de l'entrée de la corbeille.
    pub detail: String,
}

/// Ajoute une action au journal. Une erreur du journal ne fait jamais
/// échouer l'action elle-même.
pub async fn record(pool: &SqlitePool, action: &str, kind: &str, item_id: &str, label: &str, detail: &str) {
    touch_day(pool).await;
    let label: String = label.chars().take(200).collect();

    // Modifications répétées d'un même élément (enregistrement automatique) :
    // une seule ligne par séance de 10 minutes, mise à jour.
    if action == "updated" {
        let merged = sqlx::query(
            "UPDATE activity SET at = ?, label = ? WHERE id = (SELECT id FROM activity \
             WHERE kind = ? AND item_id = ? AND action = 'updated' \
             AND at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) ORDER BY at DESC LIMIT 1)",
        )
        .bind(now_utc())
        .bind(&label)
        .bind(kind)
        .bind(item_id)
        .bind(format!("-{SESSION_MINUTES} minutes"))
        .execute(pool)
        .await;
        if matches!(merged, Ok(ref r) if r.rows_affected() > 0) {
            return;
        }
    }

    let result = sqlx::query(
        "INSERT INTO activity (id, at, action, kind, item_id, label, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(now_utc())
    .bind(action)
    .bind(kind)
    .bind(item_id)
    .bind(&label)
    .bind(detail)
    .execute(pool)
    .await;

    if let Err(error) = result {
        tracing::warn!(%error, "Journal du projet : écriture impossible");
    }
}

// ----------------------------------------------------------------------------
// Volume de travail par jour (calendrier du tableau de bord)
// ----------------------------------------------------------------------------

/// Compte un enregistrement pour aujourd'hui (heure locale) : une action de
/// plus, et une minute de travail de plus si c'est une nouvelle minute.
/// Une erreur ne fait jamais échouer l'action.
pub async fn touch_day(pool: &SqlitePool) {
    let now = chrono::Local::now();
    let day = now.format("%Y-%m-%d").to_string();
    let minute = now.format("%Y-%m-%dT%H:%M").to_string();

    let result = sqlx::query(
        "INSERT INTO work_days (day, actions, minutes, last_minute) VALUES (?1, 1, 1, ?2) \
         ON CONFLICT(day) DO UPDATE SET actions = actions + 1, \
         minutes = minutes + (CASE WHEN last_minute = ?2 THEN 0 ELSE 1 END), last_minute = ?2",
    )
    .bind(&day)
    .bind(&minute)
    .execute(pool)
    .await;

    if let Err(error) = result {
        tracing::warn!(%error, "Volume de travail : écriture impossible");
    }
}

/// Jour de travail d'un projet.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkDay {
    pub day: String,
    pub actions: i64,
    pub minutes: i64,
    /// Mots écrits ce jour-là (texte des scènes, solde net ; roman).
    pub words: i64,
}

/// Jours de travail d'une année (« 2026 »).
pub async fn work_days(pool: &SqlitePool, year: i32) -> AppResult<Vec<WorkDay>> {
    Ok(sqlx::query_as::<_, WorkDay>(
        "SELECT day, actions, minutes, words FROM work_days WHERE day >= ? AND day <= ? ORDER BY day",
    )
    .bind(format!("{year:04}-01-01"))
    .bind(format!("{year:04}-12-31"))
    .fetch_all(pool)
    .await?)
}

/// Première année où le projet a été travaillé.
pub async fn first_work_year(pool: &SqlitePool) -> AppResult<Option<i32>> {
    let day: Option<String> = sqlx::query_scalar("SELECT MIN(day) FROM work_days").fetch_one(pool).await?;
    Ok(day.and_then(|d| d.get(..4).and_then(|y| y.parse().ok())))
}

/// Suppression : le nom et l'élément sont lus dans la corbeille.
pub async fn record_deleted(pool: &SqlitePool, trash_id: &str) {
    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT kind, item_id, label FROM trash WHERE id = ?")
            .bind(trash_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
    if let Some((kind, item_id, label)) = row {
        record(pool, "deleted", &kind, &item_id, &label, trash_id).await;
    }
}

/// Journal, le plus récent d'abord. `kind`/`item_id` : un seul élément.
pub async fn list_activity(
    pool: &SqlitePool,
    kind: Option<&str>,
    item_id: Option<&str>,
    limit: i64,
) -> AppResult<Vec<Activity>> {
    sqlx::query("DELETE FROM activity WHERE at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)")
        .bind(format!("-{ACTIVITY_DAYS} days"))
        .execute(pool)
        .await?;

    Ok(sqlx::query_as::<_, Activity>(
        "SELECT id, at, action, kind, item_id, label, detail FROM activity \
         WHERE (?1 IS NULL OR kind = ?1) AND (?2 IS NULL OR item_id = ?2) \
         ORDER BY at DESC, rowid DESC LIMIT ?3",
    )
    .bind(kind)
    .bind(item_id)
    .bind(limit.clamp(1, 1000))
    .fetch_all(pool)
    .await?)
}

// ----------------------------------------------------------------------------
// Versions
// ----------------------------------------------------------------------------

/// Version d'un élément, pour l'interface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub name: String,
    pub created_at: String,
    /// Colonnes de la ligne (`fields`, `content`… en texte JSON).
    pub data: Map<String, Value>,
}

/// Versions d'un élément et son état actuel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionList {
    pub current: Map<String, Value>,
    pub versions: Vec<Version>,
}

fn to_json(value: &Val) -> Value {
    match value {
        Val::Null => Value::Null,
        Val::Integer(v) => Value::from(*v),
        Val::Real(v) => Value::from(*v),
        Val::Text(v) => Value::from(v.clone()),
        Val::Blob(_) => Value::Null,
    }
}

type Row = Vec<(String, Val)>;

async fn current_row(pool: &SqlitePool, kind: &str, item_id: &str) -> AppResult<Option<Row>> {
    let table = table_of(kind)?;
    let mut conn = pool.acquire().await?;
    let columns = table_columns(&mut conn, table).await?;
    let rows = select_rows(&mut conn, table, &columns, &[("id".to_owned(), Val::text(item_id))]).await?;
    Ok(rows.into_iter().next().map(|values| columns.into_iter().zip(values).collect()))
}

fn friendly(row: &Row) -> Map<String, Value> {
    row.iter().map(|(column, value)| (column.clone(), to_json(value))).collect()
}

async fn insert_version(pool: &SqlitePool, kind: &str, item_id: &str, name: &str, row: &Row) -> AppResult<String> {
    let data = serde_json::to_string(row).map_err(|e| AppError::internal(format!("Version : {e}")))?;
    let id = new_id();
    sqlx::query("INSERT INTO versions (id, kind, item_id, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(kind)
        .bind(item_id)
        .bind(name)
        .bind(data)
        .bind(now_utc())
        .execute(pool)
        .await?;

    // Les plus anciennes versions automatiques au-delà du maximum.
    sqlx::query(
        "DELETE FROM versions WHERE kind = ?1 AND item_id = ?2 AND name = '' AND id NOT IN ( \
             SELECT id FROM versions WHERE kind = ?1 AND item_id = ?2 AND name = '' \
             ORDER BY created_at DESC, rowid DESC LIMIT ?3)",
    )
    .bind(kind)
    .bind(item_id)
    .bind(MAX_AUTO_VERSIONS)
    .execute(pool)
    .await?;

    Ok(id)
}

/// Garde l'état actuel d'un élément avant une modification, sauf si une
/// version a déjà été prise il y a moins de 10 minutes (même séance).
/// Une erreur ne fait jamais échouer la modification.
pub async fn snapshot_before(pool: &SqlitePool, kind: &str, item_id: &str) {
    if let Err(error) = try_snapshot(pool, kind, item_id).await {
        tracing::warn!(%error, kind, "Version : copie impossible");
    }
}

async fn try_snapshot(pool: &SqlitePool, kind: &str, item_id: &str) -> AppResult<()> {
    let recent: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM versions WHERE kind = ? AND item_id = ? \
         AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)",
    )
    .bind(kind)
    .bind(item_id)
    .bind(format!("-{SESSION_MINUTES} minutes"))
    .fetch_one(pool)
    .await?;
    if recent > 0 {
        return Ok(());
    }

    if let Some(row) = current_row(pool, kind, item_id).await? {
        insert_version(pool, kind, item_id, "", &row).await?;
    }
    Ok(())
}

/// Crée une version nommée de l'état actuel (« Avant réécriture »).
pub async fn create_named_version(pool: &SqlitePool, kind: &str, item_id: &str, name: &str) -> AppResult<Version> {
    let name: String = name.trim().chars().take(MAX_NAME_CHARS).collect();
    if name.is_empty() {
        return Err(AppError::validation("Donnez un nom à la version.").with_key("history.nameEmpty"));
    }
    let row = current_row(pool, kind, item_id).await?.ok_or_else(item_not_found)?;
    let id = insert_version(pool, kind, item_id, &name, &row).await?;
    Ok(Version { id, name, created_at: now_utc(), data: friendly(&row) })
}

/// Versions d'un élément (la plus récente d'abord) et son état actuel.
pub async fn list_versions(pool: &SqlitePool, kind: &str, item_id: &str) -> AppResult<VersionList> {
    let current = current_row(pool, kind, item_id).await?.ok_or_else(item_not_found)?;

    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT id, name, data, created_at FROM versions WHERE kind = ? AND item_id = ? \
         ORDER BY created_at DESC, rowid DESC",
    )
    .bind(kind)
    .bind(item_id)
    .fetch_all(pool)
    .await?;

    let versions = rows
        .into_iter()
        .filter_map(|(id, name, data, created_at)| {
            let row: Row = serde_json::from_str(&data).ok()?;
            Some(Version { id, name, created_at, data: friendly(&row) })
        })
        .collect();

    Ok(VersionList { current: friendly(&current), versions })
}

/// Remet un élément dans l'état d'une version. L'état actuel est d'abord
/// gardé (version « Avant restauration »). Renvoie le type et l'identifiant.
pub async fn restore_version(pool: &SqlitePool, version_id: &str) -> AppResult<(String, String)> {
    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT kind, item_id, data FROM versions WHERE id = ?")
            .bind(version_id)
            .fetch_optional(pool)
            .await?;
    let Some((kind, item_id, data)) = row else {
        return Err(version_not_found());
    };
    let saved: Row = serde_json::from_str(&data)
        .map_err(|_| AppError::internal("Version illisible").with_key("history.unreadable"))?;

    let current = current_row(pool, &kind, &item_id).await?.ok_or_else(item_not_found)?;
    insert_version(pool, &kind, &item_id, "", &current).await?;

    // Colonnes existant encore (le schéma a pu changer depuis la version).
    let table = table_of(&kind)?;
    let existing: Vec<String> = current.iter().map(|(column, _)| column.clone()).collect();
    let mut sets: Vec<(&str, Val)> = saved
        .iter()
        .filter(|(column, _)| existing.contains(column) && !KEPT_COLUMNS.contains(&column.as_str()) && column != "updated_at")
        .map(|(column, value)| (column.as_str(), value.clone()))
        .collect();
    if existing.iter().any(|c| c == "updated_at") {
        sets.push(("updated_at", Val::text(now_utc())));
    }

    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?",
        quote(table),
        sets.iter().map(|(column, _)| format!("{} = ?", quote(column))).collect::<Vec<_>>().join(", "),
    );
    let mut query = sqlx::query(&sql);
    for (_, value) in &sets {
        query = bind(query, value)?;
    }
    query = query.bind(&item_id);
    query.execute(pool).await.map_err(|e| {
        AppError::conflict("Cette version ne peut plus être restaurée.").with_key("history.restoreFailed").with_detail(e)
    })?;

    Ok((kind, item_id))
}

/// Supprime une version.
pub async fn delete_version(pool: &SqlitePool, version_id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM versions WHERE id = ?").bind(version_id).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(version_not_found());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::note_service::{self, NoteUpdate};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    fn update(title: &str) -> NoteUpdate {
        NoteUpdate { title: Some(title.to_owned()), ..NoteUpdate::default() }
    }

    #[tokio::test]
    async fn one_version_per_session_and_restore_keeps_current() {
        let pool = pool().await;
        let note = note_service::create_note(&pool, None, "Premier jet").await.unwrap();

        snapshot_before(&pool, "note", &note.id).await;
        note_service::update_note(&pool, &note.id, &update("Deuxième jet")).await.unwrap();
        // Même séance : pas de nouvelle version.
        snapshot_before(&pool, "note", &note.id).await;
        note_service::update_note(&pool, &note.id, &update("Troisième jet")).await.unwrap();

        let list = list_versions(&pool, "note", &note.id).await.unwrap();
        assert_eq!(list.versions.len(), 1);
        assert_eq!(list.versions[0].data["title"], "Premier jet");
        assert_eq!(list.current["title"], "Troisième jet");

        restore_version(&pool, &list.versions[0].id).await.unwrap();
        assert_eq!(note_service::get_note(&pool, &note.id).await.unwrap().title, "Premier jet");
        let list = list_versions(&pool, "note", &note.id).await.unwrap();
        assert_eq!(list.versions.len(), 2);
        assert_eq!(list.versions[0].data["title"], "Troisième jet");
    }

    #[tokio::test]
    async fn work_days_count_actions_and_distinct_minutes() {
        let pool = pool().await;
        touch_day(&pool).await;
        touch_day(&pool).await;
        record(&pool, "created", "note", "n1", "Plan", "").await;

        let year: i32 = chrono::Local::now().format("%Y").to_string().parse().unwrap();
        let days = work_days(&pool, year).await.unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].actions, 3);
        // Même minute (ou deux si l'horloge a changé de minute entre-temps).
        assert!(days[0].minutes >= 1 && days[0].minutes <= 2);
        assert_eq!(first_work_year(&pool).await.unwrap(), Some(year));
        assert!(work_days(&pool, year - 1).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn named_versions_are_kept_and_activity_is_listed() {
        let pool = pool().await;
        let note = note_service::create_note(&pool, None, "Plan").await.unwrap();
        assert!(create_named_version(&pool, "note", &note.id, "  ").await.is_err());
        let named = create_named_version(&pool, "note", &note.id, "Avant réécriture").await.unwrap();
        assert_eq!(named.name, "Avant réécriture");
        assert!(create_named_version(&pool, "relation", "x", "a").await.is_err());

        record(&pool, "created", "note", &note.id, "Plan", "").await;
        let trash_id = note_service::delete_note(&pool, &note.id).await.unwrap();
        record_deleted(&pool, &trash_id).await;

        let all = list_activity(&pool, None, None, 50).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].action, "deleted");
        assert_eq!(all[0].detail, trash_id);
        assert_eq!(list_activity(&pool, Some("note"), Some(&note.id), 50).await.unwrap().len(), 2);
        assert!(list_activity(&pool, Some("character"), None, 50).await.unwrap().is_empty());
        assert!(list_versions(&pool, "note", &note.id).await.is_err());
    }
}
