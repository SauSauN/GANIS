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
//!   titres). Les champs des fiches sont du texte simple : la mise en forme
//!   (police, taille, gras…, listes) reste dans la note, et `reconcile` la
//!   garde tant que le texte de sa section est celui de la fiche.
//! - Ces notes et dossiers ne se suppriment, ne se renomment et ne se
//!   déplacent pas à la main ; désactiver l'option les retire (rien n'est
//!   perdu : le texte est dans les fiches).

use crate::error::{AppError, AppResult};
use crate::models::project::ProjectType;
use crate::services::structure_service::{self, StructureTemplate};
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
    english: bool,
    root: &'static str,
    folder: fn(Kind) -> &'static str,
    field: fn(&str) -> &'static str,
    untitled: &'static str,
}

fn texts(language: &str) -> Texts {
    if language.starts_with("en") {
        Texts {
            english: true,
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
            english: false,
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

/// Nom (au singulier) d'un niveau du modèle, comme dans `structure.json`.
fn template_level_name(template: StructureTemplate, index: usize, english: bool) -> &'static str {
    use StructureTemplate::*;
    let names: [(&str, &str); 3] = match template {
        Novel => [("Partie", "Part"), ("Chapitre", "Chapter"), ("Scène", "Scene")],
        Manga => [("Tome", "Volume"), ("Chapitre", "Chapter"), ("Page", "Page")],
        Film => [("Acte", "Act"), ("Séquence", "Sequence"), ("Scène", "Scene")],
        Series => [("Saison", "Season"), ("Épisode", "Episode"), ("Scène", "Scene")],
        Game => [("Acte", "Act"), ("Quête", "Quest"), ("Mission", "Mission")],
        Rpg => [("Scénario", "Scenario"), ("Session", "Session"), ("Rencontre", "Encounter")],
        Generic => [("Partie", "Part"), ("Section", "Section"), ("Élément", "Item")],
    };
    let (fr, en) = names[index.min(2)];
    if english { en } else { fr }
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
pub async fn set_enabled(pool: &SqlitePool, project_type: ProjectType, enabled: bool, language: &str) -> AppResult<SystemNotesSettings> {
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
        sync(pool, project_type, Some(&language)).await?;
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

async fn entities(pool: &SqlitePool, kind: Kind, project_type: ProjectType, t: &Texts) -> AppResult<Vec<Entity>> {
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
            // Nom affiché dans le découpage : « Chapitre 3 — Titre », « Scène 2 »,
            // « Prologue » (nom du niveau traduit, sauf nom personnalisé).
            let structure = structure_service::get_structure(pool, project_type).await?;
            let numbers = if structure.auto_numbering {
                structure_service::compute_numbers(&structure.nodes, &structure.levels)
            } else {
                HashMap::new()
            };
            let mut nodes: Vec<_> = structure.nodes.iter().collect();
            nodes.sort_by_key(|node| node.level);
            nodes
                .into_iter()
                .map(|node| {
                    let index = (node.level.max(0) as usize).min(structure.levels.len().saturating_sub(1));
                    let level = structure.levels.get(index);
                    let level_name = level
                        .and_then(|level| level.one.clone())
                        .unwrap_or_else(|| template_level_name(structure.template, index, t.english).to_owned());
                    let numbered = node.numbered && level.is_some_and(|level| level.numbering != structure_service::Numbering::None);
                    let number = if !numbered {
                        None
                    } else if structure.auto_numbering {
                        numbers.get(&node.id).copied()
                    } else {
                        node.number
                    };
                    let title = node.title.trim();
                    let name = match number {
                        Some(value) => {
                            let digits = level.map_or(1, |level| level.digits.max(1)) as usize;
                            let prefix = format!("{level_name} {value:0digits$}");
                            if title.is_empty() { prefix } else { format!("{prefix} — {title}") }
                        }
                        None if title.is_empty() => level_name,
                        None => title.to_owned(),
                    };
                    Entity { id: node.id.clone(), name, values: vec![node.summary.clone()] }
                })
                .collect()
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

/// Le texte d'un champ, un paragraphe par ligne.
fn value_blocks(value: &str) -> Vec<Value> {
    let lines: Vec<&str> = value.lines().collect();
    if lines.is_empty() {
        return vec![json!({ "type": "paragraph" })];
    }
    lines
        .into_iter()
        .map(|line| {
            if line.is_empty() {
                json!({ "type": "paragraph" })
            } else {
                json!({ "type": "paragraph", "content": [text_node(line)] })
            }
        })
        .collect()
}

fn note_name<'a>(entity: &'a Entity, t: &Texts) -> &'a str {
    if entity.name.trim().is_empty() { t.untitled } else { entity.name.trim() }
}

/// Document de l'éditeur : le nom en titre, puis un titre et le texte de chaque champ.
fn render(kind: Kind, entity: &Entity, t: &Texts) -> String {
    let mut content = vec![heading(1, note_name(entity, t))];
    for (key, value) in kind.fields().iter().zip(&entity.values) {
        content.push(heading(2, (t.field)(key)));
        content.extend(value_blocks(value));
    }
    json!({ "type": "doc", "content": content }).to_string()
}

/// Ce qu'une note système peut contenir : l'écriture seule, sans tableau,
/// encadré, schéma… (voir `noteExtensions` côté interface).
const WRITING_NODES: [&str; 10] =
    ["doc", "heading", "paragraph", "text", "hardBreak", "bulletList", "orderedList", "listItem", "taskList", "taskItem"];
const WRITING_MARKS: [&str; 5] = ["textStyle", "bold", "italic", "underline", "strike"];

fn only_writing_format(node: &Value) -> bool {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
    let marks = node.get("marks").and_then(Value::as_array);
    let children = node.get("content").and_then(Value::as_array);
    (WRITING_NODES.contains(&kind) || kind == "entityMention")
        && marks.into_iter().flatten().all(|mark| {
            WRITING_MARKS.contains(&mark.get("type").and_then(Value::as_str).unwrap_or_default())
        })
        && children.into_iter().flatten().all(only_writing_format)
}

/// Document de la note à partir de sa version précédente : la mise en forme
/// d'une section est gardée tant que son texte est celui de la fiche. Une
/// section modifiée depuis la fiche repart de son texte ; les titres suivent
/// le nom de l'élément et la langue.
fn reconcile(kind: Kind, entity: &Entity, t: &Texts, previous: &str) -> String {
    let doc: Value = serde_json::from_str(previous).unwrap_or(Value::Null);
    if !only_writing_format(&doc) {
        return render(kind, entity, t);
    }
    let (title, sections) = split_sections(&doc);
    if sections.len() != kind.fields().len() {
        return render(kind, entity, t);
    }
    let keep_heading = |old: Option<&Value>, level: u8, text: &str| match old {
        Some(node) if inline_text(node) == text => node.clone(),
        _ => heading(level, text),
    };

    let mut content = vec![keep_heading(title, 1, note_name(entity, t))];
    for ((key, value), (old_heading, blocks)) in kind.fields().iter().zip(&entity.values).zip(&sections) {
        content.push(keep_heading(Some(old_heading), 2, (t.field)(key)));
        if !blocks.is_empty() && section_text(blocks).trim() == value.trim() {
            content.extend(blocks.iter().map(|block| (*block).clone()));
        } else {
            content.extend(value_blocks(value));
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

/// Le titre de niveau 1, puis chaque titre de niveau 2 et les blocs qui le suivent.
#[allow(clippy::type_complexity)]
fn split_sections(doc: &Value) -> (Option<&Value>, Vec<(&Value, Vec<&Value>)>) {
    let mut title = None;
    let mut result: Vec<(&Value, Vec<&Value>)> = Vec::new();
    for node in doc.get("content").and_then(Value::as_array).into_iter().flatten() {
        let level = (node.get("type").and_then(Value::as_str) == Some("heading"))
            .then(|| node.get("attrs").and_then(|a| a.get("level")).and_then(Value::as_u64))
            .flatten();
        match level {
            Some(2) => result.push((node, Vec::new())),
            Some(1) => title = title.or(Some(node)),
            _ => {
                if let Some((_, blocks)) = result.last_mut() {
                    blocks.push(node);
                }
            }
        }
    }
    (title, result)
}

fn section_text(blocks: &[&Value]) -> String {
    let mut lines = Vec::new();
    for block in blocks {
        block_text(block, &mut lines);
    }
    lines.join("\n").trim_matches('\n').trim_end().to_owned()
}

/// Texte sous chaque titre de niveau 2, dans l'ordre.
fn sections(content: &str) -> Vec<String> {
    let doc: Value = serde_json::from_str(content).unwrap_or(Value::Null);
    split_sections(&doc).1.iter().map(|(_, blocks)| section_text(blocks)).collect()
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
pub async fn sync(pool: &SqlitePool, project_type: ProjectType, language: Option<&str>) -> AppResult<()> {
    if !settings(pool).await?.enabled {
        return Ok(());
    }
    let _guard = SYNC.lock().await;
    sync_locked(pool, project_type, language).await
}

async fn sync_locked(pool: &SqlitePool, project_type: ProjectType, language: Option<&str>) -> AppResult<()> {
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
        for entity in entities(pool, kind, project_type, &t).await? {
            let title: String = if entity.name.trim().is_empty() { t.untitled.to_owned() } else { entity.name.trim().chars().take(200).collect() };
            let now = now_utc();
            match by_entity.get(&(kind, entity.id.clone())).filter(|id| notes.contains_key(*id)) {
                Some(note_id) => {
                    kept.insert(note_id.clone());
                    let (old_title, old_content, old_folder) = &notes[note_id];
                    let content = reconcile(kind, &entity, &t, old_content);
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
                    let content = render(kind, &entity, &t);
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

    refresh_one(pool, note_id, kind, &entity_id, content).await?;
    note_service::get_note(pool, note_id).await
}

/// Recalcule une note système depuis sa fiche (après l'avoir enregistrée
/// depuis la note) en gardant la mise en forme de `edited`, ou à défaut de
/// la note enregistrée. Le titre (nom de l'élément) ne change pas ici : il
/// suit la fiche à la prochaine lecture des notes.
async fn refresh_one(pool: &SqlitePool, note_id: &str, kind: Kind, entity_id: &str, edited: Option<&str>) -> AppResult<()> {
    let _guard = SYNC.lock().await;
    let t = texts(&settings(pool).await?.language);
    let (title, stored): (String, String) =
        sqlx::query_as("SELECT title, content FROM notes WHERE id = ?").bind(note_id).fetch_one(pool).await?;
    let values: Vec<String> = match kind {
        Kind::Node => {
            let summary: Option<String> =
                sqlx::query_scalar("SELECT summary FROM structure_nodes WHERE id = ?").bind(entity_id).fetch_optional(pool).await?;
            vec![summary.unwrap_or_default()]
        }
        Kind::Character | Kind::Location => {
            let table = if kind == Kind::Character { "characters" } else { "locations" };
            let raw: Option<String> = sqlx::query_scalar(&format!("SELECT fields FROM {table} WHERE id = ?"))
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            let fields: Map<String, Value> = raw.and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default();
            kind.fields().iter().map(|key| field_text(&fields, key)).collect()
        }
    };
    let entity = Entity { id: entity_id.to_owned(), name: title, values };
    sqlx::query("UPDATE notes SET content = ?, excerpt = ?, updated_at = ? WHERE id = ?")
        .bind(reconcile(kind, &entity, &t, edited.unwrap_or(&stored)))
        .bind(excerpt(&entity))
        .bind(now_utc())
        .bind(note_id)
        .execute(pool)
        .await?;
    Ok(())
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
        sync(&pool, ProjectType::Novel, None).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0);

        set_enabled(&pool, ProjectType::Novel, true, "fr").await.unwrap();
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
        sync(&pool, ProjectType::Novel, Some("en")).await.unwrap();
        let note = system_note_of(&pool, "c1").await;
        assert_eq!(sections(&note.content), vec!["Roi.".to_owned(), String::new()]);
        assert!(note.content.contains("General description"));
        sqlx::query("DELETE FROM characters WHERE id = 'c1'").execute(&pool).await.unwrap();
        sync(&pool, ProjectType::Novel, None).await.unwrap();
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM system_notes").fetch_one(&pool).await.unwrap();
        assert_eq!(left, 0);

        set_enabled(&pool, ProjectType::Novel, false, "fr").await.unwrap();
        let folders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM note_folders").fetch_one(&pool).await.unwrap();
        assert_eq!(folders, 0);
    }

    #[tokio::test]
    async fn structure_notes_are_named_like_the_plan_in_each_language() {
        let pool = pool().await;
        let chapter = structure_service::create_node(&pool, ProjectType::Novel, None, 1, "Le départ", None).await.unwrap();
        let scene = structure_service::create_node(&pool, ProjectType::Novel, Some(&chapter.id), 2, "", None).await.unwrap();
        let prologue = structure_service::create_node(&pool, ProjectType::Novel, None, 1, "Prologue", None).await.unwrap();
        structure_service::update_node(&pool, &prologue.id, None, None, Some(false), None).await.unwrap();

        set_enabled(&pool, ProjectType::Novel, true, "fr").await.unwrap();
        assert_eq!(system_note_of(&pool, &chapter.id).await.title, "Chapitre 1 — Le départ");
        assert_eq!(system_note_of(&pool, &scene.id).await.title, "Scène 1");
        assert_eq!(system_note_of(&pool, &prologue.id).await.title, "Prologue");
        let root: String = sqlx::query_scalar("SELECT f.name FROM note_folders f JOIN system_note_folders s ON s.folder_id = f.id WHERE s.role = 'root'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(root, "Notes système");

        sync(&pool, ProjectType::Novel, Some("en-US")).await.unwrap();
        let note = system_note_of(&pool, &scene.id).await;
        assert_eq!(note.title, "Scene 1");
        assert!(note.content.contains("Summary"));
        assert_eq!(system_note_of(&pool, &chapter.id).await.title, "Chapter 1 — Le départ");
        let root: String = sqlx::query_scalar("SELECT f.name FROM note_folders f JOIN system_note_folders s ON s.folder_id = f.id WHERE s.role = 'root'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(root, "System notes");

        // Enregistrer le texte depuis la note garde le titre et la langue.
        let edited = note.content.replace(r#""type":"paragraph"}"#, r#""type":"paragraph","content":[{"type":"text","text":"Arrivée"}]}"#);
        let saved = update_note(&pool, &note.id, Some(&edited), None).await.unwrap();
        assert_eq!(saved.title, "Scene 1");
        assert!(saved.content.contains("Summary") && saved.content.contains("Arrivée"));
    }

    /// Note d'un personnage : la description en police choisie et en liste.
    fn formatted(description_title: &str, notes_title: &str, notes: &str) -> String {
        json!({ "type": "doc", "content": [
            heading(1, "Aldric"),
            heading(2, description_title),
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Le prince", "marks": [{ "type": "textStyle", "attrs": { "fontFamily": "Georgia", "fontSize": "20px" } }, { "type": "bold" }] },
            ] },
            { "type": "bulletList", "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [text_node("Héritier")] }] }] },
            heading(2, notes_title),
            { "type": "paragraph", "content": [text_node(notes)] },
        ] })
        .to_string()
    }

    #[tokio::test]
    async fn formatting_survives_saving_and_syncing() {
        let pool = pool().await;
        add_character(&pool, "c1", "Aldric", r#"{"description":"Ancien","notes":"Revoir"}"#).await;
        set_enabled(&pool, ProjectType::Novel, true, "fr").await.unwrap();
        let note = system_note_of(&pool, "c1").await;

        let saved = update_note(&pool, &note.id, Some(&formatted("Description générale", "Notes de l'auteur", "Revoir")), None).await.unwrap();
        assert!(saved.content.contains("Georgia") && saved.content.contains("bulletList"));

        // La fiche reste en texte simple.
        let fields: String = sqlx::query_scalar("SELECT fields FROM characters WHERE id = 'c1'").fetch_one(&pool).await.unwrap();
        assert!(fields.contains(r"Le prince\n- Héritier") && !fields.contains("Georgia"));

        // Une lecture ne change rien, et ne réécrit pas la note.
        sync(&pool, ProjectType::Novel, None).await.unwrap();
        assert_eq!(system_note_of(&pool, "c1").await.content, saved.content);
        assert_eq!(system_note_of(&pool, "c1").await.updated_at, saved.updated_at);

        // Épingler non plus.
        let pinned = update_note(&pool, &note.id, None, Some(true)).await.unwrap();
        assert!(pinned.content.contains("Georgia"));

        // Les titres suivent la langue, la mise en forme reste.
        sync(&pool, ProjectType::Novel, Some("en")).await.unwrap();
        let english = system_note_of(&pool, "c1").await;
        assert!(english.content.contains("General description") && english.content.contains("Georgia"));

        // Une autre section modifiée dans la fiche : celle-ci garde sa mise en forme.
        let edit = r#"{"description":"Le prince\n- Héritier","notes":"Depuis la fiche"}"#;
        sqlx::query("UPDATE characters SET fields = ? WHERE id = 'c1'").bind(edit).execute(&pool).await.unwrap();
        sync(&pool, ProjectType::Novel, None).await.unwrap();
        let note = system_note_of(&pool, "c1").await;
        assert!(note.content.contains("Georgia") && note.content.contains("Depuis la fiche"));

        // Sa propre section modifiée dans la fiche : elle repart du nouveau texte.
        sqlx::query("UPDATE characters SET fields = '{\"description\":\"Roi\",\"notes\":\"Depuis la fiche\"}' WHERE id = 'c1'").execute(&pool).await.unwrap();
        sync(&pool, ProjectType::Novel, None).await.unwrap();
        let note = system_note_of(&pool, "c1").await;
        assert!(!note.content.contains("Georgia") && note.content.contains("Roi"));
        assert_eq!(sections(&note.content), vec!["Roi".to_owned(), "Depuis la fiche".to_owned()]);
    }

    #[tokio::test]
    async fn only_writing_format_is_stored() {
        let pool = pool().await;
        add_character(&pool, "c1", "Aldric", r#"{"description":"","notes":""}"#).await;
        set_enabled(&pool, ProjectType::Novel, true, "fr").await.unwrap();
        let note = system_note_of(&pool, "c1").await;

        let with_table = json!({ "type": "doc", "content": [
            heading(1, "Aldric"),
            heading(2, "Description générale"),
            { "type": "table", "content": [{ "type": "tableRow", "content": [{ "type": "tableCell", "content": [{ "type": "paragraph", "content": [text_node("Cellule")] }] }] }] },
            heading(2, "Notes de l'auteur"),
            { "type": "paragraph", "content": [{ "type": "text", "text": "Surligné", "marks": [{ "type": "highlight" }] }] },
        ] })
        .to_string();

        // Le texte va dans la fiche ; la note ne garde ni tableau ni surlignage.
        let saved = update_note(&pool, &note.id, Some(&with_table), None).await.unwrap();
        assert!(!saved.content.contains("table") && !saved.content.contains("highlight"));
        assert_eq!(sections(&saved.content), vec!["Cellule".to_owned(), "Surligné".to_owned()]);
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