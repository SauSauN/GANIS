//! Notes système : la description et les notes de l'auteur des fiches,
//! reprises en notes modifiables (option du projet, désactivée par défaut).
//!
//! Quand l'option est active, GANIS tient à jour un dossier « Notes système »
//! avec un sous-dossier par sorte d'élément (personnages, lieux, découpage)
//! et une note par élément :
//!
//! ```text
//! # Aldric VENN                (nom de l'élément, fixe)
//! ## Description générale      (titre fixe)
//! …texte modifiable…
//! ## Notes de l'auteur         (titre fixe)
//! …texte modifiable…
//! ```
//!
//! - La fiche est la référence : à chaque lecture des notes (`sync`), le
//!   contenu des notes système est recalculé depuis les fiches, les notes
//!   des éléments supprimés disparaissent et les nouveaux éléments ont la
//!   leur.
//! - Modifier le texte d'une note système (`update_note`) l'écrit dans la
//!   fiche : le texte sous le n-ième titre de niveau 2 va dans le n-ième
//!   champ (l'éditeur empêche de modifier, d'ajouter ou de supprimer les
//!   titres). La mise en forme n'est pas gardée : les champs des fiches sont
//!   du texte simple.
//! - Ces notes et dossiers ne se suppriment, ne se renomment et ne se
//!   déplacent pas à la main ; désactiver l'option les retire (rien n'est
//!   perdu : le texte est dans les fiches).

use crate::error::{AppError, AppResult};
use crate::services::{location_service, note_service};
use crate::utils::{new_id, now_utc};
use serde::Serialize;
use serde_json::{json, Map, Value};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};

/// Une seule synchronisation à la fois (listes et note ouvertes en même temps).
static SYNC: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const CHARACTER_MAX: usize = 20_000;
const NODE_SUMMARY_MAX: usize = 10_000;
const EXCERPT_MAX: usize = 300;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SystemNotesSettings {
    pub enabled: bool,
    pub language: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Kind {
    Character,
    Location,
    Node,
}

impl Kind {
    const ALL: [Kind; 3] = [Kind::Character, Kind::Location, Kind::Node];

    fn as_str(self) -> &'static str {
        match self {
            Kind::Character => "character",
            Kind::Location => "location",
            Kind::Node => "node",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.as_str() == value)
    }

    /// Champs repris dans la note, dans l'ordre des titres.
    fn fields(self) -> &'static [&'static str] {
        match self {
            Kind::Character | Kind::Location => &["description", "notes"],
            Kind::Node => &["summary"],
        }
    }
}

/// Titres et noms de dossiers, dans la langue choisie.
struct Texts {
    root: &'static str,
    folder: fn(Kind) -> &'static str,
    field: fn(&str) -> &'static str,
    untitled: &'static str,
}

fn texts(language: &str) -> Texts {
    if language.starts_with("en") {
        Texts {
            root: "System notes",
            folder: |kind| match kind {
                Kind::Character => "Characters",
                Kind::Location => "Locations",
                Kind::Node => "Structure",
            },
            field: |key| match key {
                "description" => "General description",
                "notes" => "Author's notes",
                _ => "Summary",
            },
            untitled: "Untitled",
        }
    } else {
        Texts {
            root: "Notes système",
            folder: |kind| match kind {
                Kind::Character => "Personnages",
                Kind::Location => "Lieux",
                Kind::Node => "Découpage",
            },
            field: |key| match key {
                "description" => "Description générale",
                "notes" => "Notes de l'auteur",
                _ => "Résumé",
            },
            untitled: "Sans nom",
        }
    }
}

fn locked() -> AppError {
    AppError::validation("Les notes système se modifient depuis leur texte seulement.").with_key("note.systemLocked")
}

// ----------------------------------------------------------------------------
// Réglage
// ----------------------------------------------------------------------------

pub async fn settings(pool: &SqlitePool) -> AppResult<SystemNotesSettings> {
    let row: Option<(i64, String)> =
        sqlx::query_as("SELECT enabled, language FROM system_notes_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?;
    let (enabled, language) = row.unwrap_or((0, "fr".to_owned()));
    Ok(SystemNotesSettings { enabled: enabled != 0, language })
}

fn clean_language(language: &str) -> String {
    if language.starts_with("en") { "en" } else { "fr" }.to_owned()
}

/// Active ou désactive les notes système. Désactiver retire le dossier et
/// ses notes (leur texte reste dans les fiches).
pub async fn set_enabled(pool: &SqlitePool, enabled: bool, language: &str) -> AppResult<SystemNotesSettings> {
    let language = clean_language(language);
    sqlx::query(
        "INSERT INTO system_notes_settings (id, enabled, language, updated_at) VALUES ('default', ?, ?, ?) \
         ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, language = excluded.language, updated_at = excluded.updated_at",
    )
    .bind(enabled)
    .bind(&language)
    .bind(now_utc())
    .execute(pool)
    .await?;

    if enabled {
        sync(pool, Some(&language)).await?;
    } else {
        remove_all(pool).await?;
    }
    settings(pool).await
}

async fn remove_all(pool: &SqlitePool) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM notes WHERE id IN (SELECT note_id FROM system_notes)").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM system_notes").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM note_folders WHERE id IN (SELECT folder_id FROM system_note_folders)")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM system_note_folders").execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Protections (appelées par note_service)
// ----------------------------------------------------------------------------

pub async fn is_system_note(pool: &SqlitePool, note_id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT note_id FROM system_notes WHERE note_id = ?")
        .bind(note_id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

pub async fn is_system_folder(pool: &SqlitePool, folder_id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT folder_id FROM system_note_folders WHERE folder_id = ?")
        .bind(folder_id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

/// Refuse l'action si la note est une note système.
pub async fn guard_note(pool: &SqlitePool, note_id: &str) -> AppResult<()> {
    if is_system_note(pool, note_id).await? {
        return Err(locked());
    }
    Ok(())
}

/// Refuse l'action si le dossier (ou le dossier visé) est un dossier système.
pub async fn guard_folder(pool: &SqlitePool, folder_id: Option<&str>) -> AppResult<()> {
    if let Some(id) = folder_id {
        if is_system_folder(pool, id).await? {
            return Err(locked());
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// Éléments repris
// ----------------------------------------------------------------------------

struct Entity {
    id: String,
    name: String,
    values: Vec<String>,
}

fn field_text(fields: &Map<String, Value>, key: &str) -> String {
    fields.get(key).and_then(Value::as_str).unwrap_or_default().to_owned()
}

async fn entities(pool: &SqlitePool, kind: Kind) -> AppResult<Vec<Entity>> {
    Ok(match kind {
        Kind::Character => {
            let rows: Vec<(String, String, String, String)> =
                sqlx::query_as("SELECT id, first_name, last_name, fields FROM characters ORDER BY first_name, last_name")
                    .fetch_all(pool)
                    .await?;
            rows.into_iter()
                .map(|(id, first, last, fields)| {
                    let fields: Map<String, Value> = serde_json::from_str(&fields).unwrap_or_default();
                    Entity {
                        id,
                        name: format!("{} {}", first.trim(), last.trim()).trim().to_owned(),
                        values: kind.fields().iter().map(|key| field_text(&fields, key)).collect(),
                    }
                })
                .collect()
        }
        Kind::Location => {
            let rows: Vec<(String, String, String)> =
                sqlx::query_as("SELECT id, name, fields FROM locations ORDER BY name").fetch_all(pool).await?;
            rows.into_iter()
                .map(|(id, name, fields)| {
                    let fields: Map<String, Value> = serde_json::from_str(&fields).unwrap_or_default();
                    Entity { id, name, values: kind.fields().iter().map(|key| field_text(&fields, key)).collect() }
                })
                .collect()
        }
        Kind::Node => {
            let rows: Vec<(String, String, String)> =
                sqlx::query_as("SELECT id, title, summary FROM structure_nodes ORDER BY level, position")
                    .fetch_all(pool)
                    .await?;
            rows.into_iter().map(|(id, name, summary)| Entity { id, name, values: vec![summary] }).collect()
        }
    })
}

// ----------------------------------------------------------------------------
// Contenu des notes
// ----------------------------------------------------------------------------

fn text_node(text: &str) -> Value {
    json!({ "type": "text", "text": text })
}

fn heading(level: u8, text: &str) -> Value {
    json!({ "type": "heading", "attrs": { "level": level }, "content": [text_node(text)] })
}

/// Document de l'éditeur : le nom en titre, puis un titre et le texte de chaque champ.
fn render(kind: Kind, entity: &Entity, t: &Texts) -> String {
    let name = if entity.name.trim().is_empty() { t.untitled } else { entity.name.trim() };
    let mut content = vec![heading(1, name)];
    for (key, value) in kind.fields().iter().zip(&entity.values) {
        content.push(heading(2, (t.field)(key)));
        let lines: Vec<&str> = value.lines().collect();
        if lines.is_empty() {
            content.push(json!({ "type": "paragraph" }));
        }
        for line in lines {
            if line.is_empty() {
                content.push(json!({ "type": "paragraph" }));
            } else {
                content.push(json!({ "type": "paragraph", "content": [text_node(line)] }));
            }
        }
    }
    json!({ "type": "doc", "content": content }).to_string()
}

fn excerpt(entity: &Entity) -> String {
    entity.values.join(" ").split_whitespace().collect::<Vec<_>>().join(" ").chars().take(EXCERPT_MAX).collect()
}

/// Texte d'un bloc de l'éditeur (listes en « - », retours à la ligne gardés).
fn block_text(node: &Value, out: &mut Vec<String>) {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
    let children = node.get("content").and_then(Value::as_array);
    match kind {
        "paragraph" | "heading" | "codeBlock" => out.push(inline_text(node)),
        "listItem" | "taskItem" => {
            let mut inner = Vec::new();
            for child in children.into_iter().flatten() {
                block_text(child, &mut inner);
            }
            let mut first = true;
            for line in inner {
                out.push(if first { format!("- {line}") } else { format!("  {line}") });
                first = false;
            }
        }
        _ => {
            for child in children.into_iter().flatten() {
                block_text(child, out);
            }
        }
    }
}

fn inline_text(node: &Value) -> String {
    let mut text = String::new();
    for child in node.get("content").and_then(Value::as_array).into_iter().flatten() {
        match child.get("type").and_then(Value::as_str).unwrap_or_default() {
            "text" => text.push_str(child.get("text").and_then(Value::as_str).unwrap_or_default()),
            "hardBreak" => text.push('\n'),
            _ => {
                if let Some(label) = child.get("attrs").and_then(|a| a.get("label")).and_then(Value::as_str) {
                    text.push_str(label);
                } else {
                    text.push_str(&inline_text(child));
                }
            }
        }
    }
    text
}

/// Texte sous chaque titre de niveau 2, dans l'ordre.
fn sections(content: &str) -> Vec<String> {
    let doc: Value = serde_json::from_str(content).unwrap_or(Value::Null);
    let mut result: Vec<Vec<String>> = Vec::new();
    for node in doc.get("content").and_then(Value::as_array).into_iter().flatten() {
        let is_h2 = node.get("type").and_then(Value::as_str) == Some("heading")
            && node.get("attrs").and_then(|a| a.get("level")).and_then(Value::as_u64) == Some(2);
        if is_h2 {
            result.push(Vec::new());
        } else if node.get("type").and_then(Value::as_str) == Some("heading")
            && node.get("attrs").and_then(|a| a.get("level")).and_then(Value::as_u64) == Some(1)
        {
            continue;
        } else if let Some(current) = result.last_mut() {
            block_text(node, current);
        }
    }
    result
        .into_iter()
        .map(|lines| {
            let text = lines.join("\n");
            text.trim_matches('\n').trim_end().to_owned()
        })
        .collect()
}

// ----------------------------------------------------------------------------
// Synchronisation
// ----------------------------------------------------------------------------

async fn ensure_folder(pool: &SqlitePool, role: &str, parent: Option<&str>, name: &str, position: i64) -> AppResult<String> {
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT f.id FROM system_note_folders s JOIN note_folders f ON f.id = s.folder_id WHERE s.role = ?",
    )
    .bind(role)
    .fetch_optional(pool)
    .await?;
    let now = now_utc();
    if let Some(id) = existing {
        sqlx::query(
            "UPDATE note_folders SET name = ?, parent_id = ?, updated_at = ? \
             WHERE id = ? AND (name <> ? OR parent_id IS NOT ?)",
        )
        .bind(name)
        .bind(parent)
        .bind(&now)
        .bind(&id)
        .bind(name)
        .bind(parent)
        .execute(pool)
        .await?;
        return Ok(id);
    }
    sqlx::query("DELETE FROM system_note_folders WHERE role = ?").bind(role).execute(pool).await?;
    let id = new_id();
    sqlx::query(
        "INSERT INTO note_folders (id, parent_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(parent)
    .bind(name)
    .bind(position)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;
    sqlx::query("INSERT INTO system_note_folders (folder_id, role) VALUES (?, ?)")
        .bind(&id)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(id)
}

/// Met les notes système à jour depuis les fiches (rien si l'option est
/// désactivée). `language` : langue des titres, si elle a changé.
pub async fn sync(pool: &SqlitePool, language: Option<&str>) -> AppResult<()> {
    if !settings(pool).await?.enabled {
        return Ok(());
    }
    let _guard = SYNC.lock().await;
    sync_locked(pool, language).await
}

async fn sync_locked(pool: &SqlitePool, language: Option<&str>) -> AppResult<()> {
    let mut current = settings(pool).await?;
    if !current.enabled {
        return Ok(());
    }
    if let Some(language) = language {
        let language = clean_language(language);
        if language != current.language {
            sqlx::query("UPDATE system_notes_settings SET language = ?, updated_at = ? WHERE id = 'default'")
                .bind(&language)
                .bind(now_utc())
                .execute(pool)
                .await?;
            current.language = language;
        }
    }
    let t = texts(&current.language);

    let root = ensure_folder(pool, "root", None, t.root, -1).await?;
    let mut folders = HashMap::new();
    for (index, kind) in Kind::ALL.into_iter().enumerate() {
        folders.insert(kind, ensure_folder(pool, kind.as_str(), Some(&root), (t.folder)(kind), index as i64).await?);
    }

    let mapped: Vec<(String, String, String)> = sqlx::query_as("SELECT note_id, kind, entity_id FROM system_notes")
        .fetch_all(pool)
        .await?;
    let mut by_entity: HashMap<(Kind, String), String> = HashMap::new();
    for (note_id, kind, entity_id) in mapped {
        if let Some(kind) = Kind::parse(&kind) {
            by_entity.insert((kind, entity_id), note_id);
        }
    }

    let mut kept: HashSet<String> = HashSet::new();
    let notes: HashMap<String, (String, String, Option<String>)> = {
        let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT n.id, n.title, n.content, n.folder_id FROM notes n JOIN system_notes s ON s.note_id = n.id",
        )
        .fetch_all(pool)
        .await?;
        rows.into_iter().map(|(id, title, content, folder)| (id, (title, content, folder))).collect()
    };

    for kind in Kind::ALL {
        let folder = &folders[&kind];
        for entity in entities(pool, kind).await? {
            let title: String = if entity.name.trim().is_empty() { t.untitled.to_owned() } else { entity.name.trim().chars().take(200).collect() };
            let content = render(kind, &entity, &t);
            let now = now_utc();
            match by_entity.get(&(kind, entity.id.clone())).filter(|id| notes.contains_key(*id)) {
                Some(note_id) => {
                    kept.insert(note_id.clone());
                    let (old_title, old_content, old_folder) = &notes[note_id];
                    if *old_title != title || *old_content != content || old_folder.as_deref() != Some(folder.as_str()) {
                        sqlx::query("UPDATE notes SET title = ?, content = ?, excerpt = ?, folder_id = ?, updated_at = ? WHERE id = ?")
                            .bind(&title)
                            .bind(&content)
                            .bind(excerpt(&entity))
                            .bind(folder)
                            .bind(&now)
                            .bind(note_id)
                            .execute(pool)
                            .await?;
                    }
                }
                None => {
                    let id = new_id();
                    sqlx::query("DELETE FROM system_notes WHERE kind = ? AND entity_id = ?")
                        .bind(kind.as_str())
                        .bind(&entity.id)
                        .execute(pool)
                        .await?;
                    sqlx::query(
                        "INSERT INTO notes (id, folder_id, title, content, excerpt, pinned, created_at, updated_at) \
                         VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
                    )
                    .bind(&id)
                    .bind(folder)
                    .bind(&title)
                    .bind(&content)
                    .bind(excerpt(&entity))
                    .bind(&now)
                    .bind(&now)
                    .execute(pool)
                    .await?;
                    sqlx::query("INSERT INTO system_notes (note_id, kind, entity_id) VALUES (?, ?, ?)")
                        .bind(&id)
                        .bind(kind.as_str())
                        .bind(&entity.id)
                        .execute(pool)
                        .await?;
                    kept.insert(id);
                }
            }
        }
    }

    // Notes d'éléments qui n'existent plus.
    for note_id in notes.keys().filter(|id| !kept.contains(*id)) {
        sqlx::query("DELETE FROM notes WHERE id = ?").bind(note_id).execute(pool).await?;
    }
    sqlx::query("DELETE FROM system_notes WHERE note_id NOT IN (SELECT id FROM notes)").execute(pool).await?;
    Ok(())
}

/// Enregistre le texte d'une note système dans sa fiche, puis recalcule la
/// note. Le titre, le dossier et l'épingle ne changent pas par ce chemin
/// (sauf l'épingle, qui reste libre).
pub async fn update_note(pool: &SqlitePool, note_id: &str, content: Option<&str>, pinned: Option<bool>) -> AppResult<note_service::Note> {
    let (kind, entity_id): (String, String) = sqlx::query_as("SELECT kind, entity_id FROM system_notes WHERE note_id = ?")
        .bind(note_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(locked)?;
    let kind = Kind::parse(&kind).ok_or_else(locked)?;

    if let Some(content) = content {
        let texts = sections(content);
        let now = now_utc();
        match kind {
            Kind::Character | Kind::Location => {
                let table = if kind == Kind::Character { "characters" } else { "locations" };
                let raw: Option<String> = sqlx::query_scalar(&format!("SELECT fields FROM {table} WHERE id = ?"))
                    .bind(&entity_id)
                    .fetch_optional(pool)
                    .await?;
                if let Some(raw) = raw {
                    let mut fields: Map<String, Value> = serde_json::from_str(&raw).unwrap_or_default();
                    let before = fields.clone();
                    for (index, key) in kind.fields().iter().enumerate() {
                        let Some(text) = texts.get(index) else { continue };
                        let max = if kind == Kind::Character {
                            CHARACTER_MAX
                        } else {
                            location_service::catalog().fields.iter().find(|f| f.key == *key).map(|f| f.max_length).unwrap_or(CHARACTER_MAX)
                        };
                        let value: String = text.trim().chars().take(max).collect();
                        if value.is_empty() {
                            fields.remove(*key);
                        } else {
                            fields.insert((*key).to_owned(), Value::String(value));
                        }
                    }
                    if fields != before {
                        sqlx::query(&format!("UPDATE {table} SET fields = ?, updated_at = ? WHERE id = ?"))
                            .bind(Value::Object(fields).to_string())
                            .bind(&now)
                            .bind(&entity_id)
                            .execute(pool)
                            .await?;
                    }
                }
            }
            Kind::Node => {
                if let Some(text) = texts.first() {
                    let value: String = text.trim().chars().take(NODE_SUMMARY_MAX).collect();
                    sqlx::query("UPDATE structure_nodes SET summary = ?, updated_at = ? WHERE id = ? AND summary <> ?")
                        .bind(&value)
                        .bind(&now)
                        .bind(&entity_id)
                        .bind(&value)
                        .execute(pool)
                        .await?;
                }
            }
        }
    }

    if let Some(pinned) = pinned {
        sqlx::query("UPDATE notes SET pinned = ? WHERE id = ?").bind(pinned).bind(note_id).execute(pool).await?;
    }

    sync(pool, None).await?;
    note_service::get_note(pool, note_id).await
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

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

    async fn add_character(pool: &SqlitePool, id: &str, first: &str, fields: &str) {
        sqlx::query(
            "INSERT INTO characters (id, first_name, last_name, fields, created_at, updated_at) VALUES (?, ?, '', ?, 'x', 'x')",
        )
        .bind(id)
        .bind(first)
        .bind(fields)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn system_note_of(pool: &SqlitePool, entity: &str) -> note_service::Note {
        let id: String = sqlx::query_scalar("SELECT note_id FROM system_notes WHERE entity_id = ?")
            .bind(entity)
            .fetch_one(pool)
            .await
            .unwrap();
        note_service::get_note(pool, &id).await.unwrap()
    }

    #[tokio::test]
    async fn disabled_by_default_then_mirrors_the_sheets() {
        let pool = pool().await;
        add_character(&pool, "c1", "Aldric", r#"{"description":"Le prince.\nHéritier.","notes":"Revoir"}"#).await;

        assert!(!settings(&pool).await.unwrap().enabled);
        sync(&pool, None).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0);

        set_enabled(&pool, true, "fr").await.unwrap();
        let note = system_note_of(&pool, "c1").await;
        assert_eq!(note.title, "Aldric");
        assert_eq!(sections(&note.content), vec!["Le prince.\nHéritier.".to_owned(), "Revoir".to_owned()]);
        assert!(note.content.contains("Description générale"));
        assert!(note_service::delete_note(&pool, &note.id).await.is_err());

        // La note modifie la fiche.
        let edited = note.content.replace("Revoir", "Tout revoir");
        update_note(&pool, &note.id, Some(&edited), None).await.unwrap();
        let fields: String = sqlx::query_scalar("SELECT fields FROM characters WHERE id = 'c1'").fetch_one(&pool).await.unwrap();
        assert!(fields.contains("Tout revoir"));

        // La fiche modifie la note ; un élément supprimé perd sa note.
        sqlx::query("UPDATE characters SET fields = '{\"description\":\"Roi.\"}' WHERE id = 'c1'").execute(&pool).await.unwrap();
        sync(&pool, Some("en")).await.unwrap();
        let note = system_note_of(&pool, "c1").await;
        assert_eq!(sections(&note.content), vec!["Roi.".to_owned(), String::new()]);
        assert!(note.content.contains("General description"));
        sqlx::query("DELETE FROM characters WHERE id = 'c1'").execute(&pool).await.unwrap();
        sync(&pool, None).await.unwrap();
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM system_notes").fetch_one(&pool).await.unwrap();
        assert_eq!(left, 0);

        set_enabled(&pool, false, "fr").await.unwrap();
        let folders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM note_folders").fetch_one(&pool).await.unwrap();
        assert_eq!(folders, 0);
    }

    #[test]
    fn lists_and_breaks_are_kept_as_text() {
        let doc = r#"{"type":"doc","content":[
            {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"X"}]},
            {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"A"}]},
            {"type":"paragraph","content":[{"type":"text","text":"un"},{"type":"hardBreak"},{"type":"text","text":"deux"}]},
            {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"point"}]}]}]},
            {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"B"}]},
            {"type":"paragraph"}
        ]}"#;
        assert_eq!(sections(doc), vec!["un\ndeux\n- point".to_owned(), String::new()]);
    }
}
