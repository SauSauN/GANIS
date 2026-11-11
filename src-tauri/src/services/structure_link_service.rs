//! Personnages, lieux et fiches du monde (objets, faune et flore, factions,
//! peuples, magie) liés aux éléments du découpage (base du projet).
//!
//! Un personnage ou un lieu est lié au plus une fois à un même élément
//! (chapitre, scène…), avec un rôle. Les liens servent à la fiche de
//! l'élément et, dans l'autre sens, à la carte « Dans le récit » des fiches
//! des personnages et des lieux.

use crate::error::{AppError, AppResult};
use crate::utils::now_utc;
use serde::Serialize;
use sqlx::SqlitePool;

/// Rôles d'un personnage dans un élément (codes traduits par l'interface).
pub const CHARACTER_ROLES: [&str; 3] = ["present", "pov", "mentioned"];

/// Rôles d'un lieu dans un élément.
pub const LOCATION_ROLES: [&str; 2] = ["setting", "mentioned"];

/// Rôles d'une fiche du monde dans un élément (migration 036).
pub const ENTRY_ROLES: [&str; 3] = ["central", "present", "mentioned"];

/// Sortes de fiches du monde, avec leur table.
const ENTRY_KINDS: [(&str, &str); 5] = [
    ("item", "items"),
    ("species", "species"),
    ("faction", "factions"),
    ("people", "peoples"),
    ("magic", "magic_systems"),
];

/// Fiche du monde liée à un élément.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NodeEntry {
    pub node_id: String,
    pub kind: String,
    pub entry_id: String,
    pub role: String,
    pub created_at: String,
}

/// Personnage lié à un élément.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NodeCharacter {
    pub node_id: String,
    pub character_id: String,
    pub role: String,
    pub created_at: String,
}

/// Lieu lié à un élément.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NodeLocation {
    pub node_id: String,
    pub location_id: String,
    pub role: String,
    pub created_at: String,
}

/// Tous les liens du projet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureLinks {
    pub characters: Vec<NodeCharacter>,
    pub locations: Vec<NodeLocation>,
    /// Fiches du monde ; un lien vers une fiche supprimée peut y rester
    /// (l'interface l'ignore).
    pub entries: Vec<NodeEntry>,
}

fn invalid_role() -> AppError {
    AppError::validation("Rôle inconnu.").with_key("structureLink.invalidRole")
}

fn not_found(key: &'static str, message: &str) -> AppError {
    AppError::not_found(message.to_owned()).with_key(key)
}

async fn exists(pool: &SqlitePool, table: &str, id: &str) -> AppResult<bool> {
    let found: Option<i64> = sqlx::query_scalar(&format!("SELECT 1 FROM {table} WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?;

    Ok(found.is_some())
}

async fn check_node(pool: &SqlitePool, node_id: &str) -> AppResult<()> {
    if exists(pool, "structure_nodes", node_id).await? {
        Ok(())
    } else {
        Err(not_found("structure.notFound", "Élément du découpage introuvable."))
    }
}

/// Tous les liens, dans l'ordre de création.
pub async fn list_links(pool: &SqlitePool) -> AppResult<StructureLinks> {
    let characters = sqlx::query_as::<_, NodeCharacter>(
        "SELECT node_id, character_id, role, created_at FROM structure_node_characters \
         ORDER BY created_at, character_id",
    )
    .fetch_all(pool)
    .await?;

    let locations = sqlx::query_as::<_, NodeLocation>(
        "SELECT node_id, location_id, role, created_at FROM structure_node_locations \
         ORDER BY created_at, location_id",
    )
    .fetch_all(pool)
    .await?;

    let entries = sqlx::query_as::<_, NodeEntry>(
        "SELECT node_id, kind, entry_id, role, created_at FROM structure_node_entries          ORDER BY created_at, entry_id",
    )
    .fetch_all(pool)
    .await?;

    Ok(StructureLinks { characters, locations, entries })
}

/// Lie un personnage à un élément, ou change son rôle s'il l'est déjà.
pub async fn link_character(pool: &SqlitePool, node_id: &str, character_id: &str, role: &str) -> AppResult<()> {
    if !CHARACTER_ROLES.contains(&role) {
        return Err(invalid_role());
    }
    check_node(pool, node_id).await?;
    if !exists(pool, "characters", character_id).await? {
        return Err(not_found("character.notFound", "Personnage introuvable."));
    }

    sqlx::query(
        "INSERT INTO structure_node_characters (node_id, character_id, role, created_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT (node_id, character_id) DO UPDATE SET role = excluded.role",
    )
    .bind(node_id)
    .bind(character_id)
    .bind(role)
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

/// Retire un personnage d'un élément (rien à faire s'il n'y est pas).
pub async fn unlink_character(pool: &SqlitePool, node_id: &str, character_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM structure_node_characters WHERE node_id = ? AND character_id = ?")
        .bind(node_id)
        .bind(character_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Lie un lieu à un élément, ou change son rôle s'il l'est déjà.
pub async fn link_location(pool: &SqlitePool, node_id: &str, location_id: &str, role: &str) -> AppResult<()> {
    if !LOCATION_ROLES.contains(&role) {
        return Err(invalid_role());
    }
    check_node(pool, node_id).await?;
    if !exists(pool, "locations", location_id).await? {
        return Err(not_found("location.notFound", "Lieu introuvable."));
    }

    sqlx::query(
        "INSERT INTO structure_node_locations (node_id, location_id, role, created_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT (node_id, location_id) DO UPDATE SET role = excluded.role",
    )
    .bind(node_id)
    .bind(location_id)
    .bind(role)
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

/// Retire un lieu d'un élément (rien à faire s'il n'y est pas).
pub async fn unlink_location(pool: &SqlitePool, node_id: &str, location_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM structure_node_locations WHERE node_id = ? AND location_id = ?")
        .bind(node_id)
        .bind(location_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Lie une fiche du monde à un élément, ou change son rôle si elle l'est déjà.
pub async fn link_entry(pool: &SqlitePool, node_id: &str, kind: &str, entry_id: &str, role: &str) -> AppResult<()> {
    if !ENTRY_ROLES.contains(&role) {
        return Err(invalid_role());
    }
    let table = ENTRY_KINDS
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, table)| *table)
        .ok_or_else(|| AppError::validation("Sorte de fiche inconnue.").with_key("structureLink.invalidKind"))?;
    check_node(pool, node_id).await?;
    if !exists(pool, table, entry_id).await? {
        return Err(not_found("world.notFound", "Fiche introuvable."));
    }

    sqlx::query(
        "INSERT INTO structure_node_entries (node_id, kind, entry_id, role, created_at) VALUES (?, ?, ?, ?, ?)          ON CONFLICT (node_id, kind, entry_id) DO UPDATE SET role = excluded.role",
    )
    .bind(node_id)
    .bind(kind)
    .bind(entry_id)
    .bind(role)
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

/// Retire une fiche du monde d'un élément (rien à faire si elle n'y est pas).
pub async fn unlink_entry(pool: &SqlitePool, node_id: &str, kind: &str, entry_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM structure_node_entries WHERE node_id = ? AND kind = ? AND entry_id = ?")
        .bind(node_id)
        .bind(kind)
        .bind(entry_id)
        .execute(pool)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::models::project::ProjectType;
    use crate::services::structure_service;
    use sqlx::sqlite::SqlitePoolOptions;

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

    async fn add(pool: &SqlitePool, sql: &str) {
        sqlx::query(sql).execute(pool).await.unwrap();
    }

    #[tokio::test]
    async fn links_are_created_updated_and_removed_with_their_items() {
        let pool = pool().await;
        add(&pool, "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) VALUES ('c1', 'Aldric', '', 'main', 'alive', '{}', 'x', 'x')").await;
        add(&pool, "INSERT INTO locations (id, name, type, parent_id, status, fields, created_at, updated_at) VALUES ('l1', 'Valona', 'city', NULL, 'existing', '{}', 'x', 'x')").await;
        let scene = structure_service::create_node(&pool, ProjectType::Novel, None, 2, "", None).await.unwrap();
        let other = structure_service::create_node(&pool, ProjectType::Novel, None, 2, "", None).await.unwrap();

        link_character(&pool, &scene.id, "c1", "present").await.unwrap();
        link_character(&pool, &scene.id, "c1", "pov").await.unwrap(); // rôle changé, pas de doublon
        link_character(&pool, &other.id, "c1", "mentioned").await.unwrap();
        link_location(&pool, &scene.id, "l1", "setting").await.unwrap();

        let links = list_links(&pool).await.unwrap();
        assert_eq!(links.characters.len(), 2);
        assert_eq!(links.characters.iter().find(|l| l.node_id == scene.id).unwrap().role, "pov");
        assert_eq!(links.locations.len(), 1);

        // Rôle inconnu, élément ou fiche introuvable : refusé.
        assert!(link_character(&pool, &scene.id, "c1", "hero").await.is_err());
        assert!(link_location(&pool, &scene.id, "l1", "pov").await.is_err());
        assert!(link_character(&pool, "inconnu", "c1", "present").await.is_err());
        assert!(link_location(&pool, &scene.id, "inconnu", "setting").await.is_err());

        unlink_character(&pool, &other.id, "c1").await.unwrap();
        unlink_character(&pool, &other.id, "c1").await.unwrap(); // déjà retiré : sans erreur
        assert_eq!(list_links(&pool).await.unwrap().characters.len(), 1);

        // Supprimer l'élément ou le lieu supprime ses liens.
        add(&pool, "DELETE FROM locations WHERE id = 'l1'").await;
        assert!(list_links(&pool).await.unwrap().locations.is_empty());
        structure_service::delete_node(&pool, &scene.id).await.unwrap();
        assert!(list_links(&pool).await.unwrap().characters.is_empty());
    }

    #[tokio::test]
    async fn world_entries_are_linked_with_a_role() {
        let pool = pool().await;
        add(&pool, "INSERT INTO items (id, name, type, parent_id, status, fields, created_at, updated_at) VALUES ('i1', 'Excalibur', 'weapon', NULL, 'existing', '{}', 'x', 'x')").await;
        let scene = structure_service::create_node(&pool, ProjectType::Novel, None, 2, "", None).await.unwrap();

        link_entry(&pool, &scene.id, "item", "i1", "present").await.unwrap();
        link_entry(&pool, &scene.id, "item", "i1", "central").await.unwrap(); // rôle changé
        let links = list_links(&pool).await.unwrap();
        assert_eq!(links.entries.len(), 1);
        assert_eq!((links.entries[0].kind.as_str(), links.entries[0].role.as_str()), ("item", "central"));

        assert!(link_entry(&pool, &scene.id, "item", "i1", "pov").await.is_err());
        assert!(link_entry(&pool, &scene.id, "plot", "i1", "present").await.is_err());
        assert!(link_entry(&pool, &scene.id, "faction", "i1", "present").await.is_err()); // pas une faction

        unlink_entry(&pool, &scene.id, "item", "i1").await.unwrap();
        assert!(list_links(&pool).await.unwrap().entries.is_empty());

        // Supprimer l'élément supprime ses liens.
        link_entry(&pool, &scene.id, "item", "i1", "mentioned").await.unwrap();
        structure_service::delete_node(&pool, &scene.id).await.unwrap();
        assert!(list_links(&pool).await.unwrap().entries.is_empty());
    }
}
