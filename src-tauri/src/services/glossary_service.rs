//! Glossaire du projet (voir la migration `032_glossary.sql`) : les termes
//! propres à l'histoire, avec leur définition, une catégorie facultative et
//! des liens vers les fiches.
//!
//! - Le terme est obligatoire ; deux termes peuvent s'écrire pareil (un
//!   même mot peut avoir deux sens selon le peuple qui l'emploie).
//! - Les liens désignent des fiches existantes au moment de l'ajout ; une
//!   fiche supprimée ensuite reste dans la liste et l'interface l'ignore
//!   (elle peut revenir de la corbeille).
//! - Supprimer un terme le met à la corbeille.
//! - La liste est triée par ordre alphabétique sans tenir compte de la
//!   casse ; l'interface regroupe par lettre en ignorant les accents.

use crate::error::{AppError, AppResult};
use crate::services::trash_service::Snapshot;
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

const MAX_TERM_CHARS: usize = 200;
const MAX_CATEGORY_CHARS: usize = 100;
const MAX_DEFINITION_CHARS: usize = 20_000;
const MAX_LINKS: usize = 50;

/// Sortes de fiches qu'un terme peut citer, avec leur table.
const LINK_KINDS: [(&str, &str); 7] = [
    ("character", "characters"),
    ("location", "locations"),
    ("item", "items"),
    ("species", "species"),
    ("faction", "factions"),
    ("people", "peoples"),
    ("magic", "magic_systems"),
];

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/// Fiche citée par un terme.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlossaryLink {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryTerm {
    pub id: String,
    pub term: String,
    pub definition: String,
    pub category: String,
    pub links: Vec<GlossaryLink>,
    pub created_at: String,
    pub updated_at: String,
}

/// Terme envoyé par l'interface (création et modification).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlossaryInput {
    pub term: String,
    #[serde(default)]
    pub definition: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub links: Vec<GlossaryLink>,
}

#[derive(sqlx::FromRow)]
struct Row {
    id: String,
    term: String,
    definition: String,
    category: String,
    links: String,
    created_at: String,
    updated_at: String,
}

impl From<Row> for GlossaryTerm {
    fn from(row: Row) -> Self {
        Self {
            id: row.id,
            term: row.term,
            definition: row.definition,
            category: row.category,
            // Colonne abîmée à la main : le terme reste lisible, sans liens.
            links: serde_json::from_str(&row.links).unwrap_or_default(),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

const COLUMNS: &str = "id, term, definition, category, links, created_at, updated_at";

fn not_found() -> AppError {
    AppError::not_found("Ce terme n'existe plus.").with_key("glossary.notFound")
}

// ----------------------------------------------------------------------------
// Vérifications
// ----------------------------------------------------------------------------

fn too_long(key: &'static str, max: usize) -> AppError {
    AppError::validation("Texte trop long.").with_key(key).with_param("max", max)
}

/// Nettoie et vérifie un terme ; les liens en double sont retirés.
async fn clean(pool: &SqlitePool, input: &GlossaryInput) -> AppResult<(String, String, String, String)> {
    let term = input.term.trim();
    if term.is_empty() {
        return Err(AppError::validation("Le terme ne peut pas être vide.").with_key("glossary.termEmpty"));
    }
    if term.chars().count() > MAX_TERM_CHARS {
        return Err(too_long("glossary.termTooLong", MAX_TERM_CHARS));
    }
    let category = input.category.trim();
    if category.chars().count() > MAX_CATEGORY_CHARS {
        return Err(too_long("glossary.categoryTooLong", MAX_CATEGORY_CHARS));
    }
    let definition = input.definition.trim();
    if definition.chars().count() > MAX_DEFINITION_CHARS {
        return Err(too_long("glossary.definitionTooLong", MAX_DEFINITION_CHARS));
    }

    let mut links: Vec<GlossaryLink> = Vec::new();
    for link in &input.links {
        if !links.contains(link) {
            links.push(link.clone());
        }
    }
    if links.len() > MAX_LINKS {
        return Err(AppError::validation("Trop de fiches liées.").with_key("glossary.tooManyLinks").with_param("max", MAX_LINKS));
    }
    for link in &links {
        let table = LINK_KINDS
            .iter()
            .find(|(kind, _)| *kind == link.kind)
            .map(|(_, table)| *table)
            .ok_or_else(|| AppError::validation("Sorte de fiche inconnue.").with_key("glossary.invalidLink"))?;
        let exists: Option<i64> = sqlx::query_scalar(&format!("SELECT 1 FROM {table} WHERE id = ?"))
            .bind(&link.id)
            .fetch_optional(pool)
            .await?;
        if exists.is_none() {
            return Err(AppError::validation("La fiche liée n'existe plus.").with_key("glossary.linkNotFound"));
        }
    }

    let links = serde_json::to_string(&links).map_err(|e| AppError::internal("Glossaire : liens illisibles").with_detail(e))?;
    Ok((term.to_owned(), definition.to_owned(), category.to_owned(), links))
}

// ----------------------------------------------------------------------------
// Lecture et écriture
// ----------------------------------------------------------------------------

/// Tous les termes, par ordre alphabétique.
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<GlossaryTerm>> {
    let sql = format!("SELECT {COLUMNS} FROM glossary_terms ORDER BY term COLLATE NOCASE, created_at");
    let rows = sqlx::query_as::<_, Row>(&sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(GlossaryTerm::from).collect())
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<GlossaryTerm> {
    let sql = format!("SELECT {COLUMNS} FROM glossary_terms WHERE id = ?");
    sqlx::query_as::<_, Row>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(GlossaryTerm::from)
        .ok_or_else(not_found)
}

pub async fn create(pool: &SqlitePool, input: &GlossaryInput) -> AppResult<GlossaryTerm> {
    let (term, definition, category, links) = clean(pool, input).await?;
    let id = new_id();
    let now = now_utc();
    sqlx::query(
        "INSERT INTO glossary_terms (id, term, definition, category, links, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&term)
    .bind(&definition)
    .bind(&category)
    .bind(&links)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;
    get(pool, &id).await
}

pub async fn update(pool: &SqlitePool, id: &str, input: &GlossaryInput) -> AppResult<GlossaryTerm> {
    let (term, definition, category, links) = clean(pool, input).await?;
    let result = sqlx::query(
        "UPDATE glossary_terms SET term = ?, definition = ?, category = ?, links = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&term)
    .bind(&definition)
    .bind(&category)
    .bind(&links)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    get(pool, id).await
}

/// Met le terme à la corbeille ; renvoie l'identifiant de l'entrée.
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = Snapshot::new();
    snapshot.capture(&mut tx, "glossary_terms", "id", id).await?;
    if snapshot.is_empty() {
        return Err(not_found());
    }
    let label: String = sqlx::query_scalar("SELECT term FROM glossary_terms WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM glossary_terms WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "glossaryTerm", id, &label).await?;
    tx.commit().await?;
    Ok(trash_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::character_service::{self, CharacterInput};
    use crate::services::trash_service;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    fn input(term: &str) -> GlossaryInput {
        GlossaryInput { term: term.into(), ..Default::default() }
    }

    async fn character(pool: &SqlitePool) -> String {
        character_service::create_character(
            pool,
            &CharacterInput {
                first_name: "Sora".to_owned(),
                last_name: String::new(),
                role: "main".to_owned(),
                status: "alive".to_owned(),
                fields: Default::default(),
            },
        )
        .await
        .unwrap()
        .id
    }

    #[tokio::test]
    async fn create_list_sorted_update() {
        let pool = pool().await;
        create(&pool, &input("  zéphyr ")).await.unwrap();
        create(&pool, &input("Lunéa")).await.unwrap();
        let ancre = create(&pool, &GlossaryInput {
            term: "ancre".into(),
            definition: " Pierre des marées ".into(),
            category: "Objet".into(),
            links: vec![],
        })
        .await
        .unwrap();

        let terms: Vec<String> = list(&pool).await.unwrap().into_iter().map(|t| t.term).collect();
        assert_eq!(terms, ["ancre", "Lunéa", "zéphyr"]);
        assert_eq!(ancre.definition, "Pierre des marées");

        let updated = update(&pool, &ancre.id, &GlossaryInput { term: "Ancre".into(), ..Default::default() }).await.unwrap();
        assert_eq!(updated.term, "Ancre");
        assert_eq!(updated.category, "");
        assert!(update(&pool, "absent", &input("x")).await.is_err());
    }

    #[tokio::test]
    async fn invalid_inputs_are_refused() {
        let pool = pool().await;
        assert!(create(&pool, &input("   ")).await.is_err());
        assert!(create(&pool, &input(&"a".repeat(MAX_TERM_CHARS + 1))).await.is_err());
        let bad_kind = GlossaryInput { term: "x".into(), links: vec![GlossaryLink { kind: "plot".into(), id: "1".into() }], ..Default::default() };
        assert!(create(&pool, &bad_kind).await.is_err());
        let missing = GlossaryInput { term: "x".into(), links: vec![GlossaryLink { kind: "character".into(), id: "absent".into() }], ..Default::default() };
        assert!(create(&pool, &missing).await.is_err());
        assert!(list(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn links_are_deduplicated_and_kept() {
        let pool = pool().await;
        let sora = character(&pool).await;
        let link = GlossaryLink { kind: "character".into(), id: sora.clone() };
        let term = create(&pool, &GlossaryInput { term: "Sans-lune".into(), links: vec![link.clone(), link.clone()], ..Default::default() })
            .await
            .unwrap();
        assert_eq!(term.links, vec![link]);

        // La fiche supprimée reste citée : l'interface l'ignore.
        sqlx::query("DELETE FROM characters WHERE id = ?").bind(&sora).execute(&pool).await.unwrap();
        assert_eq!(get(&pool, &term.id).await.unwrap().links.len(), 1);
    }

    #[tokio::test]
    async fn delete_goes_to_trash_and_restores() {
        let pool = pool().await;
        let term = create(&pool, &GlossaryInput { term: "Ressac".into(), definition: "Premier rang".into(), ..Default::default() })
            .await
            .unwrap();
        let trash_id = delete(&pool, &term.id).await.unwrap();
        assert!(list(&pool).await.unwrap().is_empty());
        assert!(delete(&pool, &term.id).await.is_err());

        let item = trash_service::restore(&pool, &trash_id).await.unwrap();
        assert_eq!(item.kind, "glossaryTerm");
        assert_eq!(item.label, "Ressac");
        assert_eq!(get(&pool, &term.id).await.unwrap().definition, "Premier rang");
    }
}
