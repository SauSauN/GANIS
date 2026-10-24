//! Liens entre éléments du monde (base du projet).
//!
//! Un lien relie deux éléments, dont au moins un objet ou une espèce :
//! « Aldric **possède** Excalibur », « Le loup **vit dans** la Forêt
//! d'Ébène », « La potion **est faite à partir de** la Rose de lune ».
//! Il a un sens (source → cible) et apparaît sur les deux fiches ; chaque
//! côté le lit dans son sens (« appartient à Aldric »).
//!
//! Personnage ↔ lieu (`character_location_service`) et personnage ↔
//! personnage (`relation_service`) ont déjà leurs propres liens.
//!
//! Les natures de lien et les sortes d'éléments qu'elles relient sont dans
//! `src/lib/worldLinkCatalog.json`, lu aussi par l'interface.
//!
//! Les deux côtés peuvent être de n'importe quelle sorte : la base ne peut
//! pas les protéger par une clé étrangère. Un élément supprimé emporte donc
//! ses liens à la main ([`detach`]), et ils reviennent avec lui depuis la
//! corbeille. Un lien dont un côté a disparu n'est jamais renvoyé.

use crate::error::{AppError, AppResult};
use crate::services::trash_service::Snapshot;
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqliteConnection;
use sqlx::SqlitePool;
use std::sync::OnceLock;

const MAX_LABEL_CHARS: usize = 100;
const MAX_DESCRIPTION_CHARS: usize = 5_000;

// ----------------------------------------------------------------------------
// Catalogue
// ----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct LinkType {
    pub id: String,
    pub from: Vec<String>,
    pub to: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Catalog {
    pub kinds: Vec<String>,
    pub types: Vec<LinkType>,
}

pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/lib/worldLinkCatalog.json"))
            .expect("src/lib/worldLinkCatalog.json invalide (voir le test catalog_is_consistent)")
    })
}

/// Table d'une sorte d'élément.
fn table_of(kind: &str) -> Option<&'static str> {
    match kind {
        "character" => Some("characters"),
        "location" => Some("locations"),
        "item" => Some("items"),
        "species" => Some("species"),
        _ => None,
    }
}

/// Sortes qui ont besoin d'un lien du monde (les autres paires ont déjà les leurs).
fn is_world_kind(kind: &str) -> bool {
    kind == "item" || kind == "species"
}

// ----------------------------------------------------------------------------
// Types échangés avec l'interface
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorldLink {
    pub id: String,
    pub source_kind: String,
    pub source_id: String,
    pub target_kind: String,
    pub target_id: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub description: String,
    pub since_node: Option<String>,
    pub until_node: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldLinkInput {
    pub source_kind: String,
    pub source_id: String,
    pub target_kind: String,
    pub target_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub since_node: Option<String>,
    #[serde(default)]
    pub until_node: Option<String>,
}

struct CleanInput {
    source_kind: &'static str,
    source_id: String,
    target_kind: &'static str,
    target_id: String,
    kind: String,
    label: String,
    description: String,
    since_node: Option<String>,
    until_node: Option<String>,
}

fn not_found() -> AppError {
    AppError::not_found("Lien introuvable.").with_key("worldLink.notFound")
}

fn invalid() -> AppError {
    AppError::validation("Ce lien ne relie pas deux éléments compatibles.").with_key("worldLink.invalidKinds")
}

async fn exists(pool: &SqlitePool, table: &str, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar(&format!("SELECT id FROM {table} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

async fn clean_node(pool: &SqlitePool, id: &Option<String>) -> AppResult<Option<String>> {
    let Some(id) = id.as_deref().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    Ok(exists(pool, "structure_nodes", id).await?.then(|| id.to_owned()))
}

/// Sorte connue, avec sa table (`'static` pour la garder dans le lien).
fn known_kind(kind: &str) -> AppResult<(&'static str, &'static str)> {
    let table = table_of(kind).ok_or_else(invalid)?;
    let kind = catalog().kinds.iter().find(|k| *k == kind).ok_or_else(invalid)?;
    // `table_of` couvre exactement les sortes du catalogue (test).
    let name: &'static str = match kind.as_str() {
        "character" => "character",
        "location" => "location",
        "item" => "item",
        _ => "species",
    };
    Ok((name, table))
}

async fn clean_input(pool: &SqlitePool, input: &WorldLinkInput) -> AppResult<CleanInput> {
    let (source_kind, source_table) = known_kind(&input.source_kind)?;
    let (target_kind, target_table) = known_kind(&input.target_kind)?;

    if !is_world_kind(source_kind) && !is_world_kind(target_kind) {
        return Err(invalid());
    }
    if input.source_id == input.target_id {
        return Err(AppError::validation("Un élément ne peut pas être lié à lui-même.").with_key("worldLink.self"));
    }

    let link_type = catalog()
        .types
        .iter()
        .find(|t| t.id == input.kind)
        .ok_or_else(|| AppError::validation("Type de lien inconnu.").with_key("worldLink.invalidType"))?;

    if !link_type.from.iter().any(|k| k == source_kind) || !link_type.to.iter().any(|k| k == target_kind) {
        return Err(invalid());
    }

    if !exists(pool, source_table, &input.source_id).await? || !exists(pool, target_table, &input.target_id).await? {
        return Err(AppError::not_found("Un des deux éléments est introuvable.").with_key("worldLink.endNotFound"));
    }

    let label = input.label.trim();
    if label.chars().count() > MAX_LABEL_CHARS {
        return Err(AppError::validation("La précision du lien est trop longue.")
            .with_key("worldLink.labelTooLong")
            .with_param("max", MAX_LABEL_CHARS));
    }

    let description = input.description.trim();
    if description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation("La description du lien est trop longue.")
            .with_key("worldLink.descriptionTooLong")
            .with_param("max", MAX_DESCRIPTION_CHARS));
    }

    Ok(CleanInput {
        source_kind,
        source_id: input.source_id.clone(),
        target_kind,
        target_id: input.target_id.clone(),
        kind: link_type.id.clone(),
        label: label.to_owned(),
        description: description.to_owned(),
        since_node: clean_node(pool, &input.since_node).await?,
        until_node: clean_node(pool, &input.until_node).await?,
    })
}

// ----------------------------------------------------------------------------
// Lecture et écriture
// ----------------------------------------------------------------------------

const COLUMNS: &str = "id, source_kind, source_id, target_kind, target_id, type, label, description, \
                       since_node, until_node, created_at, updated_at";

/// Condition : l'élément `kind`/`id` existe encore.
fn alive(kind: &str, id: &str) -> String {
    format!(
        "(CASE {kind} WHEN 'character' THEN EXISTS (SELECT 1 FROM characters WHERE id = {id}) \
                      WHEN 'location' THEN EXISTS (SELECT 1 FROM locations WHERE id = {id}) \
                      WHEN 'item' THEN EXISTS (SELECT 1 FROM items WHERE id = {id}) \
                      ELSE EXISTS (SELECT 1 FROM species WHERE id = {id}) END)"
    )
}

async fn find(pool: &SqlitePool, id: &str) -> AppResult<WorldLink> {
    sqlx::query_as::<_, WorldLink>(&format!("SELECT {COLUMNS} FROM world_links WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(not_found)
}

/// Tous les liens du projet dont les deux côtés existent.
pub async fn list_links(pool: &SqlitePool) -> AppResult<Vec<WorldLink>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM world_links WHERE {} AND {} ORDER BY created_at, id",
        alive("source_kind", "source_id"),
        alive("target_kind", "target_id"),
    );
    Ok(sqlx::query_as::<_, WorldLink>(&sql).fetch_all(pool).await?)
}

pub async fn create_link(pool: &SqlitePool, input: &WorldLinkInput) -> AppResult<WorldLink> {
    let clean = clean_input(pool, input).await?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        "INSERT INTO world_links (id, source_kind, source_id, target_kind, target_id, type, label, description, \
                                  since_node, until_node, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(clean.source_kind)
    .bind(&clean.source_id)
    .bind(clean.target_kind)
    .bind(&clean.target_id)
    .bind(&clean.kind)
    .bind(&clean.label)
    .bind(&clean.description)
    .bind(&clean.since_node)
    .bind(&clean.until_node)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    find(pool, &id).await
}

pub async fn update_link(pool: &SqlitePool, id: &str, input: &WorldLinkInput) -> AppResult<WorldLink> {
    let clean = clean_input(pool, input).await?;

    let result = sqlx::query(
        "UPDATE world_links SET source_kind = ?, source_id = ?, target_kind = ?, target_id = ?, type = ?, \
                                label = ?, description = ?, since_node = ?, until_node = ?, updated_at = ? \
         WHERE id = ?",
    )
    .bind(clean.source_kind)
    .bind(&clean.source_id)
    .bind(clean.target_kind)
    .bind(&clean.target_id)
    .bind(&clean.kind)
    .bind(&clean.label)
    .bind(&clean.description)
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

/// Nom d'un élément (corbeille).
async fn name_of(conn: &mut SqliteConnection, kind: &str, id: &str) -> String {
    let sql = match kind {
        "character" => "SELECT trim(first_name || ' ' || last_name) FROM characters WHERE id = ?",
        "location" => "SELECT name FROM locations WHERE id = ?",
        "item" => "SELECT name FROM items WHERE id = ?",
        _ => "SELECT name FROM species WHERE id = ?",
    };
    sqlx::query_scalar::<_, String>(sql)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "?".to_owned())
}

/// Supprime un lien (il va dans la corbeille).
pub async fn delete_link(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;

    let link: Option<(String, String, String, String)> =
        sqlx::query_as("SELECT source_kind, source_id, target_kind, target_id FROM world_links WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some((source_kind, source_id, target_kind, target_id)) = link else {
        return Err(not_found());
    };

    let label = format!(
        "{} – {}",
        name_of(&mut tx, &source_kind, &source_id).await,
        name_of(&mut tx, &target_kind, &target_id).await
    );

    let mut snapshot = Snapshot::new();
    snapshot.capture(&mut tx, "world_links", "id", id).await?;
    sqlx::query("DELETE FROM world_links WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "worldLink", id, &label).await?;
    tx.commit().await?;

    Ok(trash_id)
}

/// Avant la suppression d'un élément (personnage, lieu, objet, espèce) :
/// ses liens sont copiés dans sa corbeille puis supprimés.
pub async fn detach(conn: &mut SqliteConnection, snapshot: &mut Snapshot, id: &str) -> AppResult<()> {
    snapshot.capture(&mut *conn, "world_links", "source_id", id).await?;
    snapshot.capture(&mut *conn, "world_links", "target_id", id).await?;

    sqlx::query("DELETE FROM world_links WHERE source_id = ? OR target_id = ?")
        .bind(id)
        .bind(id)
        .execute(&mut *conn)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::character_service::{self, CharacterInput};
    use crate::services::location_service::{self, LocationInput};
    use crate::services::trash_service;
    use crate::services::world_service::{self, Module, WorldEntryInput};
    use sqlx::sqlite::SqlitePoolOptions;
    use std::collections::{BTreeMap, HashSet};

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn entry(pool: &SqlitePool, module: Module, name: &str, kind: &str) -> String {
        world_service::create_entry(
            pool,
            module,
            &WorldEntryInput {
                name: name.to_owned(),
                kind: kind.to_owned(),
                nature: None,
                parent_id: None,
                status: String::new(),
                fields: BTreeMap::new(),
            },
        )
        .await
        .unwrap()
        .id
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

    async fn location(pool: &SqlitePool, name: &str) -> String {
        location_service::create_location(
            pool,
            &LocationInput {
                name: name.to_owned(),
                kind: "forest".to_owned(),
                parent_id: None,
                status: String::new(),
                fields: BTreeMap::new(),
            },
        )
        .await
        .unwrap()
        .id
    }

    fn link(source: (&str, &str), target: (&str, &str), kind: &str) -> WorldLinkInput {
        WorldLinkInput {
            source_kind: source.0.to_owned(),
            source_id: source.1.to_owned(),
            target_kind: target.0.to_owned(),
            target_id: target.1.to_owned(),
            kind: kind.to_owned(),
            label: String::new(),
            description: String::new(),
            since_node: None,
            until_node: None,
        }
    }

    #[test]
    fn catalog_is_consistent() {
        let catalog = catalog();
        let mut ids = HashSet::new();

        for kind in &catalog.kinds {
            assert!(table_of(kind).is_some(), "sorte sans table : {kind}");
        }
        for t in &catalog.types {
            assert!(ids.insert(t.id.as_str()), "type en double : {}", t.id);
            assert!(!t.from.is_empty() && !t.to.is_empty(), "{}", t.id);
            for kind in t.from.iter().chain(&t.to) {
                assert!(catalog.kinds.contains(kind), "{} : sorte {kind}", t.id);
            }
            // Chaque type relie au moins une paire qui contient un objet ou une espèce.
            assert!(
                t.from.iter().any(|k| is_world_kind(k)) || t.to.iter().any(|k| is_world_kind(k)),
                "{} ne concerne ni objet ni espèce",
                t.id
            );
        }
    }

    #[tokio::test]
    async fn links_are_validated_listed_and_follow_deletions() {
        let pool = pool().await;

        let aldric = character(&pool, "Aldric").await;
        let forest = location(&pool, "Forêt d'Ébène").await;
        let sword = entry(&pool, Module::Item, "Excalibur", "sword").await;
        let wolf = entry(&pool, Module::Species, "Loup gris", "mammal").await;

        let owns = create_link(&pool, &link(("character", &aldric), ("item", &sword), "owns")).await.unwrap();
        assert_eq!(owns.kind, "owns");
        let lives = create_link(&pool, &link(("species", &wolf), ("location", &forest), "livesIn")).await.unwrap();

        // Sens incompatible, sortes qui ont déjà leurs liens, élément absent,
        // lien vers soi-même, type inconnu : refusés.
        assert!(create_link(&pool, &link(("item", &sword), ("character", &aldric), "owns")).await.is_err());
        assert!(create_link(&pool, &link(("character", &aldric), ("location", &forest), "related")).await.is_err());
        assert!(create_link(&pool, &link(("character", &aldric), ("item", "absent"), "owns")).await.is_err());
        assert!(create_link(&pool, &link(("item", &sword), ("item", &sword), "partOf")).await.is_err());
        assert!(create_link(&pool, &link(("character", &aldric), ("item", &sword), "adore")).await.is_err());
        assert!(create_link(&pool, &link(("dragon", &aldric), ("item", &sword), "related")).await.is_err());

        let mut changed = link(("character", &aldric), ("item", &sword), "made");
        changed.label = " Forgée pour lui ".to_owned();
        let saved = update_link(&pool, &owns.id, &changed).await.unwrap();
        assert_eq!(saved.kind, "made");
        assert_eq!(saved.label, "Forgée pour lui");

        assert_eq!(list_links(&pool).await.unwrap().len(), 2);

        // Personnage supprimé : son lien part avec lui, puis revient.
        let trash = character_service::delete_character(&pool, &aldric).await.unwrap();
        assert_eq!(list_links(&pool).await.unwrap().len(), 1);
        trash_service::restore(&pool, &trash).await.unwrap();
        assert_eq!(list_links(&pool).await.unwrap().len(), 2);

        // Lieu supprimé, idem.
        let trash = location_service::delete_location(&pool, &forest).await.unwrap();
        assert_eq!(list_links(&pool).await.unwrap().len(), 1);
        trash_service::restore(&pool, &trash).await.unwrap();

        // Objet supprimé.
        world_service::delete_entry(&pool, Module::Item, &sword).await.unwrap();
        let left = list_links(&pool).await.unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].id, lives.id);

        // Lien supprimé : dans la corbeille, avec les deux noms.
        let trash = delete_link(&pool, &lives.id).await.unwrap();
        let items = trash_service::list(&pool).await.unwrap();
        let entry = items.iter().find(|item| item.id == trash).unwrap();
        assert_eq!(entry.kind, "worldLink");
        assert_eq!(entry.label, "Loup gris – Forêt d'Ébène");
        assert!(list_links(&pool).await.unwrap().is_empty());
        trash_service::restore(&pool, &trash).await.unwrap();
        assert_eq!(list_links(&pool).await.unwrap().len(), 1);
    }
}
