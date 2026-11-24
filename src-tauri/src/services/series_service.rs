//! Scénario de série (migration `038_series.sql`).
//!
//! Le découpage donne les saisons, les épisodes et les scènes ; ce service
//! tient :
//! - le scénario d'une scène : son en-tête (intérieur / extérieur, lieu,
//!   moment) et ses éléments dans l'ordre (action, dialogue avec son
//!   personnage et sa didascalie, transition, indication de plan, note).
//!   La scène s'enregistre d'un bloc (`save_scene_script`) : l'ordre envoyé
//!   devient l'ordre des éléments ; l'état précédent reste dans les
//!   versions de la scène ;
//! - la fiche d'un épisode : logline, durée visée, statut, scénariste.
//!
//! Les durées estimées et l'avancement sont calculés par l'interface, qui a
//! tout le scénario (`series_blocks`) et le découpage.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::{AppError, AppResult};
use crate::services::structure_service::{find_node, StructureNode};
use crate::utils::{new_id, now_utc};

pub const EPISODE_STATUSES: [&str; 5] = ["idea", "outline", "draft", "revision", "final"];
pub const SCENE_PLACES: [&str; 3] = ["int", "ext", "intExt"];
pub const SCENE_TIMES: [&str; 8] = ["day", "night", "morning", "evening", "dawn", "dusk", "continuous", "later"];
pub const BLOCK_KINDS: [&str; 5] = ["action", "dialogue", "transition", "shot", "note"];

const MAX_BLOCKS_PER_SCENE: usize = 2_000;
const MAX_FIELD_CHARS: usize = 10_000;
const MAX_SHORT_CHARS: usize = 300;
const MAX_RUNTIME_GOAL: i64 = 1_000;

fn node_not_found() -> AppError {
    AppError::not_found("Élément du découpage introuvable.").with_key("structure.notFound")
}

fn invalid(key: &'static str) -> AppError {
    AppError::validation("Valeur invalide.").with_key(key)
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/// Élément du scénario d'une scène.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SceneBlock {
    pub id: String,
    pub scene_id: String,
    pub position: i64,
    pub kind: String,
    pub character_id: Option<String>,
    pub parenthetical: String,
    pub content: String,
    /// Dernière modification du texte de l'élément (pas de sa place) : un
    /// élément modifié pendant une révision de tournage est marqué.
    pub updated_at: String,
}

/// Scénario d'une scène.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneScript {
    pub scene: StructureNode,
    pub blocks: Vec<SceneBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockInput {
    #[serde(default)]
    pub id: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub character_id: Option<String>,
    #[serde(default)]
    pub parenthetical: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneScriptInput {
    #[serde(default)]
    pub place: Option<String>,
    #[serde(default)]
    pub location_id: Option<String>,
    #[serde(default)]
    pub time: Option<String>,
    pub blocks: Vec<BlockInput>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeFields {
    #[serde(default)]
    pub logline: String,
    #[serde(default)]
    pub runtime_goal: Option<i64>,
    #[serde(default)]
    pub episode_status: Option<String>,
    #[serde(default)]
    pub writer: String,
    /// Échéance (AAAA-MM-JJ) ; vide ou absente : aucune.
    #[serde(default)]
    pub due_date: Option<String>,
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

fn text(value: &str, max: usize) -> AppResult<String> {
    let value = value.trim_end();
    if value.chars().count() > max {
        return Err(AppError::validation("Ce texte est trop long.").with_key("series.fieldTooLong").with_param("max", max));
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

async fn blocks_where(conn: &mut SqliteConnection, scene_id: Option<&str>) -> AppResult<Vec<SceneBlock>> {
    let filter = if scene_id.is_some() { "WHERE scene_id = ?" } else { "" };
    let sql = format!(
        "SELECT id, scene_id, position, kind, character_id, parenthetical, content, updated_at FROM series_scene_blocks {filter} \
         ORDER BY scene_id, position, created_at"
    );
    let mut query = sqlx::query_as::<_, SceneBlock>(&sql);
    if let Some(id) = scene_id {
        query = query.bind(id);
    }
    Ok(query.fetch_all(&mut *conn).await?)
}

/// Scénario d'une scène.
pub async fn scene_script(pool: &SqlitePool, scene_id: &str) -> AppResult<SceneScript> {
    let scene = find_node(pool, scene_id).await?.ok_or_else(node_not_found)?;
    let mut conn = pool.acquire().await?;
    let blocks = blocks_where(&mut conn, Some(scene_id)).await?;
    Ok(SceneScript { scene, blocks })
}

/// Tous les éléments du scénario (lecture, export, suivi). L'ordre des
/// scènes est rétabli par l'interface, qui connaît le plan.
pub async fn series_blocks(pool: &SqlitePool) -> AppResult<Vec<SceneBlock>> {
    let mut conn = pool.acquire().await?;
    blocks_where(&mut conn, None).await
}

// ----------------------------------------------------------------------------
// Enregistrement d'une scène
// ----------------------------------------------------------------------------

/// Enregistre le scénario d'une scène d'un bloc.
pub async fn save_scene_script(pool: &SqlitePool, scene_id: &str, input: &SceneScriptInput) -> AppResult<SceneScript> {
    // Tout est vérifié avant d'écrire.
    if input.blocks.len() > MAX_BLOCKS_PER_SCENE {
        return Err(AppError::validation("Trop d'éléments dans cette scène.")
            .with_key("series.tooManyBlocks")
            .with_param("max", MAX_BLOCKS_PER_SCENE));
    }
    let place = choice(input.place.as_deref(), &SCENE_PLACES, "series.invalidPlace")?;
    let time = choice(input.time.as_deref(), &SCENE_TIMES, "series.invalidTime")?;
    let location_id = input.location_id.clone().filter(|l| !l.is_empty());
    if let Some(location) = &location_id {
        let found: Option<String> = sqlx::query_scalar("SELECT id FROM locations WHERE id = ?").bind(location).fetch_optional(pool).await?;
        if found.is_none() {
            return Err(AppError::validation("Ce lieu n'existe plus.").with_key("series.unknownLocation"));
        }
    }
    let mut clean = Vec::with_capacity(input.blocks.len());
    for block in &input.blocks {
        let kind = choice(Some(&block.kind), &BLOCK_KINDS, "series.invalidBlockKind")?.ok_or_else(|| invalid("series.invalidBlockKind"))?;
        // Seul un dialogue a un personnage et une didascalie.
        let dialogue = kind == "dialogue";
        let character = if dialogue { block.character_id.clone().filter(|c| !c.is_empty()) } else { None };
        let parenthetical = if dialogue { text(&block.parenthetical, MAX_SHORT_CHARS)? } else { String::new() };
        clean.push((block.id.clone(), kind, character, parenthetical, text(&block.content, MAX_FIELD_CHARS)?));
    }

    let mut tx = pool.begin().await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?").bind(scene_id).fetch_optional(&mut *tx).await?;
    if exists.is_none() {
        return Err(node_not_found());
    }
    let now = now_utc();

    let existing: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT id FROM series_scene_blocks WHERE scene_id = ?").bind(scene_id).fetch_all(&mut *tx).await?.into_iter().collect();
    let mut kept = HashSet::new();
    for (position, (id, kind, character, parenthetical, content)) in clean.into_iter().enumerate() {
        match id.filter(|id| existing.contains(id) && !kept.contains(id)) {
            Some(id) => {
                sqlx::query(
                    "UPDATE series_scene_blocks SET \
                     updated_at = CASE WHEN kind IS ? AND character_id IS ? AND parenthetical IS ? AND content IS ? THEN updated_at ELSE ? END, \
                     position = ?, kind = ?, character_id = ?, parenthetical = ?, content = ? WHERE id = ?",
                )
                // Un élément seulement déplacé garde sa date (révisions).
                .bind(&kind)
                .bind(&character)
                .bind(&parenthetical)
                .bind(&content)
                .bind(&now)
                .bind(position as i64)
                .bind(&kind)
                .bind(&character)
                .bind(&parenthetical)
                .bind(&content)
                .bind(&id)
                .execute(&mut *tx)
                .await
                .map_err(reference_error)?;
                kept.insert(id);
            }
            None => {
                let id = new_id();
                sqlx::query(
                    "INSERT INTO series_scene_blocks (id, scene_id, position, kind, character_id, parenthetical, content, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&id)
                .bind(scene_id)
                .bind(position as i64)
                .bind(&kind)
                .bind(&character)
                .bind(&parenthetical)
                .bind(&content)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await
                .map_err(reference_error)?;
                kept.insert(id);
            }
        }
    }
    for gone in existing.difference(&kept) {
        sqlx::query("DELETE FROM series_scene_blocks WHERE id = ?").bind(gone).execute(&mut *tx).await?;
    }

    sqlx::query("UPDATE structure_nodes SET scene_place = ?, scene_location_id = ?, scene_time = ?, updated_at = ? WHERE id = ?")
        .bind(&place)
        .bind(&location_id)
        .bind(&time)
        .bind(&now)
        .bind(scene_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    scene_script(pool, scene_id).await
}

/// Erreur de clé étrangère (personnage supprimé entre-temps).
fn reference_error(error: sqlx::Error) -> AppError {
    match &error {
        sqlx::Error::Database(db) if db.message().contains("FOREIGN KEY") => {
            AppError::validation("Un personnage de cette scène n'existe plus.").with_key("series.unknownCharacter")
        }
        _ => error.into(),
    }
}

// ----------------------------------------------------------------------------
// Versions et recherche
// ----------------------------------------------------------------------------

/// Éléments d'une scène en JSON, gardés dans les versions de la scène.
pub async fn blocks_snapshot(pool: &SqlitePool, scene_id: &str) -> AppResult<String> {
    let mut conn = pool.acquire().await?;
    let blocks: Vec<BlockInput> = blocks_where(&mut conn, Some(scene_id))
        .await?
        .into_iter()
        .map(|b| BlockInput { id: Some(b.id), kind: b.kind, character_id: b.character_id, parenthetical: b.parenthetical, content: b.content })
        .collect();
    serde_json::to_string(&blocks).map_err(|e| AppError::internal(format!("Version du scénario : {e}")))
}

/// Remet les éléments d'une version. Un personnage supprimé depuis est
/// retiré de la réplique : le texte revient. L'en-tête (colonnes de la
/// scène) est restauré avec l'élément.
pub async fn restore_blocks(pool: &SqlitePool, scene_id: &str, snapshot: &str) -> AppResult<()> {
    let mut blocks: Vec<BlockInput> =
        serde_json::from_str(snapshot).map_err(|_| AppError::internal("Version illisible").with_key("history.unreadable"))?;
    let characters: HashSet<String> = sqlx::query_scalar("SELECT id FROM characters").fetch_all(pool).await?.into_iter().collect();
    for block in &mut blocks {
        block.character_id = block.character_id.take().filter(|id| characters.contains(id));
    }
    let scene = find_node(pool, scene_id).await?.ok_or_else(node_not_found)?;
    let locations: HashSet<String> = sqlx::query_scalar("SELECT id FROM locations").fetch_all(pool).await?.into_iter().collect();
    let input = SceneScriptInput {
        place: scene.scene_place,
        location_id: scene.scene_location_id.filter(|id| locations.contains(id)),
        time: scene.scene_time,
        blocks,
    };
    save_scene_script(pool, scene_id, &input).await?;
    Ok(())
}

/// Texte du scénario de chaque scène, pour la recherche.
pub async fn search_rows(pool: &SqlitePool) -> AppResult<HashMap<String, String>> {
    let mut out: HashMap<String, String> = HashMap::new();
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT scene_id, parenthetical || ' ' || content FROM series_scene_blocks ORDER BY scene_id, position",
    )
    .fetch_all(pool)
    .await?;
    for (scene_id, text) in rows {
        let body = out.entry(scene_id).or_default();
        body.push_str(text.trim());
        body.push('\n');
    }
    Ok(out)
}

// ----------------------------------------------------------------------------
// Épisodes
// ----------------------------------------------------------------------------

pub async fn set_episode_fields(pool: &SqlitePool, id: &str, fields: &EpisodeFields) -> AppResult<StructureNode> {
    let goal = match fields.runtime_goal {
        None | Some(0) => None,
        Some(n) if (1..=MAX_RUNTIME_GOAL).contains(&n) => Some(n),
        Some(_) => return Err(invalid("series.invalidRuntimeGoal").with_param("max", MAX_RUNTIME_GOAL)),
    };
    // « Idée » est l'état par défaut : rien à enregistrer.
    let status = choice(fields.episode_status.as_deref(), &EPISODE_STATUSES, "series.invalidStatus")?.filter(|s| s != "idea");
    let logline = text(&fields.logline, MAX_FIELD_CHARS)?;
    let writer = text(fields.writer.trim(), MAX_SHORT_CHARS)?;
    let due = match fields.due_date.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(d) if chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok() => Some(d.to_owned()),
        Some(_) => return Err(invalid("series.invalidDueDate")),
    };
    let result = sqlx::query("UPDATE structure_nodes SET logline = ?, runtime_goal = ?, episode_status = ?, writer = ?, due_date = ?, updated_at = ? WHERE id = ?")
        .bind(&logline)
        .bind(goal)
        .bind(&status)
        .bind(&writer)
        .bind(&due)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }
    find_node(pool, id).await?.ok_or_else(node_not_found)
}

// ----------------------------------------------------------------------------
// Film (migration `044_film.sql`)
// ----------------------------------------------------------------------------

/// Moments clés de la structure d'un film (repères placés sur une scène).
pub const BEATS: [&str; 5] = ["inciting", "plot1", "midpoint", "plot2", "climax"];
/// Couleurs des révisions de tournage, dans l'ordre d'usage.
pub const REVISION_COLORS: [&str; 8] = ["white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon"];

/// Révision de tournage en cours : sa couleur et sa date de début.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilmRevision {
    pub color: String,
    pub since: String,
}

/// Fiche du film entier : logline, durée visée (minutes), scénariste ;
/// dossier (pitch, note d'intention — le synopsis est celui du projet) ;
/// repères de structure ; révision en cours et numéros de scène verrouillés.
///
/// Les colonnes `summary_short` et `summary_long` de `045_film_tools.sql`
/// ne servent plus : le dossier reprend le synopsis du projet.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilmDetails {
    #[serde(default)]
    pub logline: String,
    #[serde(default)]
    pub runtime_goal: Option<i64>,
    #[serde(default)]
    pub writer: String,
    #[serde(default)]
    pub intention: String,
    #[serde(default)]
    pub pitch: String,
    /// Moment clé (`BEATS`) → scène.
    #[serde(default)]
    pub beats: BTreeMap<String, String>,
    #[serde(default)]
    pub revision: Option<FilmRevision>,
    /// Scène → numéro verrouillé (« 12 », « 12A »).
    #[serde(default)]
    pub locked_numbers: BTreeMap<String, String>,
}

const MAX_DOSSIER_CHARS: usize = 50_000;
const MAX_NUMBER_CHARS: usize = 12;

fn json_map(text: &str) -> BTreeMap<String, String> {
    serde_json::from_str(text).unwrap_or_default()
}

/// Fiche du film ; vide si elle n'a jamais été remplie.
pub async fn film_details(pool: &SqlitePool) -> AppResult<FilmDetails> {
    type Row = (String, Option<i64>, String, String, String, String, Option<String>, String);
    let row: Option<Row> = sqlx::query_as(
        "SELECT logline, runtime_goal, writer, intention, pitch, beats, revision, locked_numbers \
         FROM film_details WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await?;
    Ok(match row {
        None => FilmDetails::default(),
        Some((logline, runtime_goal, writer, intention, pitch, beats, revision, locked)) => FilmDetails {
            logline,
            runtime_goal,
            writer,
            intention,
            pitch,
            beats: json_map(&beats),
            revision: revision.and_then(|r| serde_json::from_str(&r).ok()),
            locked_numbers: json_map(&locked),
        },
    })
}

/// Enregistre la fiche du film (une durée visée de 0 l'efface).
pub async fn set_film_details(pool: &SqlitePool, input: &FilmDetails) -> AppResult<FilmDetails> {
    let goal = match input.runtime_goal {
        None | Some(0) => None,
        Some(n) if (1..=MAX_RUNTIME_GOAL).contains(&n) => Some(n),
        Some(_) => return Err(invalid("series.invalidRuntimeGoal").with_param("max", MAX_RUNTIME_GOAL)),
    };
    if input.beats.keys().any(|k| !BEATS.contains(&k.as_str())) {
        return Err(invalid("series.invalidBeat"));
    }
    if let Some(r) = &input.revision {
        if !REVISION_COLORS.contains(&r.color.as_str()) || r.since.trim().is_empty() {
            return Err(invalid("series.invalidRevision"));
        }
    }
    if input.locked_numbers.values().any(|n| n.trim().is_empty() || n.chars().count() > MAX_NUMBER_CHARS) {
        return Err(invalid("series.invalidSceneNumber"));
    }
    let saved = FilmDetails {
        logline: text(&input.logline, MAX_FIELD_CHARS)?,
        runtime_goal: goal,
        writer: text(input.writer.trim(), MAX_SHORT_CHARS)?,
        intention: text(&input.intention, MAX_DOSSIER_CHARS)?,
        pitch: text(&input.pitch, MAX_FIELD_CHARS)?,
        beats: input.beats.iter().filter(|(_, v)| !v.trim().is_empty()).map(|(k, v)| (k.clone(), v.clone())).collect(),
        revision: input.revision.clone(),
        locked_numbers: input.locked_numbers.iter().map(|(k, v)| (k.clone(), v.trim().to_owned())).collect(),
    };
    let revision = saved.revision.as_ref().map(serde_json::to_string).transpose().map_err(|e| AppError::internal(e.to_string()))?;
    sqlx::query(
        "INSERT INTO film_details (id, logline, runtime_goal, writer, intention, pitch, beats, revision, locked_numbers, updated_at) \
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET logline = excluded.logline, runtime_goal = excluded.runtime_goal, writer = excluded.writer, \
         intention = excluded.intention, pitch = excluded.pitch, \
         beats = excluded.beats, revision = excluded.revision, locked_numbers = excluded.locked_numbers, updated_at = excluded.updated_at",
    )
    .bind(&saved.logline)
    .bind(saved.runtime_goal)
    .bind(&saved.writer)
    .bind(&saved.intention)
    .bind(&saved.pitch)
    .bind(serde_json::to_string(&saved.beats).unwrap_or_else(|_| "{}".into()))
    .bind(revision)
    .bind(serde_json::to_string(&saved.locked_numbers).unwrap_or_else(|_| "{}".into()))
    .bind(now_utc())
    .execute(pool)
    .await?;
    Ok(saved)
}

// ----------------------------------------------------------------------------
// Dépouillement (migration `045_film_tools.sql`)
// ----------------------------------------------------------------------------

/// Dépouillement d'une scène : ce que la régie doit prévoir. Les
/// personnages, le lieu, le moment et les objets liés viennent du reste
/// de la fiche ; ici, ce qui n'a pas de fiche.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SceneBreakdown {
    #[serde(default)]
    pub extras: String,
    #[serde(default)]
    pub props: String,
    #[serde(default)]
    pub costumes: String,
    #[serde(default)]
    pub makeup: String,
    #[serde(default)]
    pub vehicles: String,
    #[serde(default)]
    pub effects: String,
    #[serde(default)]
    pub sound: String,
    #[serde(default)]
    pub notes: String,
}

/// Dépouillement d'une scène, avec son identifiant.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SceneBreakdownRow {
    pub scene_id: String,
    pub breakdown: SceneBreakdown,
}

/// Dépouillement de toutes les scènes qui en ont un.
pub async fn breakdowns(pool: &SqlitePool) -> AppResult<Vec<SceneBreakdownRow>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT scene_id, data FROM scene_breakdowns ORDER BY scene_id").fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|(scene_id, data)| SceneBreakdownRow { scene_id, breakdown: serde_json::from_str(&data).unwrap_or_default() })
        .collect())
}

/// Enregistre le dépouillement d'une scène (tout vide : il est retiré).
pub async fn set_breakdown(pool: &SqlitePool, scene_id: &str, input: &SceneBreakdown) -> AppResult<SceneBreakdown> {
    find_node(pool, scene_id).await?.ok_or_else(node_not_found)?;
    let clean = SceneBreakdown {
        extras: text(&input.extras, MAX_FIELD_CHARS)?,
        props: text(&input.props, MAX_FIELD_CHARS)?,
        costumes: text(&input.costumes, MAX_FIELD_CHARS)?,
        makeup: text(&input.makeup, MAX_FIELD_CHARS)?,
        vehicles: text(&input.vehicles, MAX_FIELD_CHARS)?,
        effects: text(&input.effects, MAX_FIELD_CHARS)?,
        sound: text(&input.sound, MAX_FIELD_CHARS)?,
        notes: text(&input.notes, MAX_FIELD_CHARS)?,
    };
    if clean == SceneBreakdown::default() {
        sqlx::query("DELETE FROM scene_breakdowns WHERE scene_id = ?").bind(scene_id).execute(pool).await?;
    } else {
        let data = serde_json::to_string(&clean).map_err(|e| AppError::internal(e.to_string()))?;
        sqlx::query(
            "INSERT INTO scene_breakdowns (scene_id, data, updated_at) VALUES (?, ?, ?) \
             ON CONFLICT(scene_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        )
        .bind(scene_id)
        .bind(data)
        .bind(now_utc())
        .execute(pool)
        .await?;
    }
    Ok(clean)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::models::project::ProjectType;
    use crate::services::{history_service, search_service, structure_service, trash_service};

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

    fn b(kind: &str, who: Option<&str>, paren: &str, content: &str) -> BlockInput {
        BlockInput { id: None, kind: kind.into(), character_id: who.map(Into::into), parenthetical: paren.into(), content: content.into() }
    }

    async fn scene(pool: &SqlitePool) -> StructureNode {
        let season = structure_service::create_node(pool, ProjectType::Series, None, 0, "", None).await.unwrap();
        let episode = structure_service::create_node(pool, ProjectType::Series, Some(&season.id), 1, "Pilote", None).await.unwrap();
        structure_service::create_node(pool, ProjectType::Series, Some(&episode.id), 2, "", None).await.unwrap()
    }

    #[tokio::test]
    async fn saves_and_reorders_the_blocks_of_a_scene() {
        let pool = pool().await;
        character(&pool, "lea").await;
        let scene = scene(&pool).await;

        let input = SceneScriptInput {
            place: Some("int".into()),
            location_id: None,
            time: Some("night".into()),
            blocks: vec![
                b("action", Some("lea"), "inutile", "Léa entre dans la cuisine."),
                b("dialogue", Some("lea"), "à voix basse", "Il y a quelqu'un ?"),
                b("transition", None, "", "CUT TO:"),
            ],
        };
        let saved = save_scene_script(&pool, &scene.id, &input).await.unwrap();
        assert_eq!((saved.scene.scene_place.as_deref(), saved.scene.scene_time.as_deref()), (Some("int"), Some("night")));
        assert_eq!(saved.blocks.len(), 3);
        // Une action n'a ni personnage ni didascalie.
        assert_eq!((saved.blocks[0].character_id.as_deref(), saved.blocks[0].parenthetical.as_str()), (None, ""));
        assert_eq!((saved.blocks[1].character_id.as_deref(), saved.blocks[1].parenthetical.as_str()), (Some("lea"), "à voix basse"));

        // Inversion, un élément retiré, identifiants gardés.
        let first = &saved.blocks[0];
        let second = &saved.blocks[1];
        let input = SceneScriptInput {
            place: None,
            location_id: None,
            time: None,
            blocks: vec![
                BlockInput { id: Some(second.id.clone()), ..b("dialogue", Some("lea"), "", "Personne ?") },
                BlockInput { id: Some(first.id.clone()), ..b("action", None, "", "Léa entre.") },
            ],
        };
        let saved = save_scene_script(&pool, &scene.id, &input).await.unwrap();
        assert_eq!(saved.blocks.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec![second.id.as_str(), first.id.as_str()]);
        assert_eq!(saved.scene.scene_place, None);
        assert_eq!(series_blocks(&pool).await.unwrap().len(), 2);

        // La scène supprimée emporte son scénario ; restaurée, elle le ramène.
        let trash_id = structure_service::delete_node(&pool, &scene.id).await.unwrap();
        assert!(series_blocks(&pool).await.unwrap().is_empty());
        trash_service::restore(&pool, &trash_id).await.unwrap();
        assert_eq!(scene_script(&pool, &scene.id).await.unwrap().blocks.len(), 2);
    }

    #[tokio::test]
    async fn versions_of_a_scene_keep_its_script() {
        let pool = pool().await;
        character(&pool, "lea").await;
        let scene = scene(&pool).await;
        let script = |content: &str, who: Option<&str>, place: Option<&str>| SceneScriptInput {
            place: place.map(Into::into),
            location_id: None,
            time: None,
            blocks: vec![b("dialogue", who, "", content)],
        };

        save_scene_script(&pool, &scene.id, &script("Première réplique", Some("lea"), Some("ext"))).await.unwrap();
        history_service::snapshot_before(&pool, "structureNode", &scene.id).await;
        save_scene_script(&pool, &scene.id, &script("Réécrite", None, Some("int"))).await.unwrap();

        let list = history_service::list_versions(&pool, "structureNode", &scene.id).await.unwrap();
        let version = &list.versions[0];
        history_service::restore_version(&pool, &version.id).await.unwrap();
        let back = scene_script(&pool, &scene.id).await.unwrap();
        assert_eq!(back.blocks[0].content, "Première réplique");
        assert_eq!(back.blocks[0].character_id.as_deref(), Some("lea"));
        assert_eq!(back.scene.scene_place.as_deref(), Some("ext"));

        // Un personnage supprimé depuis ne bloque pas la restauration.
        sqlx::query("DELETE FROM characters WHERE id = 'lea'").execute(&pool).await.unwrap();
        history_service::restore_version(&pool, &version.id).await.unwrap();
        let back = scene_script(&pool, &scene.id).await.unwrap();
        assert_eq!((back.blocks[0].content.as_str(), back.blocks[0].character_id.as_deref()), ("Première réplique", None));
    }

    #[tokio::test]
    async fn the_search_finds_the_script_of_scenes() {
        let pool = pool().await;
        let scene = scene(&pool).await;
        let input = SceneScriptInput {
            place: None,
            location_id: None,
            time: None,
            blocks: vec![b("action", None, "", "Le phare s'allume."), b("dialogue", None, "en murmurant", "Où est Marc ?")],
        };
        save_scene_script(&pool, &scene.id, &input).await.unwrap();
        for query in ["phare", "ou est marc", "murmurant"] {
            let hits = search_service::search(&pool, query).await.unwrap();
            assert_eq!(hits.iter().map(|h| (h.kind.as_str(), h.id.as_str())).collect::<Vec<_>>(), vec![("structureNode", scene.id.as_str())], "{query}");
        }
    }

    #[tokio::test]
    async fn validates_values_and_episode_fields() {
        let pool = pool().await;
        let scene = scene(&pool).await;
        let bad = SceneScriptInput { place: Some("space".into()), location_id: None, time: None, blocks: vec![] };
        assert!(save_scene_script(&pool, &scene.id, &bad).await.is_err());
        let bad = SceneScriptInput { place: None, location_id: Some("ghost".into()), time: None, blocks: vec![] };
        assert!(save_scene_script(&pool, &scene.id, &bad).await.is_err());
        let bad = SceneScriptInput { place: None, location_id: None, time: None, blocks: vec![b("song", None, "", "la")] };
        assert!(save_scene_script(&pool, &scene.id, &bad).await.is_err());
        let ghost = SceneScriptInput { place: None, location_id: None, time: None, blocks: vec![b("dialogue", Some("ghost"), "", "x")] };
        assert!(save_scene_script(&pool, &scene.id, &ghost).await.is_err());
        assert!(scene_script(&pool, &scene.id).await.unwrap().blocks.is_empty(), "rien n'est gardé d'un enregistrement refusé");

        let episode = scene.parent_id.clone().unwrap();
        let fields = EpisodeFields {
            logline: "Léa revient.".into(),
            runtime_goal: Some(52),
            episode_status: Some("draft".into()),
            writer: " Sam ".into(),
            due_date: Some("2026-12-15".into()),
        };
        let saved = set_episode_fields(&pool, &episode, &fields).await.unwrap();
        assert_eq!(
            (saved.logline.as_str(), saved.runtime_goal, saved.episode_status.as_deref(), saved.writer.as_str(), saved.due_date.as_deref()),
            ("Léa revient.", Some(52), Some("draft"), "Sam", Some("2026-12-15"))
        );
        let bad = EpisodeFields { due_date: Some("15/12/2026".into()), ..fields.clone() };
        assert!(set_episode_fields(&pool, &episode, &bad).await.is_err());
        let reset = EpisodeFields { logline: String::new(), runtime_goal: Some(0), episode_status: Some("idea".into()), writer: String::new(), due_date: Some(String::new()) };
        let saved = set_episode_fields(&pool, &episode, &reset).await.unwrap();
        assert_eq!((saved.runtime_goal, saved.episode_status, saved.due_date), (None, None, None));
        let bad = EpisodeFields { episode_status: Some("done".into()), ..reset.clone() };
        assert!(set_episode_fields(&pool, &episode, &bad).await.is_err());
        let bad = EpisodeFields { runtime_goal: Some(MAX_RUNTIME_GOAL + 1), ..reset };
        assert!(set_episode_fields(&pool, &episode, &bad).await.is_err());
    }

    #[tokio::test]
    async fn keeps_the_details_of_the_film() {
        let pool = pool().await;
        assert_eq!(film_details(&pool).await.unwrap(), FilmDetails::default());

        let input = FilmDetails { logline: "Une cheffe doit sauver son restaurant.".into(), runtime_goal: Some(105), writer: " Sam ".into(), ..FilmDetails::default() };
        let saved = set_film_details(&pool, &input).await.unwrap();
        assert_eq!(saved.writer, "Sam");
        assert_eq!(film_details(&pool).await.unwrap(), saved);

        let cleared = set_film_details(&pool, &FilmDetails { runtime_goal: Some(0), ..FilmDetails::default() }).await.unwrap();
        assert_eq!(cleared, FilmDetails::default());
        let bad = FilmDetails { runtime_goal: Some(MAX_RUNTIME_GOAL + 1), ..FilmDetails::default() };
        assert!(set_film_details(&pool, &bad).await.is_err());
        let long = FilmDetails { writer: "x".repeat(MAX_SHORT_CHARS + 1), ..FilmDetails::default() };
        assert!(set_film_details(&pool, &long).await.is_err());

        // Dossier, repères, révision et numéros verrouillés.
        let full = FilmDetails {
            pitch: "Le pitch.".into(),
            intention: "Pourquoi ce film.".into(),
            beats: BTreeMap::from([("plot1".into(), "s4".into()), ("climax".into(), String::new())]),
            revision: Some(FilmRevision { color: "blue".into(), since: "2026-11-01T00:00:00Z".into() }),
            locked_numbers: BTreeMap::from([("s1".into(), "1".into()), ("s2".into(), " 1A ".into())]),
            ..FilmDetails::default()
        };
        let saved = set_film_details(&pool, &full).await.unwrap();
        assert_eq!(saved.beats, BTreeMap::from([("plot1".into(), "s4".into())]), "un repère vide est retiré");
        assert_eq!(saved.locked_numbers.get("s2").map(String::as_str), Some("1A"));
        assert_eq!(film_details(&pool).await.unwrap(), saved);
        for bad in [
            FilmDetails { beats: BTreeMap::from([("fin".into(), "s1".into())]), ..FilmDetails::default() },
            FilmDetails { revision: Some(FilmRevision { color: "violet".into(), since: "x".into() }), ..FilmDetails::default() },
            FilmDetails { locked_numbers: BTreeMap::from([("s1".into(), " ".into())]), ..FilmDetails::default() },
        ] {
            assert!(set_film_details(&pool, &bad).await.is_err());
        }
    }

    #[tokio::test]
    async fn keeps_the_breakdown_of_a_scene_and_the_date_of_unchanged_blocks() {
        let pool = pool().await;
        let scene = scene(&pool).await;
        assert!(breakdowns(&pool).await.unwrap().is_empty());
        let input = SceneBreakdown { extras: "Vingt pêcheurs".into(), effects: "Brume".into(), ..SceneBreakdown::default() };
        set_breakdown(&pool, &scene.id, &input).await.unwrap();
        assert_eq!(breakdowns(&pool).await.unwrap(), vec![SceneBreakdownRow { scene_id: scene.id.clone(), breakdown: input }]);
        set_breakdown(&pool, &scene.id, &SceneBreakdown::default()).await.unwrap();
        assert!(breakdowns(&pool).await.unwrap().is_empty(), "un dépouillement vide est retiré");
        assert!(set_breakdown(&pool, "inconnue", &SceneBreakdown::default()).await.is_err());

        // Un élément seulement déplacé garde sa date ; un élément modifié en change.
        let first = SceneScriptInput { place: None, location_id: None, time: None, blocks: vec![b("action", None, "", "Un."), b("action", None, "", "Deux.")] };
        let saved = save_scene_script(&pool, &scene.id, &first).await.unwrap();
        sqlx::query("UPDATE series_scene_blocks SET updated_at = '2000-01-01T00:00:00Z'").execute(&pool).await.unwrap();
        let swapped = SceneScriptInput {
            place: None,
            location_id: None,
            time: None,
            blocks: vec![
                BlockInput { id: Some(saved.blocks[1].id.clone()), ..b("action", None, "", "Deux.") },
                BlockInput { id: Some(saved.blocks[0].id.clone()), ..b("action", None, "", "Un, modifié.") },
            ],
        };
        let after = save_scene_script(&pool, &scene.id, &swapped).await.unwrap();
        assert_eq!(after.blocks[0].updated_at, "2000-01-01T00:00:00Z");
        assert_ne!(after.blocks[1].updated_at, "2000-01-01T00:00:00Z");
    }
}
