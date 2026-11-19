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

use std::collections::{HashMap, HashSet};

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

#[derive(Debug, Clone, Deserialize)]
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
        "SELECT id, scene_id, position, kind, character_id, parenthetical, content FROM series_scene_blocks {filter} \
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
                    "UPDATE series_scene_blocks SET position = ?, kind = ?, character_id = ?, parenthetical = ?, content = ?, updated_at = ? \
                     WHERE id = ?",
                )
                .bind(position as i64)
                .bind(&kind)
                .bind(&character)
                .bind(&parenthetical)
                .bind(&content)
                .bind(&now)
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
    let result = sqlx::query("UPDATE structure_nodes SET logline = ?, runtime_goal = ?, episode_status = ?, writer = ?, updated_at = ? WHERE id = ?")
        .bind(&logline)
        .bind(goal)
        .bind(&status)
        .bind(&writer)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }
    find_node(pool, id).await?.ok_or_else(node_not_found)
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
        let fields = EpisodeFields { logline: "Léa revient.".into(), runtime_goal: Some(52), episode_status: Some("draft".into()), writer: " Sam ".into() };
        let saved = set_episode_fields(&pool, &episode, &fields).await.unwrap();
        assert_eq!(
            (saved.logline.as_str(), saved.runtime_goal, saved.episode_status.as_deref(), saved.writer.as_str()),
            ("Léa revient.", Some(52), Some("draft"), "Sam")
        );
        let reset = EpisodeFields { logline: String::new(), runtime_goal: Some(0), episode_status: Some("idea".into()), writer: String::new() };
        let saved = set_episode_fields(&pool, &episode, &reset).await.unwrap();
        assert_eq!((saved.runtime_goal, saved.episode_status), (None, None));
        let bad = EpisodeFields { episode_status: Some("done".into()), ..reset.clone() };
        assert!(set_episode_fields(&pool, &episode, &bad).await.is_err());
        let bad = EpisodeFields { runtime_goal: Some(MAX_RUNTIME_GOAL + 1), ..reset };
        assert!(set_episode_fields(&pool, &episode, &bad).await.is_err());
    }
}
