//! Notes de l'auteur (base du projet) : dossiers, notes et mur de post-it.
//!
//! - Les dossiers s'imbriquent (sous-dossiers). Supprimer un dossier
//!   supprime ses sous-dossiers ; leurs notes reviennent à la racine.
//! - Le contenu d'une note est le document de l'éditeur en JSON (titres,
//!   listes, tableaux, schémas…). Rust vérifie seulement que c'est un objet
//!   JSON de taille raisonnable : l'interface le relit avec le schéma de son
//!   éditeur, qui écarte tout élément inconnu.
//! - Les post-it du mur ont un texte court, une couleur, une position et
//!   une taille.

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

const MAX_FOLDER_NAME_CHARS: usize = 100;
const MAX_TITLE_CHARS: usize = 200;
/// Contenu d'une note (JSON) : 5 Mo de texte au plus.
const MAX_CONTENT_BYTES: usize = 5 * 1024 * 1024;
const MAX_EXCERPT_CHARS: usize = 300;
const MAX_STICKY_CHARS: usize = 2_000;

/// Couleurs des post-it (codes traduits par l'interface).
pub const STICKY_COLORS: [&str; 6] = ["yellow", "pink", "green", "blue", "purple", "orange"];

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Note sans son contenu (liste).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub excerpt: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Note complète.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub content: String,
    pub excerpt: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Modification d'une note (champs absents : inchangés).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteUpdate {
    pub title: Option<String>,
    pub content: Option<String>,
    pub excerpt: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StickyNote {
    pub id: String,
    pub text: String,
    pub color: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Modification d'un post-it (champs absents : inchangés).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StickyUpdate {
    pub text: Option<String>,
    pub color: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub z: Option<i64>,
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

fn folder_not_found() -> AppError {
    AppError::not_found("Dossier introuvable.").with_key("note.folderNotFound")
}

fn note_not_found() -> AppError {
    AppError::not_found("Note introuvable.").with_key("note.notFound")
}

fn sticky_not_found() -> AppError {
    AppError::not_found("Post-it introuvable.").with_key("note.stickyNotFound")
}

fn clean_folder_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("Le nom du dossier ne peut pas être vide.").with_key("note.folderNameEmpty"));
    }
    if name.chars().count() > MAX_FOLDER_NAME_CHARS {
        return Err(AppError::validation("Nom de dossier trop long.")
            .with_key("note.folderNameTooLong")
            .with_param("max", MAX_FOLDER_NAME_CHARS));
    }
    Ok(name.to_owned())
}

fn clean_title(title: &str) -> AppResult<String> {
    let title = title.trim();
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation("Titre trop long.")
            .with_key("note.titleTooLong")
            .with_param("max", MAX_TITLE_CHARS));
    }
    Ok(title.to_owned())
}

/// Contenu : vide, ou objet JSON (document de l'éditeur) de taille limitée.
fn clean_content(content: &str) -> AppResult<String> {
    if content.trim().is_empty() {
        return Ok(String::new());
    }
    if content.len() > MAX_CONTENT_BYTES {
        return Err(AppError::validation("La note est trop volumineuse.")
            .with_key("note.contentTooLarge")
            .with_param("max", MAX_CONTENT_BYTES / (1024 * 1024)));
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Object(_)) => Ok(content.to_owned()),
        _ => Err(AppError::validation("Contenu de note invalide.").with_key("note.invalidContent")),
    }
}

fn clean_excerpt(excerpt: &str) -> String {
    excerpt.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_EXCERPT_CHARS).collect()
}

fn clean_sticky_text(text: &str) -> AppResult<String> {
    if text.chars().count() > MAX_STICKY_CHARS {
        return Err(AppError::validation("Post-it trop long.")
            .with_key("note.stickyTooLong")
            .with_param("max", MAX_STICKY_CHARS));
    }
    Ok(text.to_owned())
}

fn clean_sticky_color(color: &str) -> AppResult<&'static str> {
    STICKY_COLORS
        .into_iter()
        .find(|c| *c == color)
        .ok_or_else(|| AppError::validation("Couleur inconnue.").with_key("note.invalidColor"))
}

/// Coordonnée ou taille du mur : nombre fini, dans des bornes larges.
fn clean_number(value: f64, min: f64, max: f64) -> AppResult<f64> {
    if !value.is_finite() || value < min || value > max {
        return Err(AppError::validation("Position ou taille invalide.").with_key("note.invalidGeometry"));
    }
    Ok(value)
}

// ----------------------------------------------------------------------------
// Dossiers
// ----------------------------------------------------------------------------

const FOLDER_COLUMNS: &str = "id, parent_id, name, position, created_at, updated_at";

pub async fn list_folders(pool: &SqlitePool) -> AppResult<Vec<NoteFolder>> {
    let sql = format!("SELECT {FOLDER_COLUMNS} FROM note_folders ORDER BY position, name");
    Ok(sqlx::query_as::<_, NoteFolder>(&sql).fetch_all(pool).await?)
}

async fn find_folder(pool: &SqlitePool, id: &str) -> AppResult<Option<NoteFolder>> {
    let sql = format!("SELECT {FOLDER_COLUMNS} FROM note_folders WHERE id = ?");
    Ok(sqlx::query_as::<_, NoteFolder>(&sql).bind(id).fetch_optional(pool).await?)
}

async fn check_folder(pool: &SqlitePool, id: Option<&str>) -> AppResult<()> {
    match id {
        Some(id) if find_folder(pool, id).await?.is_none() => Err(folder_not_found()),
        _ => Ok(()),
    }
}

pub async fn create_folder(pool: &SqlitePool, parent_id: Option<&str>, name: &str) -> AppResult<NoteFolder> {
    let name = clean_folder_name(name)?;
    check_folder(pool, parent_id).await?;

    let id = new_id();
    let now = now_utc();

    sqlx::query(
        "INSERT INTO note_folders (id, parent_id, name, position, created_at, updated_at) \
         SELECT ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?, ? FROM note_folders WHERE parent_id IS ?",
    )
    .bind(&id)
    .bind(parent_id)
    .bind(&name)
    .bind(&now)
    .bind(&now)
    .bind(parent_id)
    .execute(pool)
    .await?;

    find_folder(pool, &id).await?.ok_or_else(folder_not_found)
}

pub async fn rename_folder(pool: &SqlitePool, id: &str, name: &str) -> AppResult<NoteFolder> {
    let name = clean_folder_name(name)?;
    let result = sqlx::query("UPDATE note_folders SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(folder_not_found());
    }
    find_folder(pool, id).await?.ok_or_else(folder_not_found)
}

/// Déplace un dossier dans un autre (ou à la racine). Un dossier ne peut
/// pas aller dans lui-même ni dans un de ses sous-dossiers.
pub async fn move_folder(pool: &SqlitePool, id: &str, parent_id: Option<&str>) -> AppResult<NoteFolder> {
    find_folder(pool, id).await?.ok_or_else(folder_not_found)?;
    check_folder(pool, parent_id).await?;

    let mut cursor = parent_id.map(str::to_owned);
    while let Some(current) = cursor {
        if current == id {
            return Err(AppError::validation("Un dossier ne peut pas aller dans un de ses sous-dossiers.")
                .with_key("note.folderCycle"));
        }
        cursor = find_folder(pool, &current).await?.and_then(|f| f.parent_id);
    }

    sqlx::query("UPDATE note_folders SET parent_id = ?, updated_at = ? WHERE id = ?")
        .bind(parent_id)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;

    find_folder(pool, id).await?.ok_or_else(folder_not_found)
}

/// Supprime un dossier et ses sous-dossiers ; leurs notes reviennent à la
/// racine.
pub async fn delete_folder(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = crate::services::trash_service::Snapshot::new();
    snapshot.capture(&mut tx, "note_folders", "id", id).await?;
    if snapshot.is_empty() {
        return Err(folder_not_found());
    }
    let label: String = sqlx::query_scalar("SELECT name FROM note_folders WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM note_folders WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "noteFolder", id, &label).await?;
    tx.commit().await?;

    Ok(trash_id)
}

// ----------------------------------------------------------------------------
// Notes
// ----------------------------------------------------------------------------

const SUMMARY_COLUMNS: &str = "id, folder_id, title, excerpt, pinned, created_at, updated_at";
const NOTE_COLUMNS: &str = "id, folder_id, title, content, excerpt, pinned, created_at, updated_at";

/// Toutes les notes, sans leur contenu (épinglées d'abord, puis les plus
/// récentes).
pub async fn list_notes(pool: &SqlitePool) -> AppResult<Vec<NoteSummary>> {
    let sql = format!("SELECT {SUMMARY_COLUMNS} FROM notes ORDER BY pinned DESC, updated_at DESC");
    Ok(sqlx::query_as::<_, NoteSummary>(&sql).fetch_all(pool).await?)
}

pub async fn get_note(pool: &SqlitePool, id: &str) -> AppResult<Note> {
    let sql = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?");
    sqlx::query_as::<_, Note>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(note_not_found)
}

pub async fn create_note(pool: &SqlitePool, folder_id: Option<&str>, title: &str) -> AppResult<Note> {
    let title = clean_title(title)?;
    check_folder(pool, folder_id).await?;

    let id = new_id();
    let now = now_utc();

    sqlx::query(
        "INSERT INTO notes (id, folder_id, title, content, excerpt, pinned, created_at, updated_at) \
         VALUES (?, ?, ?, '', '', 0, ?, ?)",
    )
    .bind(&id)
    .bind(folder_id)
    .bind(&title)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get_note(pool, &id).await
}

pub async fn update_note(pool: &SqlitePool, id: &str, update: &NoteUpdate) -> AppResult<Note> {
    let current = get_note(pool, id).await?;

    let title = match &update.title {
        Some(value) => clean_title(value)?,
        None => current.title,
    };
    let content = match &update.content {
        Some(value) => clean_content(value)?,
        None => current.content,
    };
    let excerpt = match &update.excerpt {
        Some(value) => clean_excerpt(value),
        None => current.excerpt,
    };
    let pinned = update.pinned.unwrap_or(current.pinned);

    sqlx::query("UPDATE notes SET title = ?, content = ?, excerpt = ?, pinned = ?, updated_at = ? WHERE id = ?")
        .bind(&title)
        .bind(&content)
        .bind(&excerpt)
        .bind(pinned)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;

    get_note(pool, id).await
}

/// Range une note dans un dossier (`None` : à la racine).
pub async fn move_note(pool: &SqlitePool, id: &str, folder_id: Option<&str>) -> AppResult<Note> {
    check_folder(pool, folder_id).await?;

    let result = sqlx::query("UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?")
        .bind(folder_id)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(note_not_found());
    }

    get_note(pool, id).await
}

pub async fn delete_note(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = crate::services::trash_service::Snapshot::new();
    snapshot.capture(&mut tx, "notes", "id", id).await?;
    if snapshot.is_empty() {
        return Err(note_not_found());
    }
    let label: String = sqlx::query_scalar("SELECT title FROM notes WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM notes WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "note", id, &label).await?;
    tx.commit().await?;

    Ok(trash_id)
}

// ----------------------------------------------------------------------------
// Post-it
// ----------------------------------------------------------------------------

const STICKY_COLUMNS: &str = "id, text, color, x, y, width, height, z, created_at, updated_at";
const MAX_COORD: f64 = 100_000.0;

pub async fn list_stickies(pool: &SqlitePool) -> AppResult<Vec<StickyNote>> {
    let sql = format!("SELECT {STICKY_COLUMNS} FROM sticky_notes ORDER BY z, created_at");
    Ok(sqlx::query_as::<_, StickyNote>(&sql).fetch_all(pool).await?)
}

async fn find_sticky(pool: &SqlitePool, id: &str) -> AppResult<StickyNote> {
    let sql = format!("SELECT {STICKY_COLUMNS} FROM sticky_notes WHERE id = ?");
    sqlx::query_as::<_, StickyNote>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(sticky_not_found)
}

/// Nouveau post-it au premier plan.
pub async fn create_sticky(pool: &SqlitePool, color: &str, x: f64, y: f64) -> AppResult<StickyNote> {
    let color = clean_sticky_color(color)?;
    let x = clean_number(x, -MAX_COORD, MAX_COORD)?;
    let y = clean_number(y, -MAX_COORD, MAX_COORD)?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        "INSERT INTO sticky_notes (id, text, color, x, y, width, height, z, created_at, updated_at) \
         SELECT ?, '', ?, ?, ?, 220, 180, COALESCE(MAX(z), 0) + 1, ?, ? FROM sticky_notes",
    )
    .bind(&id)
    .bind(color)
    .bind(x)
    .bind(y)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    find_sticky(pool, &id).await
}

pub async fn update_sticky(pool: &SqlitePool, id: &str, update: &StickyUpdate) -> AppResult<StickyNote> {
    let current = find_sticky(pool, id).await?;

    let text = match &update.text {
        Some(value) => clean_sticky_text(value)?,
        None => current.text,
    };
    let color = match &update.color {
        Some(value) => clean_sticky_color(value)?.to_owned(),
        None => current.color,
    };
    let x = clean_number(update.x.unwrap_or(current.x), -MAX_COORD, MAX_COORD)?;
    let y = clean_number(update.y.unwrap_or(current.y), -MAX_COORD, MAX_COORD)?;
    let width = clean_number(update.width.unwrap_or(current.width), 120.0, 2_000.0)?;
    let height = clean_number(update.height.unwrap_or(current.height), 100.0, 2_000.0)?;
    let z = update.z.unwrap_or(current.z);

    sqlx::query(
        "UPDATE sticky_notes SET text = ?, color = ?, x = ?, y = ?, width = ?, height = ?, z = ?, updated_at = ? \
         WHERE id = ?",
    )
    .bind(&text)
    .bind(&color)
    .bind(x)
    .bind(y)
    .bind(width)
    .bind(height)
    .bind(z)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;

    find_sticky(pool, id).await
}

/// Met un post-it au premier plan.
pub async fn raise_sticky(pool: &SqlitePool, id: &str) -> AppResult<StickyNote> {
    let top: Option<i64> = sqlx::query_scalar("SELECT MAX(z) FROM sticky_notes").fetch_one(pool).await?;
    update_sticky(pool, id, &StickyUpdate { z: Some(top.unwrap_or(0) + 1), ..StickyUpdate::default() }).await
}

pub async fn delete_sticky(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = crate::services::trash_service::Snapshot::new();
    snapshot.capture(&mut tx, "sticky_notes", "id", id).await?;
    if snapshot.is_empty() {
        return Err(sticky_not_found());
    }
    let label: String = sqlx::query_scalar("SELECT substr(replace(text, char(10), ' '), 1, 80) FROM sticky_notes WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM sticky_notes WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "sticky", id, &label).await?;
    tx.commit().await?;

    Ok(trash_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn folders_nest_move_and_keep_their_notes_when_deleted() {
        let pool = pool().await;
        let world = create_folder(&pool, None, " Univers ").await.unwrap();
        let magic = create_folder(&pool, Some(&world.id), "Magie").await.unwrap();
        let other = create_folder(&pool, None, "Recherches").await.unwrap();
        assert_eq!(world.name, "Univers");
        assert_eq!((world.position, other.position), (0, 1));

        let note = create_note(&pool, Some(&magic.id), "Règles de la magie").await.unwrap();

        // Pas de dossier dans lui-même ni dans un sous-dossier.
        assert!(move_folder(&pool, &world.id, Some(&magic.id)).await.is_err());
        assert!(move_folder(&pool, &world.id, Some(&world.id)).await.is_err());
        let moved = move_folder(&pool, &magic.id, Some(&other.id)).await.unwrap();
        assert_eq!(moved.parent_id.as_deref(), Some(other.id.as_str()));
        assert_eq!(rename_folder(&pool, &magic.id, "Sorts").await.unwrap().name, "Sorts");
        assert!(rename_folder(&pool, &magic.id, "  ").await.is_err());
        assert!(create_folder(&pool, Some("inconnu"), "X").await.is_err());

        // Supprimer « Recherches » supprime « Sorts » ; la note revient à la racine.
        delete_folder(&pool, &other.id).await.unwrap();
        assert_eq!(list_folders(&pool).await.unwrap().len(), 1);
        assert_eq!(get_note(&pool, &note.id).await.unwrap().folder_id, None);
    }

    #[tokio::test]
    async fn notes_are_created_updated_moved_and_deleted() {
        let pool = pool().await;
        let folder = create_folder(&pool, None, "Idées").await.unwrap();
        let note = create_note(&pool, None, "").await.unwrap();
        assert_eq!((note.title.as_str(), note.content.as_str()), ("", ""));

        let doc = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Bonjour"}]}]}"#;
        let updated = update_note(
            &pool,
            &note.id,
            &NoteUpdate {
                title: Some(" Intrigue ".into()),
                content: Some(doc.into()),
                excerpt: Some("  Bonjour \n  le   monde ".into()),
                pinned: Some(true),
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.title, "Intrigue");
        assert_eq!(updated.content, doc);
        assert_eq!(updated.excerpt, "Bonjour le monde");
        assert!(updated.pinned);

        // Contenu qui n'est pas un document JSON : refusé.
        for bad in ["<p>html</p>", "[1,2]", "{oups"] {
            let result = update_note(&pool, &note.id, &NoteUpdate { content: Some(bad.into()), ..Default::default() }).await;
            assert!(result.is_err(), "{bad}");
        }
        assert!(update_note(&pool, &note.id, &NoteUpdate { title: Some("x".repeat(201)), ..Default::default() })
            .await
            .is_err());

        assert_eq!(move_note(&pool, &note.id, Some(&folder.id)).await.unwrap().folder_id.as_deref(), Some(folder.id.as_str()));
        assert!(move_note(&pool, &note.id, Some("inconnu")).await.is_err());
        assert_eq!(move_note(&pool, &note.id, None).await.unwrap().folder_id, None);

        let other = create_note(&pool, None, "Autre").await.unwrap();
        let list = list_notes(&pool).await.unwrap();
        assert_eq!(list[0].id, note.id); // épinglée d'abord
        assert_eq!(list.len(), 2);

        delete_note(&pool, &other.id).await.unwrap();
        assert!(delete_note(&pool, &other.id).await.is_err());
        assert!(get_note(&pool, &other.id).await.is_err());
    }

    #[tokio::test]
    async fn stickies_are_placed_raised_and_validated() {
        let pool = pool().await;
        let a = create_sticky(&pool, "yellow", 10.0, 20.0).await.unwrap();
        let b = create_sticky(&pool, "pink", 300.0, 20.0).await.unwrap();
        assert!(b.z > a.z);

        let a = update_sticky(&pool, &a.id, &StickyUpdate { text: Some("Idée !".into()), x: Some(50.0), ..Default::default() })
            .await
            .unwrap();
        assert_eq!((a.text.as_str(), a.x, a.y), ("Idée !", 50.0, 20.0));

        let a = raise_sticky(&pool, &a.id).await.unwrap();
        assert!(a.z > b.z);

        assert!(create_sticky(&pool, "noir", 0.0, 0.0).await.is_err());
        assert!(update_sticky(&pool, &a.id, &StickyUpdate { width: Some(10.0), ..Default::default() }).await.is_err());
        assert!(update_sticky(&pool, &a.id, &StickyUpdate { x: Some(f64::NAN), ..Default::default() }).await.is_err());

        delete_sticky(&pool, &b.id).await.unwrap();
        assert_eq!(list_stickies(&pool).await.unwrap().len(), 1);
    }
}
