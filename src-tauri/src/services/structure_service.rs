//! Découpage du récit : parties, chapitres, scènes… selon le projet.
//!
//! Les éléments du découpage sont stockés dans une seule table générique
//! (`structure_nodes`, base du projet). Chaque élément a un **niveau**
//! (0, 1 ou 2) ; le **modèle** de découpage donne un nom à chaque niveau.
//!
//! | Modèle   | Niveau 0 | Niveau 1 | Niveau 2  |
//! |----------|----------|----------|-----------|
//! | novel    | Partie   | Chapitre | Scène     |
//! | manga    | Tome     | Chapitre | Page      |
//! | film     | Acte     | Séquence | Scène     |
//! | series   | Saison   | Épisode  | Scène     |
//! | game     | Acte     | Quête    | Mission   |
//! | rpg      | Scénario | Session  | Rencontre |
//! | generic  | Partie   | Section  | Élément   |
//!
//! Les noms affichés sont traduits par l'interface (`structure.json`).
//! Changer de modèle ne modifie aucune donnée : seuls les noms changent.
//!
//! Règles :
//! - un élément est à la racine, ou sous un élément de niveau inférieur
//!   (un chapitre peut être à la racine si le roman n'a pas de parties) ;
//! - les éléments de même parent sont ordonnés par `position` ;
//! - supprimer un élément supprime tout ce qu'il contient.

use crate::error::{AppError, AppResult};
use crate::models::project::ProjectType;
use crate::utils::{new_id, now_utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Nombre de niveaux de découpage (identique pour tous les modèles).
pub const LEVELS: i64 = 3;

const MAX_TITLE_CHARS: usize = 200;
const MAX_SUMMARY_CHARS: usize = 10_000;

// ----------------------------------------------------------------------------
// Modèles
// ----------------------------------------------------------------------------

/// Modèle de découpage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StructureTemplate {
    Novel,
    Manga,
    Film,
    Series,
    Game,
    Rpg,
    Generic,
}

impl StructureTemplate {
    pub const ALL: [StructureTemplate; 7] = [
        StructureTemplate::Novel,
        StructureTemplate::Manga,
        StructureTemplate::Film,
        StructureTemplate::Series,
        StructureTemplate::Game,
        StructureTemplate::Rpg,
        StructureTemplate::Generic,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            StructureTemplate::Novel => "novel",
            StructureTemplate::Manga => "manga",
            StructureTemplate::Film => "film",
            StructureTemplate::Series => "series",
            StructureTemplate::Game => "game",
            StructureTemplate::Rpg => "rpg",
            StructureTemplate::Generic => "generic",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|template| template.as_str() == value)
    }

    /// Modèle naturel d'un type de projet.
    pub fn for_project_type(project_type: ProjectType) -> Self {
        match project_type {
            ProjectType::Novel => StructureTemplate::Novel,
            ProjectType::Manga => StructureTemplate::Manga,
            ProjectType::Film => StructureTemplate::Film,
            ProjectType::Series => StructureTemplate::Series,
            ProjectType::Game => StructureTemplate::Game,
            ProjectType::Rpg => StructureTemplate::Rpg,
            ProjectType::Custom => StructureTemplate::Generic,
        }
    }
}

// ----------------------------------------------------------------------------
// Types échangés avec l'interface
// ----------------------------------------------------------------------------

/// Élément du découpage.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StructureNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub level: i64,
    pub title: String,
    pub summary: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Découpage complet d'un projet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Structure {
    /// Modèle utilisé.
    pub template: StructureTemplate,
    /// Vrai si le modèle a été choisi par l'utilisateur ; faux s'il suit
    /// le type du projet.
    pub template_chosen: bool,
    /// Tous les éléments, triés par parent puis par position. L'interface
    /// reconstruit l'arbre.
    pub nodes: Vec<StructureNode>,
}

/// Sens d'un déplacement parmi les éléments de même parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MoveDirection {
    Up,
    Down,
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

fn node_not_found() -> AppError {
    AppError::not_found("Élément du découpage introuvable.").with_key("structure.notFound")
}

fn clean_title(title: &str) -> AppResult<String> {
    let title = title.trim();

    if title.is_empty() {
        return Err(AppError::validation("Le titre ne peut pas être vide.")
            .with_key("structure.titleEmpty"));
    }

    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Le titre ne peut pas dépasser {MAX_TITLE_CHARS} caractères."
        ))
        .with_key("structure.titleTooLong")
        .with_param("max", MAX_TITLE_CHARS));
    }

    Ok(title.to_owned())
}

fn clean_summary(summary: &str) -> AppResult<String> {
    let summary = summary.trim();

    if summary.chars().count() > MAX_SUMMARY_CHARS {
        return Err(AppError::validation(format!(
            "Le résumé ne peut pas dépasser {MAX_SUMMARY_CHARS} caractères."
        ))
        .with_key("structure.summaryTooLong")
        .with_param("max", MAX_SUMMARY_CHARS));
    }

    Ok(summary.to_owned())
}

fn check_level(level: i64) -> AppResult<()> {
    if !(0..LEVELS).contains(&level) {
        return Err(AppError::validation("Niveau de découpage invalide.")
            .with_key("structure.invalidLevel"));
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

const NODE_COLUMNS: &str =
    "id, parent_id, level, title, summary, position, created_at, updated_at";

async fn find_node(pool: &SqlitePool, id: &str) -> AppResult<Option<StructureNode>> {
    let sql = format!("SELECT {NODE_COLUMNS} FROM structure_nodes WHERE id = ?");

    Ok(sqlx::query_as::<_, StructureNode>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?)
}

/// Modèle choisi par l'utilisateur (`None` : il suit le type du projet).
async fn chosen_template(pool: &SqlitePool) -> AppResult<Option<StructureTemplate>> {
    let raw: Option<String> =
        sqlx::query_scalar("SELECT template FROM structure_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?
            .flatten();

    // Valeur inconnue (version future ?) : on revient au modèle du type.
    Ok(raw.as_deref().and_then(StructureTemplate::parse))
}

/// Découpage complet du projet.
pub async fn get_structure(pool: &SqlitePool, project_type: ProjectType) -> AppResult<Structure> {
    let chosen = chosen_template(pool).await?;

    let sql = format!(
        "SELECT {NODE_COLUMNS} FROM structure_nodes \
         ORDER BY parent_id IS NOT NULL, parent_id, position, created_at"
    );

    let nodes = sqlx::query_as::<_, StructureNode>(&sql)
        .fetch_all(pool)
        .await?;

    Ok(Structure {
        template: chosen.unwrap_or_else(|| StructureTemplate::for_project_type(project_type)),
        template_chosen: chosen.is_some(),
        nodes,
    })
}

// ----------------------------------------------------------------------------
// Modèle
// ----------------------------------------------------------------------------

/// Choisit le modèle de découpage. `None` : le modèle suit le type du projet.
pub async fn set_template(pool: &SqlitePool, template: Option<&str>) -> AppResult<()> {
    let template = match template {
        Some(value) => Some(
            StructureTemplate::parse(value).ok_or_else(|| {
                AppError::validation("Modèle de découpage inconnu.")
                    .with_key("structure.invalidTemplate")
            })?,
        ),
        None => None,
    };

    sqlx::query(
        "INSERT INTO structure_settings (id, template, updated_at) VALUES ('default', ?, ?) \
         ON CONFLICT (id) DO UPDATE SET template = excluded.template, updated_at = excluded.updated_at",
    )
    .bind(template.map(StructureTemplate::as_str))
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Éléments
// ----------------------------------------------------------------------------

/// Ajoute un élément à la fin de son parent (ou de la racine).
pub async fn create_node(
    pool: &SqlitePool,
    parent_id: Option<&str>,
    level: i64,
    title: &str,
) -> AppResult<StructureNode> {
    check_level(level)?;
    let title = clean_title(title)?;

    if let Some(parent_id) = parent_id {
        let parent = find_node(pool, parent_id).await?.ok_or_else(node_not_found)?;

        if parent.level >= level {
            return Err(AppError::validation(
                "Un élément ne peut contenir que des éléments de niveau inférieur.",
            )
            .with_key("structure.invalidParent"));
        }
    }

    let id = new_id();
    let now = now_utc();

    // Position calculée dans la même instruction que l'insertion.
    sqlx::query(
        r#"
        INSERT INTO structure_nodes
            (id, parent_id, level, title, summary, position, created_at, updated_at)
        SELECT ?, ?, ?, ?, '',
               COALESCE(MAX(position), -1) + 1, ?, ?
        FROM structure_nodes
        WHERE parent_id IS ?
        "#,
    )
    .bind(&id)
    .bind(parent_id)
    .bind(level)
    .bind(&title)
    .bind(&now)
    .bind(&now)
    .bind(parent_id)
    .execute(pool)
    .await?;

    find_node(pool, &id)
        .await?
        .ok_or_else(|| AppError::internal("Élément introuvable après création"))
}

/// Modifie le titre et/ou le résumé d'un élément.
pub async fn update_node(
    pool: &SqlitePool,
    id: &str,
    title: Option<&str>,
    summary: Option<&str>,
) -> AppResult<StructureNode> {
    let current = find_node(pool, id).await?.ok_or_else(node_not_found)?;

    let title = match title {
        Some(value) => clean_title(value)?,
        None => current.title,
    };
    let summary = match summary {
        Some(value) => clean_summary(value)?,
        None => current.summary,
    };

    sqlx::query("UPDATE structure_nodes SET title = ?, summary = ?, updated_at = ? WHERE id = ?")
        .bind(&title)
        .bind(&summary)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;

    find_node(pool, id).await?.ok_or_else(node_not_found)
}

/// Échange un élément avec son voisin (même parent) au-dessus ou en dessous.
///
/// Sans voisin dans ce sens (déjà premier ou dernier), rien ne change.
pub async fn move_node(
    pool: &SqlitePool,
    id: &str,
    direction: MoveDirection,
) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let sql = format!("SELECT {NODE_COLUMNS} FROM structure_nodes WHERE id = ?");
    let node = sqlx::query_as::<_, StructureNode>(&sql)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(node_not_found)?;

    let neighbor_sql = match direction {
        MoveDirection::Up => {
            "SELECT id, position FROM structure_nodes \
             WHERE parent_id IS ? AND position < ? ORDER BY position DESC LIMIT 1"
        }
        MoveDirection::Down => {
            "SELECT id, position FROM structure_nodes \
             WHERE parent_id IS ? AND position > ? ORDER BY position ASC LIMIT 1"
        }
    };

    let neighbor: Option<(String, i64)> = sqlx::query_as(neighbor_sql)
        .bind(node.parent_id.as_deref())
        .bind(node.position)
        .fetch_optional(&mut *tx)
        .await?;

    let Some((neighbor_id, neighbor_position)) = neighbor else {
        return Ok(());
    };

    let now = now_utc();

    for (target, position) in [(&node.id, neighbor_position), (&neighbor_id, node.position)] {
        sqlx::query("UPDATE structure_nodes SET position = ?, updated_at = ? WHERE id = ?")
            .bind(position)
            .bind(&now)
            .bind(target)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(())
}

/// Supprime un élément et tout ce qu'il contient.
pub async fn delete_node(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM structure_nodes WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(node_not_found());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
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

    fn titles(structure: &Structure, parent: Option<&str>) -> Vec<String> {
        structure
            .nodes
            .iter()
            .filter(|node| node.parent_id.as_deref() == parent)
            .map(|node| node.title.clone())
            .collect()
    }

    #[tokio::test]
    async fn old_chapter_and_scene_tables_are_gone() {
        let pool = pool().await;

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
                .fetch_all(&pool)
                .await
                .unwrap();

        assert!(tables.contains(&"structure_nodes".to_owned()));
        assert!(!tables.contains(&"chapters".to_owned()));
        assert!(!tables.contains(&"scenes".to_owned()));
    }

    #[tokio::test]
    async fn template_follows_project_type_until_chosen() {
        let pool = pool().await;

        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        assert_eq!(s.template, StructureTemplate::Manga);
        assert!(!s.template_chosen);

        set_template(&pool, Some("film")).await.unwrap();
        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        assert_eq!(s.template, StructureTemplate::Film);
        assert!(s.template_chosen);

        set_template(&pool, None).await.unwrap();
        let s = get_structure(&pool, ProjectType::Rpg).await.unwrap();
        assert_eq!(s.template, StructureTemplate::Rpg);

        assert!(set_template(&pool, Some("inconnu")).await.is_err());
        assert_eq!(
            StructureTemplate::for_project_type(ProjectType::Custom),
            StructureTemplate::Generic
        );
    }

    #[tokio::test]
    async fn nodes_are_created_in_order_under_their_parent() {
        let pool = pool().await;

        let part = create_node(&pool, None, 0, "Première partie").await.unwrap();
        let c1 = create_node(&pool, Some(&part.id), 1, "Chapitre 1").await.unwrap();
        let c2 = create_node(&pool, Some(&part.id), 1, "  Chapitre 2  ").await.unwrap();
        create_node(&pool, Some(&c1.id), 2, "Scène 1").await.unwrap();
        // Une scène directement sous la partie (niveau sauté) est permise.
        create_node(&pool, Some(&part.id), 2, "Interlude").await.unwrap();
        // Un chapitre à la racine (roman sans parties) aussi.
        create_node(&pool, None, 1, "Épilogue").await.unwrap();

        assert_eq!((c1.position, c2.position), (0, 1));
        assert_eq!(c2.title, "Chapitre 2");

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(titles(&s, None), ["Première partie", "Épilogue"]);
        assert_eq!(titles(&s, Some(&part.id)), ["Chapitre 1", "Chapitre 2", "Interlude"]);
        assert_eq!(titles(&s, Some(&c1.id)), ["Scène 1"]);
    }

    #[tokio::test]
    async fn invalid_nodes_are_rejected() {
        let pool = pool().await;
        let chapter = create_node(&pool, None, 1, "Chapitre").await.unwrap();

        // Une partie ne peut pas être dans un chapitre, ni un chapitre dans un chapitre.
        assert!(create_node(&pool, Some(&chapter.id), 0, "Partie").await.is_err());
        assert!(create_node(&pool, Some(&chapter.id), 1, "Chapitre").await.is_err());
        assert!(create_node(&pool, None, 3, "Trop profond").await.is_err());
        assert!(create_node(&pool, None, -1, "Négatif").await.is_err());
        assert!(create_node(&pool, None, 0, "   ").await.is_err());
        assert!(create_node(&pool, None, 0, &"x".repeat(201)).await.is_err());
        assert!(create_node(&pool, Some("inconnu"), 2, "Scène").await.is_err());
    }

    #[tokio::test]
    async fn update_changes_only_given_fields() {
        let pool = pool().await;
        let node = create_node(&pool, None, 0, "Titre").await.unwrap();

        let node = update_node(&pool, &node.id, None, Some("  Le héros part.  "))
            .await
            .unwrap();
        assert_eq!((node.title.as_str(), node.summary.as_str()), ("Titre", "Le héros part."));

        let node = update_node(&pool, &node.id, Some("Nouveau titre"), None)
            .await
            .unwrap();
        assert_eq!(node.summary, "Le héros part.");
        assert_eq!(node.title, "Nouveau titre");

        assert!(update_node(&pool, &node.id, Some(""), None).await.is_err());
        assert!(update_node(&pool, "inconnu", Some("x"), None).await.is_err());
    }

    #[tokio::test]
    async fn nodes_move_among_their_siblings_only() {
        let pool = pool().await;
        let a = create_node(&pool, None, 1, "A").await.unwrap();
        let b = create_node(&pool, None, 1, "B").await.unwrap();
        let c = create_node(&pool, None, 1, "C").await.unwrap();
        let inner = create_node(&pool, Some(&a.id), 2, "dans A").await.unwrap();

        move_node(&pool, &c.id, MoveDirection::Up).await.unwrap();
        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(titles(&s, None), ["A", "C", "B"]);

        move_node(&pool, &a.id, MoveDirection::Up).await.unwrap(); // déjà premier
        move_node(&pool, &a.id, MoveDirection::Down).await.unwrap();
        move_node(&pool, &b.id, MoveDirection::Down).await.unwrap(); // déjà dernier
        move_node(&pool, &inner.id, MoveDirection::Down).await.unwrap(); // seul enfant

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(titles(&s, None), ["C", "A", "B"]);
        assert_eq!(titles(&s, Some(&a.id)), ["dans A"]);
    }

    #[tokio::test]
    async fn deleting_a_node_deletes_its_content() {
        let pool = pool().await;
        let part = create_node(&pool, None, 0, "Partie").await.unwrap();
        let chapter = create_node(&pool, Some(&part.id), 1, "Chapitre").await.unwrap();
        create_node(&pool, Some(&chapter.id), 2, "Scène").await.unwrap();
        create_node(&pool, None, 0, "Autre partie").await.unwrap();

        delete_node(&pool, &part.id).await.unwrap();

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(s.nodes.len(), 1);
        assert_eq!(s.nodes[0].title, "Autre partie");
        assert!(delete_node(&pool, &part.id).await.is_err());
    }
}
