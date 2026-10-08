//! Service de gestion du synopsis d'un projet.
//!
//! Le synopsis est stocké dans la base de données du projet.
//! Comme un projet n'a qu'un seul synopsis, la table ne contient
//! qu'une seule ligne, identifiée par l'ID fixe 'default'.
//!
//! Les listes (genres, sous-genres, ton) sont stockées en JSON (TEXT)
//! car SQLite ne dispose pas de type tableau natif.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Longueur maximale du contenu (HTML de l'éditeur inclus), en caractères.
const MAX_CONTENT_CHARS: usize = 200_000;

/// Nombre maximal d'éléments dans une liste (genres, sous-genres, ton).
const MAX_TAGS: usize = 20;

/// Longueur maximale d'un élément de liste, en caractères.
const MAX_TAG_CHARS: usize = 50;

/// Représente le synopsis d'un projet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Synopsis {
    pub id: String,
    pub content: String,
    pub genres: Vec<String>,
    pub subgenres: Vec<String>,
    pub tone: Vec<String>,

    #[serde(rename = "createdAt")]
    pub created_at: String,

    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// Ligne brute telle que lue depuis SQLite (listes en JSON).
#[derive(Debug, sqlx::FromRow)]
struct SynopsisRow {
    id: String,
    content: String,
    genres: String,
    subgenres: String,
    tone: String,
    created_at: String,
    updated_at: String,
}

impl SynopsisRow {
    /// Convertit la ligne SQLite en `Synopsis` typé.
    fn into_synopsis(self) -> AppResult<Synopsis> {
        Ok(Synopsis {
            id: self.id,
            content: self.content,
            genres: parse_json_list(&self.genres, "genres")?,
            subgenres: parse_json_list(&self.subgenres, "subgenres")?,
            tone: parse_json_list(&self.tone, "tone")?,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

/// Parse une liste JSON stockée en base.
///
/// Si la valeur est vide ou invalide, on renvoie une liste vide
/// plutôt que de faire échouer toute la lecture.
fn parse_json_list(raw: &str, field: &str) -> AppResult<Vec<String>> {
    let trimmed = raw.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str::<Vec<String>>(trimmed).map_err(|e| {
        AppError::database(e).with_detail(format!(
            "Le champ JSON '{field}' du synopsis est invalide"
        ))
    })
}

/// Nettoie et valide une liste d'étiquettes saisie par l'utilisateur.
///
/// Les éléments sont débarrassés des espaces superflus, les doublons
/// (sans tenir compte de la casse) sont retirés, et les limites de taille
/// sont appliquées. `label` désigne la liste dans les messages d'erreur.
fn clean_tags(list: &[String], label: &str) -> AppResult<Vec<String>> {
    if list.len() > MAX_TAGS {
        return Err(AppError::validation(format!(
            "{label} : {MAX_TAGS} éléments au maximum."
        )));
    }

    let mut cleaned: Vec<String> = Vec::with_capacity(list.len());

    for raw in list {
        let tag = raw.trim();

        if tag.is_empty() {
            return Err(AppError::validation(format!(
                "{label} : un élément est vide."
            )));
        }

        if tag.chars().count() > MAX_TAG_CHARS {
            return Err(AppError::validation(format!(
                "{label} : un élément dépasse {MAX_TAG_CHARS} caractères."
            )));
        }

        let exists = cleaned
            .iter()
            .any(|item| item.to_lowercase() == tag.to_lowercase());

        if !exists {
            cleaned.push(tag.to_string());
        }
    }

    Ok(cleaned)
}

/// Sérialise une liste en JSON pour stockage.
fn serialize_json_list(list: &[String]) -> AppResult<String> {
    serde_json::to_string(list).map_err(|e| {
        AppError::internal(e).with_detail("Échec de la sérialisation JSON du synopsis")
    })
}

/// Récupère le synopsis d'un projet.
///
/// La ligne 'default' est créée par la migration 002 de la base
/// du projet, donc cette requête ne devrait jamais échouer.
pub async fn get_synopsis(pool: &SqlitePool) -> AppResult<Synopsis> {
    let row = sqlx::query_as::<_, SynopsisRow>(
        r#"
        SELECT id, content, genres, subgenres, tone, created_at, updated_at
        FROM synopsis
        WHERE id = 'default'
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|e| {
        AppError::database(e).with_detail("Échec de la récupération du synopsis")
    })?;

    row.into_synopsis()
}

/// Met à jour le synopsis d'un projet.
///
/// Les listes sont nettoyées et validées (voir `clean_tags`), puis
/// sérialisées en JSON avant d'être stockées.
/// La date `updated_at` est rafraîchie automatiquement.
pub async fn update_synopsis(
    pool: &SqlitePool,
    content: &str,
    genres: &[String],
    subgenres: &[String],
    tone: &[String],
) -> AppResult<Synopsis> {
    if content.chars().count() > MAX_CONTENT_CHARS {
        return Err(AppError::validation(format!(
            "Le contenu du synopsis est trop long ({MAX_CONTENT_CHARS} caractères au maximum)."
        )));
    }

    let genres = clean_tags(genres, "Genres")?;
    let subgenres = clean_tags(subgenres, "Sous-genres")?;
    let tone = clean_tags(tone, "Ton")?;

    let now = crate::utils::now_utc();

    let genres_json = serialize_json_list(&genres)?;
    let subgenres_json = serialize_json_list(&subgenres)?;
    let tone_json = serialize_json_list(&tone)?;

    let result = sqlx::query(
        r#"
        UPDATE synopsis
        SET content = ?, genres = ?, subgenres = ?, tone = ?, updated_at = ?
        WHERE id = 'default'
        "#,
    )
    .bind(content)
    .bind(&genres_json)
    .bind(&subgenres_json)
    .bind(&tone_json)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(e).with_detail("Échec de la mise à jour du synopsis")
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found(
            "Le synopsis du projet est introuvable.",
        ));
    }

    get_synopsis(pool).await
}