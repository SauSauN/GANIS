//! Relations entre personnages (base du projet).
//!
//! Une relation relie deux personnages différents. Elle a un **type**
//! (famille, amour, amitié…), un nom libre, une description, un sens
//! (réciproque ou à sens unique), une intensité (1 à 5), une tonalité
//! (positive, neutre, négative) et, facultativement, une période : les
//! éléments du découpage du récit où elle commence et finit.
//!
//! Le graphe de l'interface lit ces relations ; la disposition libre du
//! graphe enregistre la position de chaque personnage
//! (`character_graph_positions`).

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Types de relation (l'interface leur donne un nom et une couleur).
pub const TYPES: [&str; 12] = [
    "family",
    "love",
    "friendship",
    "alliance",
    "professional",
    "mentor",
    "political",
    "rivalry",
    "enmity",
    "betrayal",
    "secret",
    "other",
];

/// Tonalités d'une relation.
pub const SENTIMENTS: [&str; 3] = ["positive", "neutral", "negative"];

const MAX_LABEL_CHARS: usize = 100;
const MAX_DESCRIPTION_CHARS: usize = 5_000;

/// Relation, telle qu'envoyée à l'interface.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub description: String,
    pub directed: bool,
    pub intensity: i64,
    pub sentiment: String,
    pub since_node: Option<String>,
    pub until_node: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Contenu d'une relation (création ou modification).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationInput {
    pub source_id: String,
    pub target_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub directed: bool,
    pub intensity: i64,
    pub sentiment: String,
    #[serde(default)]
    pub since_node: Option<String>,
    #[serde(default)]
    pub until_node: Option<String>,
}

/// Position d'un personnage dans la disposition libre du graphe.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GraphPosition {
    pub character_id: String,
    pub x: f64,
    pub y: f64,
}

fn not_found() -> AppError {
    AppError::not_found("Relation introuvable.").with_key("relation.notFound")
}

/// Relation validée.
struct CleanInput {
    source_id: String,
    target_id: String,
    kind: &'static str,
    label: String,
    description: String,
    directed: bool,
    intensity: i64,
    sentiment: &'static str,
    since_node: Option<String>,
    until_node: Option<String>,
}

async fn character_exists(pool: &SqlitePool, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT id FROM characters WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

/// Élément du découpage : gardé s'il existe, sinon retiré.
async fn clean_node(pool: &SqlitePool, id: &Option<String>) -> AppResult<Option<String>> {
    let Some(id) = id.as_deref().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };

    let found: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(found)
}

async fn clean_input(pool: &SqlitePool, input: &RelationInput) -> AppResult<CleanInput> {
    if input.source_id == input.target_id {
        return Err(AppError::validation("Un personnage ne peut pas être en relation avec lui-même.")
            .with_key("relation.sameCharacter"));
    }

    for id in [&input.source_id, &input.target_id] {
        if !character_exists(pool, id).await? {
            return Err(AppError::not_found("Personnage introuvable.").with_key("character.notFound"));
        }
    }

    let kind = TYPES
        .into_iter()
        .find(|kind| *kind == input.kind)
        .ok_or_else(|| AppError::validation("Type de relation inconnu.").with_key("relation.invalidType"))?;

    let sentiment = SENTIMENTS
        .into_iter()
        .find(|sentiment| *sentiment == input.sentiment)
        .ok_or_else(|| AppError::validation("Tonalité inconnue.").with_key("relation.invalidSentiment"))?;

    if !(1..=5).contains(&input.intensity) {
        return Err(AppError::validation("L'intensité va de 1 à 5.").with_key("relation.invalidIntensity"));
    }

    let label = input.label.trim();
    if label.chars().count() > MAX_LABEL_CHARS {
        return Err(AppError::validation("Le nom de la relation est trop long.")
            .with_key("relation.labelTooLong")
            .with_param("max", MAX_LABEL_CHARS));
    }

    let description = input.description.trim();
    if description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation("La description de la relation est trop longue.")
            .with_key("relation.descriptionTooLong")
            .with_param("max", MAX_DESCRIPTION_CHARS));
    }

    Ok(CleanInput {
        source_id: input.source_id.clone(),
        target_id: input.target_id.clone(),
        kind,
        label: label.to_owned(),
        description: description.to_owned(),
        directed: input.directed,
        intensity: input.intensity,
        sentiment,
        since_node: clean_node(pool, &input.since_node).await?,
        until_node: clean_node(pool, &input.until_node).await?,
    })
}

const COLUMNS: &str = "id, source_id, target_id, type, label, description, directed, intensity, \
                       sentiment, since_node, until_node, created_at, updated_at";

async fn find(pool: &SqlitePool, id: &str) -> AppResult<Relation> {
    let sql = format!("SELECT {COLUMNS} FROM character_relations WHERE id = ?");

    sqlx::query_as::<_, Relation>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(not_found)
}

/// Toutes les relations du projet, des plus anciennes aux plus récentes.
pub async fn list_relations(pool: &SqlitePool) -> AppResult<Vec<Relation>> {
    let sql = format!("SELECT {COLUMNS} FROM character_relations ORDER BY created_at, id");
    Ok(sqlx::query_as::<_, Relation>(&sql).fetch_all(pool).await?)
}

/// Crée une relation.
pub async fn create_relation(pool: &SqlitePool, input: &RelationInput) -> AppResult<Relation> {
    let clean = clean_input(pool, input).await?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO character_relations
            (id, source_id, target_id, type, label, description, directed, intensity,
             sentiment, since_node, until_node, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&clean.source_id)
    .bind(&clean.target_id)
    .bind(clean.kind)
    .bind(&clean.label)
    .bind(&clean.description)
    .bind(clean.directed)
    .bind(clean.intensity)
    .bind(clean.sentiment)
    .bind(&clean.since_node)
    .bind(&clean.until_node)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    find(pool, &id).await
}

/// Remplace une relation.
pub async fn update_relation(
    pool: &SqlitePool,
    id: &str,
    input: &RelationInput,
) -> AppResult<Relation> {
    let clean = clean_input(pool, input).await?;

    let result = sqlx::query(
        r#"
        UPDATE character_relations
        SET source_id = ?, target_id = ?, type = ?, label = ?, description = ?, directed = ?,
            intensity = ?, sentiment = ?, since_node = ?, until_node = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&clean.source_id)
    .bind(&clean.target_id)
    .bind(clean.kind)
    .bind(&clean.label)
    .bind(&clean.description)
    .bind(clean.directed)
    .bind(clean.intensity)
    .bind(clean.sentiment)
    .bind(&clean.since_node)
    .bind(&clean.until_node)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    find(pool, id).await
}

/// Supprime une relation.
pub async fn delete_relation(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM character_relations WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Disposition libre du graphe
// ----------------------------------------------------------------------------

/// Positions enregistrées des personnages.
pub async fn get_positions(pool: &SqlitePool) -> AppResult<Vec<GraphPosition>> {
    Ok(sqlx::query_as::<_, GraphPosition>(
        "SELECT character_id, x, y FROM character_graph_positions",
    )
    .fetch_all(pool)
    .await?)
}

/// Enregistre des positions (les personnages inconnus sont ignorés).
pub async fn save_positions(pool: &SqlitePool, positions: &[GraphPosition]) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    for position in positions {
        if !position.x.is_finite() || !position.y.is_finite() {
            continue;
        }

        sqlx::query(
            r#"
            INSERT INTO character_graph_positions (character_id, x, y)
            SELECT id, ?, ? FROM characters WHERE id = ?
            ON CONFLICT (character_id) DO UPDATE SET x = excluded.x, y = excluded.y
            "#,
        )
        .bind(position.x)
        .bind(position.y)
        .bind(&position.character_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Efface la disposition libre (le graphe reprend une disposition automatique).
pub async fn clear_positions(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM character_graph_positions").execute(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::character_service::{self, CharacterInput};
    use crate::services::structure_service;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::collections::BTreeMap;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn character(pool: &SqlitePool, name: &str) -> String {
        character_service::create_character(
            pool,
            &CharacterInput {
                first_name: name.to_owned(),
                last_name: String::new(),
                role: "main".to_owned(),
                status: "alive".to_owned(),
                fields: BTreeMap::new(),
            },
        )
        .await
        .unwrap()
        .id
    }

    fn input(source: &str, target: &str) -> RelationInput {
        RelationInput {
            source_id: source.to_owned(),
            target_id: target.to_owned(),
            kind: "family".to_owned(),
            label: "  Frère aîné ".to_owned(),
            description: String::new(),
            directed: false,
            intensity: 4,
            sentiment: "positive".to_owned(),
            since_node: None,
            until_node: None,
        }
    }

    #[tokio::test]
    async fn relations_are_created_updated_and_deleted() {
        let pool = pool().await;
        let a = character(&pool, "Ana").await;
        let b = character(&pool, "Bruno").await;

        let r = create_relation(&pool, &input(&a, &b)).await.unwrap();
        assert_eq!(r.label, "Frère aîné");
        assert_eq!(r.kind, "family");
        assert!(!r.directed);

        let mut changed = input(&a, &b);
        changed.kind = "rivalry".to_owned();
        changed.directed = true;
        changed.sentiment = "negative".to_owned();
        let r = update_relation(&pool, &r.id, &changed).await.unwrap();
        assert_eq!((r.kind.as_str(), r.directed, r.sentiment.as_str()), ("rivalry", true, "negative"));

        assert_eq!(list_relations(&pool).await.unwrap().len(), 1);
        delete_relation(&pool, &r.id).await.unwrap();
        assert!(delete_relation(&pool, &r.id).await.is_err());
        assert!(update_relation(&pool, &r.id, &changed).await.is_err());
    }

    #[tokio::test]
    async fn invalid_relations_are_rejected() {
        let pool = pool().await;
        let a = character(&pool, "Ana").await;
        let b = character(&pool, "Bruno").await;

        assert!(create_relation(&pool, &input(&a, &a)).await.is_err());
        assert!(create_relation(&pool, &input(&a, "inconnu")).await.is_err());

        for (field, value) in [("type", "cousin"), ("sentiment", "joyeux")] {
            let mut bad = input(&a, &b);
            if field == "type" {
                bad.kind = value.to_owned();
            } else {
                bad.sentiment = value.to_owned();
            }
            assert!(create_relation(&pool, &bad).await.is_err(), "{field}");
        }

        for intensity in [0, 6] {
            let mut bad = input(&a, &b);
            bad.intensity = intensity;
            assert!(create_relation(&pool, &bad).await.is_err());
        }

        let mut long = input(&a, &b);
        long.label = "x".repeat(101);
        assert!(create_relation(&pool, &long).await.is_err());
    }

    #[tokio::test]
    async fn period_bounds_follow_the_structure() {
        let pool = pool().await;
        let a = character(&pool, "Ana").await;
        let b = character(&pool, "Bruno").await;
        let c1 = structure_service::create_node(&pool, None, 1, "Chapitre 1").await.unwrap();
        let c2 = structure_service::create_node(&pool, None, 1, "Chapitre 2").await.unwrap();

        let mut with_period = input(&a, &b);
        with_period.since_node = Some(c1.id.clone());
        with_period.until_node = Some(c2.id.clone());
        let r = create_relation(&pool, &with_period).await.unwrap();
        assert_eq!(r.since_node.as_deref(), Some(c1.id.as_str()));

        // Élément inconnu : retiré.
        with_period.since_node = Some("inconnu".to_owned());
        let r2 = create_relation(&pool, &with_period).await.unwrap();
        assert!(r2.since_node.is_none());

        // Élément supprimé : la borne revient à NULL.
        structure_service::delete_node(&pool, &c2.id).await.unwrap();
        let r = find(&pool, &r.id).await.unwrap();
        assert!(r.until_node.is_none());
    }

    #[tokio::test]
    async fn deleting_a_character_deletes_its_relations_and_position() {
        let pool = pool().await;
        let a = character(&pool, "Ana").await;
        let b = character(&pool, "Bruno").await;
        create_relation(&pool, &input(&a, &b)).await.unwrap();
        save_positions(&pool, &[GraphPosition { character_id: a.clone(), x: 10.0, y: 20.0 }])
            .await
            .unwrap();

        character_service::delete_character(&pool, &a).await.unwrap();

        assert!(list_relations(&pool).await.unwrap().is_empty());
        assert!(get_positions(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn graph_positions_are_saved_and_cleared() {
        let pool = pool().await;
        let a = character(&pool, "Ana").await;

        save_positions(
            &pool,
            &[
                GraphPosition { character_id: a.clone(), x: 1.0, y: 2.0 },
                GraphPosition { character_id: "inconnu".to_owned(), x: 0.0, y: 0.0 },
                GraphPosition { character_id: a.clone(), x: 3.5, y: -4.0 },
            ],
        )
        .await
        .unwrap();

        let positions = get_positions(&pool).await.unwrap();
        assert_eq!(positions.len(), 1);
        assert_eq!((positions[0].x, positions[0].y), (3.5, -4.0));

        clear_positions(&pool).await.unwrap();
        assert!(get_positions(&pool).await.unwrap().is_empty());
    }
}
