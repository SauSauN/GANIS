//! Scénario de manga / BD (migration `025_manga.sql`).
//!
//! Le découpage donne les chapitres et les pages ; ce service tient :
//! - le scénario d'une page : sa fonction narrative, le « tourné de page »,
//!   et ses cases (action, cadrage, décor, indications, rythme, lieu,
//!   moment, continuité, personnages présents avec leur état, textes typés).
//!   La page s'enregistre d'un bloc (`save_page_script`) : l'ordre envoyé
//!   devient l'ordre des cases et des textes, les cases retirées vont à la
//!   corbeille (restaurables 30 jours) ;
//! - le déplacement d'une case vers une autre page ;
//! - l'objectif narratif, le nombre de pages visé et le statut d'un
//!   chapitre ;
//! - les seuils d'alerte du volume de texte.
//!
//! Les comptes de mots et les alertes sont calculés par l'interface, qui a
//! tout le scénario (`script_panels`) et le découpage.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::{AppError, AppResult};
use crate::services::structure_service::{find_node, StructureNode};
use crate::services::trash_service::Snapshot;
use crate::utils::{new_id, now_utc};

pub const SCRIPT_STATUSES: [&str; 4] = ["todo", "progress", "review", "final"];
pub const RHYTHMS: [&str; 5] = ["action", "reveal", "pause", "transition", "suspense"];
pub const TEXT_KINDS: [&str; 5] = ["dialogue", "thought", "narration", "sfx", "sign"];
pub const FRAMINGS: [&str; 12] = [
    "extremeWide",
    "wide",
    "full",
    "american",
    "medium",
    "closeUp",
    "extremeCloseUp",
    "insert",
    "overShoulder",
    "highAngle",
    "lowAngle",
    "pov",
];

const MAX_PANELS_PER_PAGE: usize = 60;
const MAX_TEXTS_PER_PANEL: usize = 60;
const MAX_FIELD_CHARS: usize = 10_000;
const MAX_SHORT_CHARS: usize = 300;
const MAX_PAGE_GOAL: i64 = 10_000;
const MAX_WORDS_THRESHOLD: i64 = 100_000;

fn node_not_found() -> AppError {
    AppError::not_found("Élément du découpage introuvable.").with_key("structure.notFound")
}

fn invalid(key: &'static str) -> AppError {
    AppError::validation("Valeur invalide.").with_key(key)
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/// Personnage présent dans une case, avec son état utile à la continuité.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PanelCharacter {
    pub character_id: String,
    #[serde(default)]
    pub state: String,
}

/// Texte d'une case.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PanelText {
    pub id: String,
    pub kind: String,
    pub character_id: Option<String>,
    pub content: String,
}

/// Case d'une page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Panel {
    pub id: String,
    pub page_id: String,
    pub position: i64,
    pub action: String,
    pub framing: String,
    pub setting: String,
    pub artist_notes: String,
    pub rhythm: Option<String>,
    pub location_id: Option<String>,
    pub moment: String,
    pub continuity: String,
    pub characters: Vec<PanelCharacter>,
    pub texts: Vec<PanelText>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct PanelRow {
    id: String,
    page_id: String,
    position: i64,
    action: String,
    framing: String,
    setting: String,
    artist_notes: String,
    rhythm: Option<String>,
    location_id: Option<String>,
    moment: String,
    continuity: String,
    created_at: String,
    updated_at: String,
}

/// Scénario d'une page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageScript {
    pub page: StructureNode,
    pub panels: Vec<Panel>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextInput {
    #[serde(default)]
    pub id: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelInput {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub framing: String,
    #[serde(default)]
    pub setting: String,
    #[serde(default)]
    pub artist_notes: String,
    #[serde(default)]
    pub rhythm: Option<String>,
    #[serde(default)]
    pub location_id: Option<String>,
    #[serde(default)]
    pub moment: String,
    #[serde(default)]
    pub continuity: String,
    #[serde(default)]
    pub characters: Vec<PanelCharacter>,
    #[serde(default)]
    pub texts: Vec<TextInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageScriptInput {
    #[serde(default)]
    pub rhythm: Option<String>,
    #[serde(default)]
    pub page_turn: bool,
    pub panels: Vec<PanelInput>,
    /// Nom de la page (« Page 3 »), pour nommer les cases mises à la corbeille.
    #[serde(default)]
    pub page_label: String,
}

/// Seuils d'alerte du volume de texte (mots).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MangaSettings {
    pub panel_words_max: Option<i64>,
    pub page_words_max: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterFields {
    #[serde(default)]
    pub narrative_goal: String,
    #[serde(default)]
    pub page_goal: Option<i64>,
    #[serde(default)]
    pub script_status: Option<String>,
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

fn text(value: &str, max: usize, key: &'static str) -> AppResult<String> {
    let value = value.trim_end();
    if value.chars().count() > max {
        return Err(AppError::validation("Ce texte est trop long.").with_key(key).with_param("max", max));
    }
    Ok(value.to_owned())
}

fn choice(value: Option<&str>, allowed: &[&str], key: &'static str) -> AppResult<Option<String>> {
    match value.map(str::trim) {
        None | Some("") => Ok(None),
        Some(v) if allowed.contains(&v) => Ok(Some(v.to_owned())),
        Some(_) => Err(invalid(key)),
    }
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

async fn panels_where(conn: &mut SqliteConnection, filter: &str, value: Option<&str>) -> AppResult<Vec<Panel>> {
    let sql = format!(
        "SELECT id, page_id, position, action, framing, setting, artist_notes, rhythm, location_id, moment, continuity, \
         created_at, updated_at FROM manga_panels {filter} ORDER BY page_id, position, created_at"
    );
    let mut query = sqlx::query_as::<_, PanelRow>(&sql);
    if let Some(value) = value {
        query = query.bind(value);
    }
    let rows = query.fetch_all(&mut *conn).await?;
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: HashSet<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    let mut characters: HashMap<String, Vec<PanelCharacter>> = HashMap::new();
    let character_rows: Vec<(String, String, String)> =
        sqlx::query_as("SELECT panel_id, character_id, state FROM manga_panel_characters ORDER BY panel_id, position")
            .fetch_all(&mut *conn)
            .await?;
    for (panel_id, character_id, state) in character_rows {
        if ids.contains(panel_id.as_str()) {
            characters.entry(panel_id).or_default().push(PanelCharacter { character_id, state });
        }
    }
    let mut texts: HashMap<String, Vec<PanelText>> = HashMap::new();
    let text_rows: Vec<(String, String, String, Option<String>, String)> =
        sqlx::query_as("SELECT panel_id, id, kind, character_id, content FROM manga_panel_texts ORDER BY panel_id, position, created_at")
            .fetch_all(&mut *conn)
            .await?;
    for (panel_id, id, kind, character_id, content) in text_rows {
        if ids.contains(panel_id.as_str()) {
            texts.entry(panel_id).or_default().push(PanelText { id, kind, character_id, content });
        }
    }

    Ok(rows
        .into_iter()
        .map(|r| Panel {
            characters: characters.remove(&r.id).unwrap_or_default(),
            texts: texts.remove(&r.id).unwrap_or_default(),
            id: r.id,
            page_id: r.page_id,
            position: r.position,
            action: r.action,
            framing: r.framing,
            setting: r.setting,
            artist_notes: r.artist_notes,
            rhythm: r.rhythm,
            location_id: r.location_id,
            moment: r.moment,
            continuity: r.continuity,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

/// Scénario d'une page.
pub async fn page_script(pool: &SqlitePool, page_id: &str) -> AppResult<PageScript> {
    let page = find_node(pool, page_id).await?.ok_or_else(node_not_found)?;
    let mut conn = pool.acquire().await?;
    let panels = panels_where(&mut conn, "WHERE page_id = ?", Some(page_id)).await?;
    Ok(PageScript { page, panels })
}

/// Toutes les cases du projet (lecture, export, suivi, continuité). L'ordre
/// des pages est rétabli par l'interface, qui connaît le plan.
pub async fn script_panels(pool: &SqlitePool) -> AppResult<Vec<Panel>> {
    let mut conn = pool.acquire().await?;
    panels_where(&mut conn, "", None).await
}

// ----------------------------------------------------------------------------
// Enregistrement d'une page
// ----------------------------------------------------------------------------

/// Enregistre le scénario d'une page d'un bloc.
pub async fn save_page_script(pool: &SqlitePool, page_id: &str, input: &PageScriptInput) -> AppResult<PageScript> {
    // Tout est vérifié avant d'écrire.
    if input.panels.len() > MAX_PANELS_PER_PAGE {
        return Err(AppError::validation("Trop de cases sur cette page.").with_key("manga.tooManyPanels").with_param("max", MAX_PANELS_PER_PAGE));
    }
    let page_rhythm = choice(input.rhythm.as_deref(), &RHYTHMS, "manga.invalidRhythm")?;
    struct Clean {
        id: Option<String>,
        action: String,
        framing: String,
        setting: String,
        artist_notes: String,
        rhythm: Option<String>,
        location_id: Option<String>,
        moment: String,
        continuity: String,
        characters: Vec<PanelCharacter>,
        texts: Vec<(Option<String>, String, Option<String>, String)>,
    }
    let mut clean = Vec::with_capacity(input.panels.len());
    for panel in &input.panels {
        if panel.texts.len() > MAX_TEXTS_PER_PANEL {
            return Err(AppError::validation("Trop de textes dans une case.").with_key("manga.tooManyTexts").with_param("max", MAX_TEXTS_PER_PANEL));
        }
        let mut seen = HashSet::new();
        let mut characters = Vec::new();
        for c in &panel.characters {
            if seen.insert(c.character_id.clone()) {
                characters.push(PanelCharacter { character_id: c.character_id.clone(), state: text(&c.state, MAX_SHORT_CHARS, "manga.fieldTooLong")? });
            }
        }
        let mut texts = Vec::with_capacity(panel.texts.len());
        for t in &panel.texts {
            let kind = choice(Some(&t.kind), &TEXT_KINDS, "manga.invalidTextKind")?.ok_or_else(|| invalid("manga.invalidTextKind"))?;
            // Seuls un dialogue et une pensée ont un locuteur.
            let speaker = if kind == "dialogue" || kind == "thought" { t.character_id.clone().filter(|c| !c.is_empty()) } else { None };
            texts.push((t.id.clone(), kind, speaker, text(&t.content, MAX_FIELD_CHARS, "manga.fieldTooLong")?));
        }
        let framing = choice(Some(&panel.framing), &FRAMINGS, "manga.invalidFraming")?.unwrap_or_default();
        clean.push(Clean {
            id: panel.id.clone(),
            action: text(&panel.action, MAX_FIELD_CHARS, "manga.fieldTooLong")?,
            framing,
            setting: text(&panel.setting, MAX_FIELD_CHARS, "manga.fieldTooLong")?,
            artist_notes: text(&panel.artist_notes, MAX_FIELD_CHARS, "manga.fieldTooLong")?,
            rhythm: choice(panel.rhythm.as_deref(), &RHYTHMS, "manga.invalidRhythm")?,
            location_id: panel.location_id.clone().filter(|l| !l.is_empty()),
            moment: text(&panel.moment, MAX_SHORT_CHARS, "manga.fieldTooLong")?,
            continuity: text(&panel.continuity, MAX_FIELD_CHARS, "manga.fieldTooLong")?,
            characters,
            texts,
        });
    }

    let mut tx = pool.begin().await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?").bind(page_id).fetch_optional(&mut *tx).await?;
    if exists.is_none() {
        return Err(node_not_found());
    }
    let now = now_utc();

    // Cases retirées : à la corbeille, une par une.
    let existing: Vec<(String, String)> =
        sqlx::query_as("SELECT id, action FROM manga_panels WHERE page_id = ? ORDER BY position").bind(page_id).fetch_all(&mut *tx).await?;
    let kept: HashSet<&str> = clean.iter().filter_map(|p| p.id.as_deref()).collect();
    for (index, (id, action)) in existing.iter().enumerate() {
        if kept.contains(id.as_str()) {
            continue;
        }
        let mut snapshot = Snapshot::new();
        snapshot.capture(&mut tx, "manga_panels", "id", id).await?;
        let excerpt: String = action.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(60).collect();
        let label = [input.page_label.trim().to_owned(), format!("#{}", index + 1), excerpt]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        snapshot.store(&mut tx, "mangaPanel", id, &label).await?;
        sqlx::query("DELETE FROM manga_panels WHERE id = ?").bind(id).execute(&mut *tx).await?;
    }
    let existing_ids: HashSet<String> = existing.into_iter().map(|(id, _)| id).filter(|id| kept.contains(id.as_str())).collect();

    for (position, panel) in clean.into_iter().enumerate() {
        let id = match panel.id.filter(|id| existing_ids.contains(id)) {
            Some(id) => {
                sqlx::query(
                    "UPDATE manga_panels SET position = ?, action = ?, framing = ?, setting = ?, artist_notes = ?, rhythm = ?, \
                     location_id = ?, moment = ?, continuity = ?, updated_at = ? WHERE id = ?",
                )
                .bind(position as i64)
                .bind(&panel.action)
                .bind(&panel.framing)
                .bind(&panel.setting)
                .bind(&panel.artist_notes)
                .bind(&panel.rhythm)
                .bind(&panel.location_id)
                .bind(&panel.moment)
                .bind(&panel.continuity)
                .bind(&now)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
                id
            }
            None => {
                let id = new_id();
                sqlx::query(
                    "INSERT INTO manga_panels (id, page_id, position, action, framing, setting, artist_notes, rhythm, location_id, \
                     moment, continuity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&id)
                .bind(page_id)
                .bind(position as i64)
                .bind(&panel.action)
                .bind(&panel.framing)
                .bind(&panel.setting)
                .bind(&panel.artist_notes)
                .bind(&panel.rhythm)
                .bind(&panel.location_id)
                .bind(&panel.moment)
                .bind(&panel.continuity)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                .map_err(|e| reference_error(e, "manga.unknownLocation"))?;
                id
            }
        };

        sqlx::query("DELETE FROM manga_panel_characters WHERE panel_id = ?").bind(&id).execute(&mut *tx).await?;
        for (index, character) in panel.characters.iter().enumerate() {
            sqlx::query("INSERT INTO manga_panel_characters (panel_id, character_id, position, state) VALUES (?, ?, ?, ?)")
                .bind(&id)
                .bind(&character.character_id)
                .bind(index as i64)
                .bind(&character.state)
                .execute(&mut *tx)
                .await
                .map_err(|e| reference_error(e, "manga.unknownCharacter"))?;
        }

        let existing_texts: HashSet<String> =
            sqlx::query_scalar::<_, String>("SELECT id FROM manga_panel_texts WHERE panel_id = ?").bind(&id).fetch_all(&mut *tx).await?.into_iter().collect();
        let mut kept_texts = HashSet::new();
        for (index, (text_id, kind, speaker, content)) in panel.texts.into_iter().enumerate() {
            match text_id.filter(|t| existing_texts.contains(t)) {
                Some(text_id) => {
                    sqlx::query("UPDATE manga_panel_texts SET position = ?, kind = ?, character_id = ?, content = ?, updated_at = ? WHERE id = ?")
                        .bind(index as i64)
                        .bind(&kind)
                        .bind(&speaker)
                        .bind(&content)
                        .bind(&now)
                        .bind(&text_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| reference_error(e, "manga.unknownCharacter"))?;
                    kept_texts.insert(text_id);
                }
                None => {
                    let text_id = new_id();
                    sqlx::query(
                        "INSERT INTO manga_panel_texts (id, panel_id, position, kind, character_id, content, created_at, updated_at) \
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    )
                    .bind(&text_id)
                    .bind(&id)
                    .bind(index as i64)
                    .bind(&kind)
                    .bind(&speaker)
                    .bind(&content)
                    .bind(&now)
                    .bind(&now)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| reference_error(e, "manga.unknownCharacter"))?;
                    kept_texts.insert(text_id);
                }
            }
        }
        for gone in existing_texts.difference(&kept_texts) {
            sqlx::query("DELETE FROM manga_panel_texts WHERE id = ?").bind(gone).execute(&mut *tx).await?;
        }
    }

    sqlx::query("UPDATE structure_nodes SET rhythm = ?, page_turn = ?, updated_at = ? WHERE id = ?")
        .bind(&page_rhythm)
        .bind(input.page_turn)
        .bind(&now)
        .bind(page_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    page_script(pool, page_id).await
}

/// Erreur de clé étrangère (personnage ou lieu supprimé entre-temps).
fn reference_error(error: sqlx::Error, key: &'static str) -> AppError {
    match &error {
        sqlx::Error::Database(db) if db.message().contains("FOREIGN KEY") => {
            AppError::validation("Un personnage ou un lieu de cette page n'existe plus.").with_key(key)
        }
        _ => error.into(),
    }
}

/// Déplace une case à la fin d'une autre page.
pub async fn move_panel(pool: &SqlitePool, panel_id: &str, page_id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let target: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?").bind(page_id).fetch_optional(&mut *tx).await?;
    if target.is_none() {
        return Err(node_not_found());
    }
    let next: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(position), -1) + 1 FROM manga_panels WHERE page_id = ?")
        .bind(page_id)
        .fetch_one(&mut *tx)
        .await?;
    let now = now_utc();
    let moved = sqlx::query("UPDATE manga_panels SET page_id = ?, position = ?, updated_at = ? WHERE id = ?")
        .bind(page_id)
        .bind(next)
        .bind(&now)
        .bind(panel_id)
        .execute(&mut *tx)
        .await?;
    if moved.rows_affected() == 0 {
        return Err(AppError::not_found("Case introuvable.").with_key("manga.panelNotFound"));
    }
    sqlx::query("UPDATE structure_nodes SET updated_at = ? WHERE id = ?").bind(&now).bind(page_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Chapitres et réglages
// ----------------------------------------------------------------------------

pub async fn set_chapter_fields(pool: &SqlitePool, id: &str, fields: &ChapterFields) -> AppResult<StructureNode> {
    let goal = match fields.page_goal {
        None | Some(0) => None,
        Some(n) if (1..=MAX_PAGE_GOAL).contains(&n) => Some(n),
        Some(_) => return Err(invalid("manga.invalidPageGoal").with_param("max", MAX_PAGE_GOAL)),
    };
    // « À préparer » est l'état par défaut : rien à enregistrer.
    let status = choice(fields.script_status.as_deref(), &SCRIPT_STATUSES, "manga.invalidStatus")?.filter(|s| s != "todo");
    let narrative_goal = text(&fields.narrative_goal, MAX_FIELD_CHARS, "manga.fieldTooLong")?;
    let result = sqlx::query("UPDATE structure_nodes SET narrative_goal = ?, page_goal = ?, script_status = ?, updated_at = ? WHERE id = ?")
        .bind(&narrative_goal)
        .bind(goal)
        .bind(&status)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }
    find_node(pool, id).await?.ok_or_else(node_not_found)
}

pub async fn settings(pool: &SqlitePool) -> AppResult<MangaSettings> {
    let row: Option<(Option<i64>, Option<i64>)> =
        sqlx::query_as("SELECT panel_words_max, page_words_max FROM manga_settings WHERE id = 'default'").fetch_optional(pool).await?;
    let (panel_words_max, page_words_max) = row.unwrap_or((Some(35), Some(150)));
    Ok(MangaSettings { panel_words_max, page_words_max })
}

pub async fn set_settings(pool: &SqlitePool, value: &MangaSettings) -> AppResult<MangaSettings> {
    let check = |v: Option<i64>| match v {
        None | Some(0) => Ok(None),
        Some(n) if (1..=MAX_WORDS_THRESHOLD).contains(&n) => Ok(Some(n)),
        Some(_) => Err(invalid("manga.invalidThreshold")),
    };
    let panel = check(value.panel_words_max)?;
    let page = check(value.page_words_max)?;
    sqlx::query(
        "INSERT INTO manga_settings (id, panel_words_max, page_words_max, updated_at) VALUES ('default', ?1, ?2, ?3) \
         ON CONFLICT (id) DO UPDATE SET panel_words_max = ?1, page_words_max = ?2, updated_at = ?3",
    )
    .bind(panel)
    .bind(page)
    .bind(now_utc())
    .execute(pool)
    .await?;
    settings(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::models::project::ProjectType;
    use crate::services::{structure_service, trash_service};

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn character(pool: &SqlitePool, id: &str) {
        sqlx::query("INSERT INTO characters (id, first_name, last_name, fields, created_at, updated_at) VALUES (?, ?, '', '{}', 'x', 'x')")
            .bind(id)
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
    }

    fn panel(action: &str, texts: Vec<TextInput>) -> PanelInput {
        PanelInput {
            id: None,
            action: action.into(),
            framing: "wide".into(),
            setting: String::new(),
            artist_notes: String::new(),
            rhythm: None,
            location_id: None,
            moment: String::new(),
            continuity: String::new(),
            characters: vec![],
            texts,
        }
    }

    fn t(kind: &str, who: Option<&str>, content: &str) -> TextInput {
        TextInput { id: None, kind: kind.into(), character_id: who.map(Into::into), content: content.into() }
    }

    #[tokio::test]
    async fn saves_reorders_and_trashes_panels() {
        let pool = pool().await;
        character(&pool, "lea").await;
        let chapter = structure_service::create_node(&pool, ProjectType::Manga, None, 1, "Le départ", None).await.unwrap();
        let page = structure_service::create_node(&pool, ProjectType::Manga, Some(&chapter.id), 2, "", None).await.unwrap();

        let mut first = panel("Léa ouvre la porte.", vec![t("dialogue", Some("lea"), "Il y a quelqu'un ?"), t("sfx", Some("lea"), "GRIIIN")]);
        first.characters = vec![PanelCharacter { character_id: "lea".into(), state: "bras bandé".into() }];
        let input = PageScriptInput {
            rhythm: Some("suspense".into()),
            page_turn: true,
            panels: vec![first, panel("Couloir vide.", vec![])],
            page_label: "Page 1".into(),
        };
        let saved = save_page_script(&pool, &page.id, &input).await.unwrap();
        assert_eq!(saved.panels.len(), 2);
        assert_eq!((saved.page.rhythm.as_deref(), saved.page.page_turn), (Some("suspense"), true));
        let a = &saved.panels[0];
        assert_eq!(a.characters, vec![PanelCharacter { character_id: "lea".into(), state: "bras bandé".into() }]);
        // Une onomatopée n'a pas de locuteur.
        assert_eq!(a.texts.iter().map(|x| (x.kind.as_str(), x.character_id.as_deref())).collect::<Vec<_>>(), vec![("dialogue", Some("lea")), ("sfx", None)]);

        // Inversion des cases, une case retirée → corbeille, textes gardés par identifiant.
        let b = &saved.panels[1];
        let input = PageScriptInput {
            rhythm: None,
            page_turn: false,
            panels: vec![PanelInput {
                id: Some(a.id.clone()),
                texts: vec![TextInput { id: Some(a.texts[0].id.clone()), kind: "thought".into(), character_id: Some("lea".into()), content: "Personne…".into() }],
                characters: a.characters.clone(),
                ..panel("Léa ouvre la porte.", vec![])
            }],
            page_label: "Page 1".into(),
        };
        let saved = save_page_script(&pool, &page.id, &input).await.unwrap();
        assert_eq!(saved.panels.len(), 1);
        assert_eq!(saved.panels[0].texts[0].id, a.texts[0].id);
        assert_eq!(saved.panels[0].texts[0].kind, "thought");
        let trash = trash_service::list(&pool).await.unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].kind, "mangaPanel");
        assert!(trash[0].label.starts_with("Page 1 · #2"));
        trash_service::restore(&pool, &trash[0].id).await.unwrap();
        let back = page_script(&pool, &page.id).await.unwrap();
        assert!(back.panels.iter().any(|p| p.id == b.id));

        // Déplacement vers une autre page.
        let page2 = structure_service::create_node(&pool, ProjectType::Manga, Some(&chapter.id), 2, "", None).await.unwrap();
        move_panel(&pool, &b.id, &page2.id).await.unwrap();
        assert_eq!(page_script(&pool, &page2.id).await.unwrap().panels.len(), 1);
        assert_eq!(script_panels(&pool).await.unwrap().len(), 2);

        // La page supprimée emporte ses cases ; restaurée, elle les ramène.
        let trash_id = structure_service::delete_node(&pool, &page.id).await.unwrap();
        assert_eq!(script_panels(&pool).await.unwrap().len(), 1);
        trash_service::restore(&pool, &trash_id).await.unwrap();
        let restored = page_script(&pool, &page.id).await.unwrap();
        assert_eq!(restored.panels[0].texts.len(), 1);
        assert_eq!(restored.panels[0].characters.len(), 1);
    }

    #[tokio::test]
    async fn validates_values_and_chapter_fields() {
        let pool = pool().await;
        let chapter = structure_service::create_node(&pool, ProjectType::Manga, None, 1, "A", None).await.unwrap();
        let bad = PageScriptInput { rhythm: Some("dance".into()), page_turn: false, panels: vec![], page_label: String::new() };
        assert!(save_page_script(&pool, &chapter.id, &bad).await.is_err());
        let bad_kind = PageScriptInput { rhythm: None, page_turn: false, panels: vec![panel("x", vec![t("song", None, "la")])], page_label: String::new() };
        assert!(save_page_script(&pool, &chapter.id, &bad_kind).await.is_err());
        let ghost = PageScriptInput {
            rhythm: None,
            page_turn: false,
            panels: vec![PanelInput { characters: vec![PanelCharacter { character_id: "ghost".into(), state: String::new() }], ..panel("x", vec![]) }],
            page_label: String::new(),
        };
        assert!(save_page_script(&pool, &chapter.id, &ghost).await.is_err());
        assert!(page_script(&pool, &chapter.id).await.unwrap().panels.is_empty(), "rien n'est gardé d'un enregistrement refusé");

        let saved = set_chapter_fields(&pool, &chapter.id, &ChapterFields { narrative_goal: "Présenter Léa.".into(), page_goal: Some(20), script_status: Some("review".into()) }).await.unwrap();
        assert_eq!((saved.page_goal, saved.script_status.as_deref(), saved.narrative_goal.as_str()), (Some(20), Some("review"), "Présenter Léa."));
        let saved = set_chapter_fields(&pool, &chapter.id, &ChapterFields { narrative_goal: String::new(), page_goal: Some(0), script_status: Some("todo".into()) }).await.unwrap();
        assert_eq!((saved.page_goal, saved.script_status), (None, None));

        assert_eq!(settings(&pool).await.unwrap(), MangaSettings { panel_words_max: Some(35), page_words_max: Some(150) });
        let s = set_settings(&pool, &MangaSettings { panel_words_max: Some(25), page_words_max: None }).await.unwrap();
        assert_eq!(s, MangaSettings { panel_words_max: Some(25), page_words_max: None });
    }
}
