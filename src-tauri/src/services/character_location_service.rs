//! Liens entre personnages et lieux (base du projet).
//!
//! Un lien relie un personnage et un lieu, et apparaît sur les deux fiches :
//! un type (naissance, habite, règne…), une précision libre, une
//! description et une période facultative (éléments du découpage du récit).
//! Un même personnage peut avoir plusieurs liens avec un même lieu (né à
//! Valona, puis exilé de Valona).

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Types de liens (codes traduits par l'interface).
pub const TYPES: [&str; 13] = [
    "born",
    "lives",
    "grewUp",
    "rules",
    "owns",
    "works",
    "frequents",
    "guards",
    "imprisoned",
    "hides",
    "exiled",
    "died",
    "other",
];

const MAX_LABEL_CHARS: usize = 100;
const MAX_DESCRIPTION_CHARS: usize = 5_000;

/// Lien, tel qu'envoyé à l'interface.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CharacterLocation {
    pub id: String,
    pub character_id: String,
    pub location_id: String,
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

/// Contenu d'un lien (création ou modification).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterLocationInput {
    pub character_id: String,
    pub location_id: String,
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
    character_id: String,
    location_id: String,
    kind: &'static str,
    label: String,
    description: String,
    since_node: Option<String>,
    until_node: Option<String>,
}

fn not_found() -> AppError {
    AppError::not_found("Lien introuvable.").with_key("placeLink.notFound")
}

async fn exists(pool: &SqlitePool, sql: &str, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar(sql).bind(id).fetch_optional(pool).await?;
    Ok(found.is_some())
}

/// Élément du découpage, s'il existe encore (sinon : pas de borne).
async fn clean_node(pool: &SqlitePool, id: &Option<String>) -> AppResult<Option<String>> {
    let Some(id) = id.as_deref().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };

    let found = exists(pool, "SELECT id FROM structure_nodes WHERE id = ?", id).await?;
    Ok(found.then(|| id.to_owned()))
}

async fn clean_input(pool: &SqlitePool, input: &CharacterLocationInput) -> AppResult<CleanInput> {
    if !exists(pool, "SELECT id FROM characters WHERE id = ?", &input.character_id).await? {
        return Err(AppError::not_found("Personnage introuvable.").with_key("character.notFound"));
    }

    if !exists(pool, "SELECT id FROM locations WHERE id = ?", &input.location_id).await? {
        return Err(AppError::not_found("Lieu introuvable.").with_key("location.notFound"));
    }

    let kind = TYPES
        .into_iter()
        .find(|kind| *kind == input.kind)
        .ok_or_else(|| AppError::validation("Type de lien inconnu.").with_key("placeLink.invalidType"))?;

    let label = input.label.trim();

    if label.chars().count() > MAX_LABEL_CHARS {
        return Err(AppError::validation("La précision du lien est trop longue.")
            .with_key("placeLink.labelTooLong")
            .with_param("max", MAX_LABEL_CHARS));
    }

    let description = input.description.trim();

    if description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation("La description du lien est trop longue.")
            .with_key("placeLink.descriptionTooLong")
            .with_param("max", MAX_DESCRIPTION_CHARS));
    }

    Ok(CleanInput {
        character_id: input.character_id.clone(),
        location_id: input.location_id.clone(),
        kind,
        label: label.to_owned(),
        description: description.to_owned(),
        since_node: clean_node(pool, &input.since_node).await?,
        until_node: clean_node(pool, &input.until_node).await?,
    })
}

const COLUMNS: &str = "id, character_id, location_id, type, label, description, \
                       since_node, until_node, created_at, updated_at";

async fn find(pool: &SqlitePool, id: &str) -> AppResult<CharacterLocation> {
    let sql = format!("SELECT {COLUMNS} FROM character_locations WHERE id = ?");

    sqlx::query_as::<_, CharacterLocation>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(not_found)
}

/// Tous les liens du projet.
pub async fn list_links(pool: &SqlitePool) -> AppResult<Vec<CharacterLocation>> {
    let sql = format!("SELECT {COLUMNS} FROM character_locations ORDER BY created_at, id");
    Ok(sqlx::query_as::<_, CharacterLocation>(&sql).fetch_all(pool).await?)
}

/// Crée un lien.
pub async fn create_link(
    pool: &SqlitePool,
    input: &CharacterLocationInput,
) -> AppResult<CharacterLocation> {
    let clean = clean_input(pool, input).await?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO character_locations
            (id, character_id, location_id, type, label, description,
             since_node, until_node, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&clean.character_id)
    .bind(&clean.location_id)
    .bind(clean.kind)
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

/// Remplace un lien.
pub async fn update_link(
    pool: &SqlitePool,
    id: &str,
    input: &CharacterLocationInput,
) -> AppResult<CharacterLocation> {
    let clean = clean_input(pool, input).await?;

    let result = sqlx::query(
        r#"
        UPDATE character_locations
        SET character_id = ?, location_id = ?, type = ?, label = ?, description = ?,
            since_node = ?, until_node = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&clean.character_id)
    .bind(&clean.location_id)
    .bind(clean.kind)
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

/// Supprime un lien.
pub async fn delete_link(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM character_locations WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::character_service::{self, CharacterInput};
    use crate::services::location_service::{self, LocationInput};
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

    async fn character(pool: &SqlitePool, name: &str, fields: &[(&str, &str)]) -> String {
        character_service::create_character(
            pool,
            &CharacterInput {
                first_name: name.to_owned(),
                last_name: String::new(),
                role: "main".to_owned(),
                status: "alive".to_owned(),
                fields: fields.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect(),
            },
        )
        .await
        .unwrap()
        .id
    }

    async fn place(pool: &SqlitePool, name: &str, fields: &[(&str, &str)]) -> String {
        location_service::create_location(
            pool,
            &LocationInput {
                name: name.to_owned(),
                kind: "city".to_owned(),
                parent_id: None,
                status: String::new(),
                fields: fields.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect::<BTreeMap<_, _>>(),
            },
        )
        .await
        .unwrap()
        .id
    }

    fn input(character_id: &str, location_id: &str, kind: &str) -> CharacterLocationInput {
        CharacterLocationInput {
            character_id: character_id.to_owned(),
            location_id: location_id.to_owned(),
            kind: kind.to_owned(),
            label: "  Maison familiale ".to_owned(),
            description: String::new(),
            since_node: None,
            until_node: None,
        }
    }

    #[tokio::test]
    async fn links_are_created_updated_and_deleted() {
        let pool = pool().await;
        let aldric = character(&pool, "Aldric", &[]).await;
        let valona = place(&pool, "Valona", &[]).await;
        let chapter = structure_service::create_node(&pool, None, 0, "Chapitre 1").await.unwrap();

        let link = create_link(&pool, &input(&aldric, &valona, "born")).await.unwrap();
        assert_eq!(link.label, "Maison familiale");

        // Plusieurs liens avec le même lieu.
        create_link(&pool, &input(&aldric, &valona, "exiled")).await.unwrap();

        let mut changed = input(&aldric, &valona, "lives");
        changed.since_node = Some(chapter.id.clone());
        changed.until_node = Some("absent".to_owned());
        let link = update_link(&pool, &link.id, &changed).await.unwrap();
        assert_eq!(link.kind, "lives");
        assert_eq!(link.since_node.as_deref(), Some(chapter.id.as_str()));
        assert_eq!(link.until_node, None);

        assert_eq!(list_links(&pool).await.unwrap().len(), 2);
        delete_link(&pool, &link.id).await.unwrap();
        assert!(delete_link(&pool, &link.id).await.is_err());
        assert!(update_link(&pool, &link.id, &changed).await.is_err());
    }

    #[tokio::test]
    async fn input_is_validated() {
        let pool = pool().await;
        let aldric = character(&pool, "Aldric", &[]).await;
        let valona = place(&pool, "Valona", &[]).await;

        assert!(create_link(&pool, &input("absent", &valona, "born")).await.is_err());
        assert!(create_link(&pool, &input(&aldric, "absent", "born")).await.is_err());
        assert!(create_link(&pool, &input(&aldric, &valona, "inconnu")).await.is_err());

        let mut long = input(&aldric, &valona, "born");
        long.label = "x".repeat(101);
        assert!(create_link(&pool, &long).await.is_err());
    }

    #[tokio::test]
    async fn deleting_either_side_cleans_links_and_fields() {
        let pool = pool().await;
        let aldric = character(&pool, "Aldric", &[]).await;
        let valona = place(&pool, "Valona", &[("ruler", &aldric)]).await;
        let mira = character(&pool, "Mira", &[("origin", &valona)]).await;
        create_link(&pool, &input(&aldric, &valona, "rules")).await.unwrap();
        create_link(&pool, &input(&mira, &valona, "born")).await.unwrap();

        // Le personnage supprimé : ses liens et le champ « Dirigeant » disparaissent.
        character_service::delete_character(&pool, &aldric).await.unwrap();
        assert_eq!(list_links(&pool).await.unwrap().len(), 1);
        let city = location_service::get_location(&pool, &valona).await.unwrap();
        assert!(!city.fields.contains_key("ruler"));

        // Le lieu supprimé : l'origine de Mira garde son nom, en texte.
        location_service::delete_location(&pool, &valona).await.unwrap();
        assert!(list_links(&pool).await.unwrap().is_empty());
        let mira = character_service::get_character(&pool, &mira).await.unwrap();
        assert_eq!(mira.fields.get("origin").map(String::as_str), Some("Valona"));
    }

    #[tokio::test]
    async fn origin_accepts_a_place_or_free_text() {
        let pool = pool().await;
        let valona = place(&pool, "Valona", &[]).await;

        let a = character(&pool, "A", &[("origin", &valona)]).await;
        let b = character(&pool, "B", &[("origin", " Un village du Nord ")]).await;

        let a = character_service::get_character(&pool, &a).await.unwrap();
        let b = character_service::get_character(&pool, &b).await.unwrap();
        assert_eq!(a.fields["origin"], valona);
        assert_eq!(b.fields["origin"], "Un village du Nord");
    }
}
