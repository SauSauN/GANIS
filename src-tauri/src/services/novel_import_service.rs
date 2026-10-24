//! Import d'un manuscrit existant (roman).
//!
//! L'interface lit le fichier (Word, Markdown ou texte), propose un
//! découpage (parties, chapitres, scènes) que l'auteur ajuste, puis envoie
//! ici le plan validé. Les éléments sont ajoutés à la fin du découpage, avec
//! leur texte. Le texte importé ne compte pas dans les mots écrits du jour.
//! En cas d'erreur, rien de l'import n'est gardé.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::models::project::ProjectType;
use crate::services::history_service as history;
use crate::services::novel_service;
use crate::services::structure_service;

/// Nombre maximal d'éléments créés par un import.
const MAX_NODES: usize = 5_000;
/// Titre maximal (comme dans le découpage).
const MAX_TITLE_CHARS: usize = 200;

/// Élément du plan d'import.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNode {
    pub level: i64,
    #[serde(default)]
    pub title: String,
    /// Faux : hors numérotation (prologue, épilogue…).
    #[serde(default = "yes")]
    pub numbered: bool,
    /// Texte de l'élément (HTML), souvent vide pour une partie ou un chapitre.
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub children: Vec<ImportNode>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// Éléments créés au premier niveau du plan (pour annuler l'import).
    pub roots: Vec<String>,
    pub nodes: usize,
    pub words: i64,
}

fn count(nodes: &[ImportNode]) -> usize {
    nodes.iter().map(|n| 1 + count(&n.children)).sum()
}

pub async fn import(pool: &SqlitePool, project_type: ProjectType, plan: &[ImportNode]) -> AppResult<ImportResult> {
    let total = count(plan);
    if total == 0 {
        return Err(AppError::validation("Rien à importer.").with_key("novel.importEmpty"));
    }
    if total > MAX_NODES {
        return Err(AppError::validation("Ce manuscrit a trop d'éléments pour être importé d'un coup.")
            .with_key("novel.importTooLarge")
            .with_param("max", MAX_NODES));
    }

    let mut created: Vec<String> = Vec::new();
    let mut result = ImportResult { roots: Vec::new(), nodes: 0, words: 0 };
    let outcome = create_all(pool, project_type, plan, &mut created, &mut result).await;
    if let Err(error) = outcome {
        // Rien de l'import n'est gardé (les enfants d'abord).
        for id in created.iter().rev() {
            let _ = sqlx::query("DELETE FROM structure_nodes WHERE id = ?").bind(id).execute(pool).await;
        }
        return Err(error);
    }
    Ok(result)
}

async fn create_all(
    pool: &SqlitePool,
    project_type: ProjectType,
    plan: &[ImportNode],
    created: &mut Vec<String>,
    result: &mut ImportResult,
) -> AppResult<()> {
    // Parcours dans l'ordre du texte : chaque élément est ajouté à la fin
    // de son parent, ses enfants juste après lui.
    let mut stack: Vec<(&ImportNode, Option<String>)> = plan.iter().rev().map(|n| (n, None)).collect();
    while let Some((node, parent)) = stack.pop() {
        let title: String = node.title.trim().chars().take(MAX_TITLE_CHARS).collect();
        let saved = structure_service::create_node(pool, project_type, parent.as_deref(), node.level, &title, None).await?;
        created.push(saved.id.clone());
        if parent.is_none() {
            result.roots.push(saved.id.clone());
        }
        if !node.numbered {
            structure_service::update_node(pool, &saved.id, None, None, Some(false), None).await?;
        }
        if !node.content.trim().is_empty() {
            let written = novel_service::write_content(pool, &saved.id, &node.content, false).await?;
            result.words += written.content_words;
        }
        history::record(pool, "created", "structureNode", &saved.id, &title, "").await;
        result.nodes += 1;
        for child in node.children.iter().rev() {
            stack.push((child, Some(saved.id.clone())));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};

    fn n(level: i64, title: &str, content: &str, children: Vec<ImportNode>) -> ImportNode {
        ImportNode { level, title: title.into(), numbered: true, content: content.into(), children }
    }

    #[tokio::test]
    async fn creates_the_plan_in_order_without_counting_today() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        let mut prologue = n(1, "Prologue", "", vec![n(2, "", "<p>Il pleuvait.</p>", vec![])]);
        prologue.numbered = false;
        let plan = vec![
            prologue,
            n(0, "Les registres", "", vec![
                n(1, "La lettre", "", vec![n(2, "", "<p>Un deux trois.</p>", vec![]), n(2, "", "<p>Quatre cinq.</p>", vec![])]),
                n(1, "Le bureau", "", vec![n(2, "", "<p>Six.</p>", vec![])]),
            ]),
        ];
        let done = import(&pool, ProjectType::Novel, &plan).await.unwrap();
        assert_eq!((done.nodes, done.words, done.roots.len()), (8, 8, 2));

        let s = structure_service::get_structure(&pool, ProjectType::Novel).await.unwrap();
        let chapters: Vec<_> = s.nodes.iter().filter(|x| x.level == 1).map(|x| (x.title.as_str(), x.numbered)).collect();
        assert!(chapters.contains(&("Prologue", false)));
        let lettre = s.nodes.iter().find(|x| x.title == "La lettre").unwrap();
        let mut scenes: Vec<_> = s.nodes.iter().filter(|x| x.parent_id.as_deref() == Some(lettre.id.as_str())).collect();
        scenes.sort_by_key(|x| x.position);
        assert_eq!(novel_service::get_content(&pool, &scenes[0].id).await.unwrap(), "<p>Un deux trois.</p>");
        assert_eq!(novel_service::writing_stats(&pool).await.unwrap().words_today, 0);
    }

    #[tokio::test]
    async fn nothing_is_kept_when_the_plan_is_invalid() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        // Une scène ne peut pas contenir un chapitre.
        let plan = vec![n(1, "A", "", vec![]), n(2, "", "<p>x</p>", vec![n(1, "B", "", vec![])])];
        assert!(import(&pool, ProjectType::Novel, &plan).await.is_err());
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM structure_nodes").fetch_one(&pool).await.unwrap();
        assert_eq!(left, 0);
        assert!(import(&pool, ProjectType::Novel, &[]).await.is_err());
    }
}
