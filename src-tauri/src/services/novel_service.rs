//! Outils du romancier (migration `023_novel.sql`).
//!
//! - texte d'un élément du découpage (une scène, en pratique) et son nombre
//!   de mots, recalculé ici à chaque enregistrement ;
//! - objectif de mots, état de rédaction et paramètres de narration d'un
//!   élément ; objectif de mots du manuscrit ;
//! - dossier de présentation éditoriale (pitch, résumé court, résumé long).
//!
//! Le manuscrit continu n'est jamais stocké : l'interface assemble les
//! textes des éléments dans l'ordre du plan (`manuscript_contents`). Le
//! point de vue d'une scène est le personnage lié avec le rôle « pov »
//! (`structure_link_service`).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::services::structure_service::{find_node, StructureNode};
use crate::utils::now_utc;

/// Taille maximale du texte d'un élément (HTML de l'éditeur), en caractères.
const MAX_CONTENT_CHARS: usize = 2_000_000;
/// Objectif de mots maximal (élément ou manuscrit).
const MAX_GOAL: i64 = 10_000_000;
/// Longueurs maximales du dossier éditorial.
const MAX_PITCH_CHARS: usize = 1_000;
const MAX_SUMMARY_CHARS: usize = 200_000;

pub const WRITING_STATUSES: [&str; 5] = ["todo", "draft", "revision", "proofread", "corrected"];
pub const NARRATIVE_PERSONS: [&str; 3] = ["first", "second", "third"];
pub const NARRATIVE_TENSES: [&str; 3] = ["present", "past", "future"];

fn node_not_found() -> AppError {
    AppError::not_found("Élément du découpage introuvable.").with_key("structure.notFound")
}

// ----------------------------------------------------------------------------
// Compte des mots
// ----------------------------------------------------------------------------

/// Balises qui séparent deux mots (fin de paragraphe, saut de ligne…).
const BLOCK_TAGS: [&str; 17] = [
    "p", "br", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "td", "th", "tr", "hr",
];

/// Texte brut d'un HTML de l'éditeur : balises retirées (celles de bloc
/// laissent une espace), entités courantes décodées.
pub fn plain_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut chars = html.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '<' {
            let mut tag = String::new();
            for t in chars.by_ref() {
                if t == '>' {
                    break;
                }
                tag.push(t);
            }
            let name: String = tag
                .trim_start_matches('/')
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase();
            if BLOCK_TAGS.contains(&name.as_str()) {
                out.push(' ');
            }
        } else {
            out.push(c);
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// Nombre de mots d'un texte brut : suites de caractères sans espace qui
/// contiennent au moins une lettre ou un chiffre (« l'homme », « peut-être »
/// et « 1984 » comptent pour un mot ; un tiret seul ou « … » ne compte pas).
pub fn count_words_plain(text: &str) -> i64 {
    text.split_whitespace()
        .filter(|token| token.chars().any(|c| c.is_alphanumeric()))
        .count() as i64
}

/// Nombre de mots d'un HTML de l'éditeur.
pub fn count_words(html: &str) -> i64 {
    count_words_plain(&plain_text(html))
}

// ----------------------------------------------------------------------------
// Texte d'un élément
// ----------------------------------------------------------------------------

/// Texte d'un élément (HTML de l'éditeur ; vide s'il n'a pas de texte).
pub async fn get_content(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let content: Option<String> = sqlx::query_scalar("SELECT content FROM structure_nodes WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    content.ok_or_else(node_not_found)
}

/// Enregistre le texte d'un élément et recalcule son nombre de mots.
pub async fn set_content(pool: &SqlitePool, id: &str, content: &str) -> AppResult<StructureNode> {
    if content.chars().count() > MAX_CONTENT_CHARS {
        return Err(AppError::validation("Le texte de cet élément est trop long.")
            .with_key("novel.contentTooLong")
            .with_param("max", MAX_CONTENT_CHARS));
    }
    // Un éditeur vide renvoie « <p></p> » : on enregistre alors un texte vide.
    let content = if plain_text(content).trim().is_empty() { "" } else { content };
    let result = sqlx::query("UPDATE structure_nodes SET content = ?, content_words = ?, updated_at = ? WHERE id = ?")
        .bind(content)
        .bind(count_words(content))
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }
    find_node(pool, id).await?.ok_or_else(node_not_found)
}

/// Texte d'un élément, pour l'assemblage du manuscrit.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NodeContent {
    pub id: String,
    pub content: String,
}

/// Textes de tous les éléments qui en ont un. L'ordre du plan est rétabli
/// par l'interface (qui connaît l'arbre et les niveaux).
pub async fn manuscript_contents(pool: &SqlitePool) -> AppResult<Vec<NodeContent>> {
    Ok(sqlx::query_as::<_, NodeContent>("SELECT id, content FROM structure_nodes WHERE content <> ''")
        .fetch_all(pool)
        .await?)
}

// ----------------------------------------------------------------------------
// Objectif, état de rédaction, narration
// ----------------------------------------------------------------------------

/// Réglages du romancier pour un élément. Tous sont envoyés à chaque fois ;
/// `None` (ou une chaîne vide) efface la valeur.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelFields {
    pub word_goal: Option<i64>,
    pub writing_status: Option<String>,
    pub narrative_person: Option<String>,
    pub narrative_tense: Option<String>,
}

fn goal(value: Option<i64>) -> AppResult<Option<i64>> {
    match value {
        None | Some(0) => Ok(None),
        Some(n) if (1..=MAX_GOAL).contains(&n) => Ok(Some(n)),
        Some(_) => Err(AppError::validation("Objectif de mots invalide.")
            .with_key("novel.invalidGoal")
            .with_param("max", MAX_GOAL)),
    }
}

fn choice(value: Option<String>, allowed: &[&str], key: &'static str) -> AppResult<Option<String>> {
    match value.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(v) if allowed.contains(&v) => Ok(Some(v.to_owned())),
        Some(_) => Err(AppError::validation("Valeur invalide.").with_key(key)),
    }
}

pub async fn set_fields(pool: &SqlitePool, id: &str, fields: NovelFields) -> AppResult<StructureNode> {
    let word_goal = goal(fields.word_goal)?;
    let status = choice(fields.writing_status, &WRITING_STATUSES, "novel.invalidStatus")?;
    // « À écrire » est l'état par défaut : rien à enregistrer.
    let status = status.filter(|s| s != "todo");
    let person = choice(fields.narrative_person, &NARRATIVE_PERSONS, "novel.invalidPerson")?;
    let tense = choice(fields.narrative_tense, &NARRATIVE_TENSES, "novel.invalidTense")?;

    let result = sqlx::query(
        "UPDATE structure_nodes SET word_goal = ?, writing_status = ?, narrative_person = ?, narrative_tense = ?, \
         updated_at = ? WHERE id = ?",
    )
    .bind(word_goal)
    .bind(status)
    .bind(person)
    .bind(tense)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }
    find_node(pool, id).await?.ok_or_else(node_not_found)
}

/// Objectif de mots du manuscrit entier.
pub async fn manuscript_goal(pool: &SqlitePool) -> AppResult<Option<i64>> {
    let value: Option<Option<i64>> =
        sqlx::query_scalar("SELECT manuscript_goal FROM structure_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?;
    Ok(value.flatten())
}

pub async fn set_manuscript_goal(pool: &SqlitePool, value: Option<i64>) -> AppResult<Option<i64>> {
    let value = goal(value)?;
    sqlx::query("UPDATE structure_settings SET manuscript_goal = ?, updated_at = ? WHERE id = 'default'")
        .bind(value)
        .bind(now_utc())
        .execute(pool)
        .await?;
    Ok(value)
}

// ----------------------------------------------------------------------------
// Dossier éditorial
// ----------------------------------------------------------------------------

/// Dossier de présentation éditoriale : textes libres de l'auteur,
/// indépendants du synopsis (qui peut servir de point de départ).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Editorial {
    pub pitch: String,
    pub summary_short: String,
    /// Texte libre (une ligne vide sépare deux paragraphes), comme les deux autres.
    pub summary_long: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorialUpdate {
    pub pitch: Option<String>,
    pub summary_short: Option<String>,
    pub summary_long: Option<String>,
}

pub async fn get_editorial(pool: &SqlitePool) -> AppResult<Editorial> {
    let row = sqlx::query_as::<_, Editorial>(
        "SELECT pitch, summary_short, summary_long, updated_at FROM editorial WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await?;
    match row {
        Some(row) => Ok(row),
        None => {
            // Ligne absente (base réparée à la main…) : on la recrée.
            let now = now_utc();
            sqlx::query("INSERT OR IGNORE INTO editorial (id, created_at, updated_at) VALUES ('default', ?, ?)")
                .bind(&now)
                .bind(&now)
                .execute(pool)
                .await?;
            Ok(Editorial { pitch: String::new(), summary_short: String::new(), summary_long: String::new(), updated_at: now })
        }
    }
}

fn limited(value: Option<String>, max: usize, key: &'static str) -> AppResult<Option<String>> {
    match value {
        Some(v) if v.chars().count() > max => {
            Err(AppError::validation("Ce texte est trop long.").with_key(key).with_param("max", max))
        }
        other => Ok(other),
    }
}

pub async fn update_editorial(pool: &SqlitePool, update: EditorialUpdate) -> AppResult<Editorial> {
    let current = get_editorial(pool).await?;
    let pitch = limited(update.pitch, MAX_PITCH_CHARS, "novel.pitchTooLong")?.unwrap_or(current.pitch);
    let short = limited(update.summary_short, MAX_SUMMARY_CHARS, "novel.summaryTooLong")?.unwrap_or(current.summary_short);
    let long = limited(update.summary_long, MAX_SUMMARY_CHARS, "novel.summaryTooLong")?.unwrap_or(current.summary_long);
    sqlx::query("UPDATE editorial SET pitch = ?, summary_short = ?, summary_long = ?, updated_at = ? WHERE id = 'default'")
        .bind(&pitch)
        .bind(&short)
        .bind(&long)
        .bind(now_utc())
        .execute(pool)
        .await?;
    get_editorial(pool).await
}

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

    async fn scene(pool: &SqlitePool) -> String {
        sqlx::query(
            "INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) \
             VALUES ('s1', NULL, 0, 'Scène', '', 0, 'x', 'x')",
        )
        .execute(pool)
        .await
        .unwrap();
        "s1".to_owned()
    }

    #[test]
    fn counts_words_like_a_word_processor() {
        assert_eq!(count_words("<p>Léa entra dans la gare.</p><p>Elle aperçut l'homme.</p>"), 8);
        assert_eq!(count_words("<p>Peut-être… — non&nbsp;!</p>"), 2);
        assert_eq!(count_words("<p>un</p><p>deux</p>"), 2);
        assert_eq!(count_words("<p><strong>mot</strong>s collés</p>"), 2);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("<p></p>"), 0);
    }

    #[tokio::test]
    async fn saves_text_and_word_count() {
        let pool = pool().await;
        let id = scene(&pool).await;
        let node = set_content(&pool, &id, "<p>Léa entra dans la gare.</p>").await.unwrap();
        assert_eq!(node.content_words, 5);
        assert_eq!(get_content(&pool, &id).await.unwrap(), "<p>Léa entra dans la gare.</p>");
        assert_eq!(manuscript_contents(&pool).await.unwrap().len(), 1);

        // Éditeur vidé : plus de texte, plus de mots.
        let node = set_content(&pool, &id, "<p></p>").await.unwrap();
        assert_eq!(node.content_words, 0);
        assert!(manuscript_contents(&pool).await.unwrap().is_empty());
        assert!(set_content(&pool, "inconnu", "<p>x</p>").await.is_err());
    }

    #[tokio::test]
    async fn saves_goal_status_and_narration() {
        let pool = pool().await;
        let id = scene(&pool).await;
        let node = set_fields(
            &pool,
            &id,
            NovelFields {
                word_goal: Some(3000),
                writing_status: Some("revision".into()),
                narrative_person: Some("first".into()),
                narrative_tense: Some("past".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(node.word_goal, Some(3000));
        assert_eq!(node.writing_status.as_deref(), Some("revision"));
        assert_eq!(node.narrative_person.as_deref(), Some("first"));
        assert_eq!(node.narrative_tense.as_deref(), Some("past"));

        // Effacer : objectif 0, « à écrire », valeurs vides.
        let node = set_fields(&pool, &id, NovelFields { word_goal: Some(0), writing_status: Some("todo".into()), ..Default::default() })
            .await
            .unwrap();
        assert_eq!(node.word_goal, None);
        assert_eq!(node.writing_status, None);
        assert_eq!(node.narrative_person, None);

        assert!(set_fields(&pool, &id, NovelFields { writing_status: Some("fini".into()), ..Default::default() }).await.is_err());
        assert!(set_fields(&pool, &id, NovelFields { word_goal: Some(-5), ..Default::default() }).await.is_err());
    }

    #[tokio::test]
    async fn manuscript_goal_and_editorial() {
        let pool = pool().await;
        assert_eq!(manuscript_goal(&pool).await.unwrap(), None);
        assert_eq!(set_manuscript_goal(&pool, Some(80_000)).await.unwrap(), Some(80_000));
        assert_eq!(manuscript_goal(&pool).await.unwrap(), Some(80_000));
        assert_eq!(set_manuscript_goal(&pool, None).await.unwrap(), None);

        let empty = get_editorial(&pool).await.unwrap();
        assert!(empty.pitch.is_empty());
        let saved = update_editorial(&pool, EditorialUpdate { pitch: Some("Une archiviste…".into()), ..Default::default() })
            .await
            .unwrap();
        assert_eq!(saved.pitch, "Une archiviste…");
        assert!(saved.summary_short.is_empty());
        assert!(update_editorial(&pool, EditorialUpdate { pitch: Some("x".repeat(1001)), ..Default::default() }).await.is_err());
    }
}
