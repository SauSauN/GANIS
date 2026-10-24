//! Découpage du récit : parties, chapitres, scènes… selon le projet.
//!
//! Les éléments du découpage sont stockés dans une seule table générique
//! (`structure_nodes`, base du projet). Chaque élément a un **niveau**
//! (0 = le plus large). Les **niveaux** ont un nom et une numérotation :
//! ceux du **modèle** de découpage (trois niveaux), ou ceux choisis par
//! l'utilisateur (de 1 à 5, colonne `structure_settings.levels`).
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
//! Chaque niveau a une couleur (paramètres du projet) : tous ses éléments la
//! prennent.
//!
//! Les noms des niveaux du modèle sont traduits par l'interface
//! (`structure.json`) ; les noms choisis par l'utilisateur sont enregistrés
//! tels quels.
//!
//! # Numérotation
//! Le numéro d'un élément (« Chapitre 3 ») n'est pas enregistré : l'interface
//! le calcule d'après l'ordre du plan, il suit donc les déplacements et les
//! suppressions. Chaque niveau choisit :
//! - `continuous` : numéros continus dans tout le projet (chapitres 1 à 40,
//!   d'une partie à l'autre) ;
//! - `perParent` : la numérotation repart dans chaque élément parent
//!   (scènes 1, 2, 3 dans chaque chapitre) ;
//! - `none` : pas de numéro.
//!
//! avec un premier numéro (`start`, souvent 1) et un nombre minimal de
//! chiffres (`digits` : 2 → « 01 »). Un élément peut être exclu de la
//! numérotation (`numbered = 0` : prologue, interlude…) ; il ne consomme
//! alors aucun numéro. Le titre est facultatif.
//!
//! Deux modes (réglage du projet, `auto_numbering`) :
//! - **non automatique** (par défaut) : chaque élément reçoit un numéro à
//!   sa création (le suivant de ceux qui le précèdent) et le garde ;
//!   l'utilisateur peut le changer, et « Renuméroter » remet tous les
//!   numéros dans l'ordre (`renumber`) ;
//! - **automatique** : les numéros suivent l'ordre du plan, calculés à
//!   chaque affichage (`compute_numbers`, même règle que l'interface).
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
use std::collections::HashMap;

/// Nombre de niveaux des modèles de découpage.
pub const TEMPLATE_LEVELS: usize = 3;

/// Nombre maximal de niveaux choisis par l'utilisateur.
pub const MAX_LEVELS: usize = 5;

const MAX_TITLE_CHARS: usize = 200;
const MAX_SUMMARY_CHARS: usize = 10_000;
const MAX_LEVEL_NAME_CHARS: usize = 40;
const MAX_START: i64 = 9_999;
const MAX_DIGITS: i64 = 4;
const MAX_NUMBER: i64 = 999_999;

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

    /// Numérotation par défaut des trois niveaux du modèle.
    fn default_numbering(self) -> [Numbering; TEMPLATE_LEVELS] {
        use Numbering::{Continuous, PerParent};

        match self {
            // Chapitres continus d'une partie à l'autre, scènes par chapitre.
            StructureTemplate::Novel => [Continuous, Continuous, PerParent],
            // Chapitres continus d'un tome à l'autre, pages par chapitre.
            StructureTemplate::Manga => [Continuous, Continuous, PerParent],
            // Scènes numérotées sur tout le scénario, comme au tournage.
            StructureTemplate::Film => [Continuous, Continuous, Continuous],
            // Épisodes par saison, scènes par épisode.
            StructureTemplate::Series => [Continuous, PerParent, PerParent],
            StructureTemplate::Game => [Continuous, PerParent, PerParent],
            // Sessions continues sur la campagne, rencontres par session.
            StructureTemplate::Rpg => [Continuous, Continuous, PerParent],
            StructureTemplate::Generic => [Continuous, PerParent, PerParent],
        }
    }

    /// Les trois niveaux du modèle (noms traduits par l'interface).
    pub fn default_levels(self) -> Vec<StructureLevel> {
        self.default_numbering()
            .into_iter()
            .enumerate()
            .map(|(index, numbering)| StructureLevel {
                id: index.to_string(),
                one: None,
                other: None,
                numbering,
                start: 1,
                digits: 1,
                color: None,
            })
            .collect()
    }
}

// ----------------------------------------------------------------------------
// Niveaux
// ----------------------------------------------------------------------------

/// Numérotation des éléments d'un niveau.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Numbering {
    /// Continue dans tout le projet.
    Continuous,
    /// Repart dans chaque élément parent.
    PerParent,
    /// Pas de numéro.
    None,
}

/// Niveau du découpage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureLevel {
    /// Identifiant stable (suit le niveau quand on en insère ou retire un).
    pub id: String,
    /// Nom au singulier ; `None` : nom du modèle, traduit par l'interface.
    pub one: Option<String>,
    /// Nom au pluriel ; `None` : nom du modèle.
    pub other: Option<String>,
    pub numbering: Numbering,
    /// Premier numéro.
    pub start: i64,
    /// Nombre minimal de chiffres (2 → « 01 »).
    pub digits: i64,
    /// Couleur « #rrggbb » ; `None` : couleur par défaut du niveau (selon sa
    /// place), choisie par l'interface.
    #[serde(default)]
    pub color: Option<String>,
}

/// Niveau envoyé par l'interface. `id` : niveau existant gardé (absent pour
/// un nouveau niveau).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelInput {
    pub id: Option<String>,
    pub one: String,
    #[serde(default)]
    pub other: String,
    pub numbering: Numbering,
    pub start: i64,
    pub digits: i64,
    /// Couleur « #rrggbb » (absente : couleur par défaut).
    #[serde(default)]
    pub color: Option<String>,
}

/// Couleur valide : « #rrggbb » (mise en minuscules).
pub fn clean_color(color: &str) -> AppResult<String> {
    let color = color.trim();
    let valid = color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|b| b.is_ascii_hexdigit());

    if !valid {
        return Err(AppError::validation("Couleur invalide.").with_key("structure.invalidColor"));
    }

    Ok(color.to_ascii_lowercase())
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
    /// Titre facultatif (le nom du niveau et le numéro s'affichent devant).
    pub title: String,
    pub summary: String,
    pub position: i64,
    /// Faux : élément hors numérotation (prologue, interlude…).
    pub numbered: bool,
    /// Numéro enregistré (mode non automatique). Ignoré en mode automatique.
    pub number: Option<i64>,
    /// Nombre de mots du texte de l'élément (voir `novel_service`) ; le
    /// texte lui-même n'est chargé qu'à la demande.
    pub content_words: i64,
    /// Objectif de mots (roman) ; `None` : aucun.
    pub word_goal: Option<i64>,
    /// État de rédaction (roman) : todo, draft, revision, proofread,
    /// corrected ; `None` : à écrire.
    pub writing_status: Option<String>,
    /// Personne grammaticale de la narration (roman) : first, second, third.
    pub narrative_person: Option<String>,
    /// Temps verbal de la narration (roman) : present, past, future.
    pub narrative_tense: Option<String>,
    /// Objectif narratif d'un chapitre (manga).
    pub narrative_goal: String,
    /// Nombre de pages visé pour un chapitre (manga) ; `None` : aucun.
    pub page_goal: Option<i64>,
    /// Statut du scénario d'un chapitre (manga) : todo, progress, review,
    /// final ; `None` : à préparer.
    pub script_status: Option<String>,
    /// Fonction narrative d'une page (manga) : action, reveal, pause,
    /// transition, suspense.
    pub rhythm: Option<String>,
    /// Vrai : la révélation de cette page doit tomber après le tourné de
    /// page (manga).
    pub page_turn: bool,
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
    /// Niveaux, du plus large au plus fin.
    pub levels: Vec<StructureLevel>,
    /// Vrai si les niveaux ont été personnalisés (sinon : ceux du modèle).
    pub levels_custom: bool,
    /// Vrai : les numéros suivent l'ordre du plan. Faux (par défaut) :
    /// chaque élément garde son numéro (`StructureNode::number`).
    pub auto_numbering: bool,
    /// Objectif de mots du manuscrit entier (roman) ; `None` : aucun.
    pub manuscript_goal: Option<i64>,
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

/// Titre facultatif : seule sa longueur est limitée.
fn clean_title(title: &str) -> AppResult<String> {
    let title = title.trim();

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

fn check_level(level: i64, count: usize) -> AppResult<()> {
    if !(0..count as i64).contains(&level) {
        return Err(AppError::validation("Niveau de découpage invalide.")
            .with_key("structure.invalidLevel"));
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

const NODE_COLUMNS: &str = "id, parent_id, level, title, summary, position, numbered, number, \
     content_words, word_goal, writing_status, narrative_person, narrative_tense, \
     narrative_goal, page_goal, script_status, rhythm, page_turn, created_at, updated_at";

pub(crate) async fn find_node(pool: &SqlitePool, id: &str) -> AppResult<Option<StructureNode>> {
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

/// Niveaux personnalisés (`None` : ceux du modèle).
async fn custom_levels(pool: &SqlitePool) -> AppResult<Option<Vec<StructureLevel>>> {
    let raw: Option<String> =
        sqlx::query_scalar("SELECT levels FROM structure_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?
            .flatten();

    let Some(raw) = raw else {
        return Ok(None);
    };

    match serde_json::from_str::<Vec<StructureLevel>>(&raw) {
        Ok(levels) if (1..=MAX_LEVELS).contains(&levels.len()) => Ok(Some(levels)),
        // Valeur illisible : on revient aux niveaux du modèle plutôt que de
        // bloquer le plan.
        _ => {
            tracing::warn!("Niveaux du découpage illisibles : niveaux du modèle utilisés");
            Ok(None)
        }
    }
}

/// Nombre de niveaux en vigueur.
async fn level_count(pool: &SqlitePool) -> AppResult<usize> {
    Ok(custom_levels(pool)
        .await?
        .map_or(TEMPLATE_LEVELS, |levels| levels.len()))
}

/// Niveau le plus fin utilisé par un élément (`None` : plan vide).
async fn deepest_used_level(pool: &SqlitePool) -> AppResult<Option<i64>> {
    Ok(sqlx::query_scalar("SELECT MAX(level) FROM structure_nodes")
        .fetch_one(pool)
        .await?)
}

/// Niveaux en vigueur : personnalisés, sinon ceux du modèle.
async fn levels_in_force(pool: &SqlitePool, project_type: ProjectType) -> AppResult<Vec<StructureLevel>> {
    Ok(match custom_levels(pool).await? {
        Some(levels) => levels,
        None => chosen_template(pool)
            .await?
            .unwrap_or_else(|| StructureTemplate::for_project_type(project_type))
            .default_levels(),
    })
}

async fn auto_numbering(pool: &SqlitePool) -> AppResult<bool> {
    let value: Option<i64> =
        sqlx::query_scalar("SELECT auto_numbering FROM structure_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?;

    Ok(value.unwrap_or(0) != 0)
}

async fn all_nodes(pool: &SqlitePool) -> AppResult<Vec<StructureNode>> {
    let sql = format!(
        "SELECT {NODE_COLUMNS} FROM structure_nodes \
         ORDER BY parent_id IS NOT NULL, parent_id, position, created_at"
    );

    Ok(sqlx::query_as::<_, StructureNode>(&sql).fetch_all(pool).await?)
}

// ----------------------------------------------------------------------------
// Numérotation
// ----------------------------------------------------------------------------

/// Éléments dans l'ordre de lecture du plan (parcours en profondeur, frères
/// triés par position ; un élément au parent introuvable est à la racine).
fn reading_order(nodes: &[StructureNode]) -> Vec<&StructureNode> {
    let known: std::collections::HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let mut children: HashMap<Option<&str>, Vec<&StructureNode>> = HashMap::new();

    for node in nodes {
        let parent = node.parent_id.as_deref().filter(|p| known.contains(p));
        children.entry(parent).or_default().push(node);
    }
    for list in children.values_mut() {
        list.sort_by(|a, b| a.position.cmp(&b.position).then_with(|| a.created_at.cmp(&b.created_at)));
    }

    let mut out = Vec::with_capacity(nodes.len());
    let mut stack: Vec<&StructureNode> = children.get(&None).cloned().unwrap_or_default();
    stack.reverse();

    while let Some(node) = stack.pop() {
        out.push(node);
        if let Some(list) = children.get(&Some(node.id.as_str())) {
            stack.extend(list.iter().rev());
        }
    }

    out
}

/// Règle de numérotation du niveau d'un élément (le dernier niveau si
/// l'élément est plus profond). `None` : pas de numéro.
fn rule_of<'a>(levels: &'a [StructureLevel], node: &StructureNode) -> Option<&'a StructureLevel> {
    if !node.numbered || levels.is_empty() {
        return None;
    }
    let level = &levels[(node.level.max(0) as usize).min(levels.len() - 1)];
    (level.numbering != Numbering::None).then_some(level)
}

/// Portée d'un compteur : tout le projet pour un niveau `continuous`, le
/// parent pour `perParent`.
fn scope_of(rule: &StructureLevel, node: &StructureNode) -> (i64, Option<String>) {
    match rule.numbering {
        Numbering::PerParent => (node.level, node.parent_id.clone()),
        _ => (node.level, None),
    }
}

/// Numéros d'après l'ordre du plan (même règle que `numberNodes` dans
/// l'interface) : un compteur par portée, en commençant à `start`.
pub fn compute_numbers(nodes: &[StructureNode], levels: &[StructureLevel]) -> HashMap<String, i64> {
    let mut counters: HashMap<(i64, Option<String>), i64> = HashMap::new();
    let mut numbers = HashMap::new();

    for node in reading_order(nodes) {
        let Some(rule) = rule_of(levels, node) else {
            continue;
        };
        let count = counters.entry(scope_of(rule, node)).or_insert(0);
        *count += 1;
        numbers.insert(node.id.clone(), rule.start + *count - 1);
    }

    numbers
}

/// Numéro d'un nouvel élément (mode non automatique) : celui de l'élément
/// numéroté qui le précède dans sa portée, plus un ; à défaut, le premier
/// numéro du niveau. `None` : pas de numéro.
fn next_number(nodes: &[StructureNode], levels: &[StructureLevel], id: &str) -> Option<i64> {
    let mut last: HashMap<(i64, Option<String>), i64> = HashMap::new();
    let computed = compute_numbers(nodes, levels);

    for node in reading_order(nodes) {
        let Some(rule) = rule_of(levels, node) else {
            continue;
        };
        let scope = scope_of(rule, node);

        if node.id == id {
            return Some(last.get(&scope).map_or(rule.start, |n| n + 1));
        }

        if let Some(number) = node.number.or_else(|| computed.get(&node.id).copied()) {
            last.insert(scope, number);
        }
    }

    None
}

/// Mode non automatique : attribue un numéro aux éléments qui n'en ont pas
/// encore (après la mise à jour de la base, ou un élément renuméroté), celui
/// de la numérotation automatique.
async fn assign_missing_numbers(pool: &SqlitePool, levels: &[StructureLevel]) -> AppResult<bool> {
    let nodes = all_nodes(pool).await?;
    let computed = compute_numbers(&nodes, levels);
    let missing: Vec<(&String, i64)> = nodes
        .iter()
        .filter(|n| n.number.is_none())
        .filter_map(|n| computed.get(&n.id).map(|number| (&n.id, *number)))
        .collect();

    if missing.is_empty() {
        return Ok(false);
    }

    let mut tx = pool.begin().await?;
    for (id, number) in missing {
        sqlx::query("UPDATE structure_nodes SET number = ? WHERE id = ?")
            .bind(number)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok(true)
}

/// Remet tous les numéros dans l'ordre du plan (« Renuméroter »).
pub async fn renumber(pool: &SqlitePool, project_type: ProjectType) -> AppResult<()> {
    let levels = levels_in_force(pool, project_type).await?;
    let nodes = all_nodes(pool).await?;
    let computed = compute_numbers(&nodes, &levels);

    let mut tx = pool.begin().await?;
    for node in &nodes {
        let number = computed.get(&node.id).copied();
        if node.number != number {
            sqlx::query("UPDATE structure_nodes SET number = ? WHERE id = ?")
                .bind(number)
                .bind(&node.id)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;

    Ok(())
}

/// Active ou désactive la mise à jour automatique des numéros. En la
/// désactivant, chaque élément garde le numéro qu'il affiche à ce moment.
pub async fn set_auto_numbering(pool: &SqlitePool, project_type: ProjectType, enabled: bool) -> AppResult<()> {
    if !enabled {
        renumber(pool, project_type).await?;
    }

    sqlx::query(
        "INSERT INTO structure_settings (id, template, auto_numbering, updated_at) VALUES ('default', NULL, ?, ?) \
         ON CONFLICT (id) DO UPDATE SET auto_numbering = excluded.auto_numbering, updated_at = excluded.updated_at",
    )
    .bind(enabled)
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

/// Découpage complet du projet.
pub async fn get_structure(pool: &SqlitePool, project_type: ProjectType) -> AppResult<Structure> {
    let chosen = chosen_template(pool).await?;
    let template = chosen.unwrap_or_else(|| StructureTemplate::for_project_type(project_type));
    let custom = custom_levels(pool).await?;
    let levels_custom = custom.is_some();
    let levels = custom.unwrap_or_else(|| template.default_levels());
    let auto = auto_numbering(pool).await?;

    if !auto {
        assign_missing_numbers(pool, &levels).await?;
    }

    Ok(Structure {
        template,
        template_chosen: chosen.is_some(),
        levels_custom,
        levels,
        auto_numbering: auto,
        manuscript_goal: crate::services::novel_service::manuscript_goal(pool).await?,
        nodes: all_nodes(pool).await?,
    })
}

// ----------------------------------------------------------------------------
// Modèle
// ----------------------------------------------------------------------------

/// Choisit le modèle de découpage. `None` : le modèle suit le type du projet.
///
/// Les niveaux redeviennent ceux du modèle (noms et numérotation). Refusé si
/// des éléments sont rangés dans un niveau que le modèle n'a pas. Les
/// numéros des niveaux dont la numérotation change sont recalculés.
pub async fn set_template(
    pool: &SqlitePool,
    project_type: ProjectType,
    template: Option<&str>,
) -> AppResult<()> {
    let template = match template {
        Some(value) => Some(
            StructureTemplate::parse(value).ok_or_else(|| {
                AppError::validation("Modèle de découpage inconnu.")
                    .with_key("structure.invalidTemplate")
            })?,
        ),
        None => None,
    };

    if let Some(deepest) = deepest_used_level(pool).await? {
        if deepest >= TEMPLATE_LEVELS as i64 {
            return Err(levels_in_use(deepest + 1));
        }
    }

    let before = levels_in_force(pool, project_type).await?;
    let after = template
        .unwrap_or_else(|| StructureTemplate::for_project_type(project_type))
        .default_levels();

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO structure_settings (id, template, levels, updated_at) VALUES ('default', ?, NULL, ?) \
         ON CONFLICT (id) DO UPDATE SET template = excluded.template, levels = NULL, \
         updated_at = excluded.updated_at",
    )
    .bind(template.map(StructureTemplate::as_str))
    .bind(now_utc())
    .execute(&mut *tx)
    .await?;

    let renumbered: Vec<i64> = (0..after.len())
        .filter(|&index| before.get(index).is_none_or(|old| !same_numbering(old, &after[index])))
        .map(|index| index as i64)
        .collect();
    forget_numbers(&mut tx, &renumbered).await?;

    tx.commit().await?;

    Ok(())
}

/// Même numérotation (mode et premier numéro) : les numéros enregistrés
/// restent valables.
fn same_numbering(a: &StructureLevel, b: &StructureLevel) -> bool {
    a.numbering == b.numbering && a.start == b.start
}

/// Oublie les numéros enregistrés des niveaux donnés : ils seront
/// recalculés (numérotation automatique) à la prochaine lecture.
async fn forget_numbers(conn: &mut sqlx::SqliteConnection, levels: &[i64]) -> AppResult<()> {
    if levels.is_empty() {
        return Ok(());
    }

    let marks = vec!["?"; levels.len()].join(", ");
    let sql = format!("UPDATE structure_nodes SET number = NULL WHERE level IN ({marks})");

    let mut query = sqlx::query(&sql);
    for level in levels {
        query = query.bind(level);
    }
    query.execute(&mut *conn).await?;

    Ok(())
}

fn levels_in_use(used: i64) -> AppError {
    AppError::validation(format!(
        "Des éléments utilisent {used} niveaux : le modèle n'en a que {TEMPLATE_LEVELS}."
    ))
    .with_key("structure.levelsInUse")
    .with_param("used", used)
    .with_param("max", TEMPLATE_LEVELS)
}

fn clean_level_name(name: &str, field: &'static str) -> AppResult<String> {
    let name = name.trim();

    if name.is_empty() {
        return Err(AppError::validation("Le nom du niveau ne peut pas être vide.")
            .with_key("structure.levelNameEmpty"));
    }
    if name.chars().count() > MAX_LEVEL_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Le nom du niveau ne peut pas dépasser {MAX_LEVEL_NAME_CHARS} caractères."
        ))
        .with_key("structure.levelNameTooLong")
        .with_param("max", MAX_LEVEL_NAME_CHARS)
        .with_detail(field));
    }

    Ok(name.to_owned())
}

/// Personnalise les niveaux : noms, numérotation, ajout ou retrait.
///
/// `levels` : tous les niveaux, du plus large au plus fin. Un niveau gardé
/// garde son `id` ; un nouveau niveau n'en a pas. Les niveaux gardés
/// restent dans le même ordre ; un niveau retiré doit être vide. Les
/// éléments suivent leur niveau (insérer un niveau au-dessus des chapitres
/// ne change pas les chapitres). Les numéros enregistrés d'un niveau dont la
/// numérotation change (mode, premier numéro) sont recalculés.
pub async fn set_levels(
    pool: &SqlitePool,
    project_type: ProjectType,
    levels: &[LevelInput],
) -> AppResult<()> {
    if levels.is_empty() || levels.len() > MAX_LEVELS {
        return Err(AppError::validation(format!(
            "Le découpage compte de 1 à {MAX_LEVELS} niveaux."
        ))
        .with_key("structure.levelCount")
        .with_param("max", MAX_LEVELS));
    }

    let old_levels = levels_in_force(pool, project_type).await?;
    let old_ids: Vec<String> = old_levels.iter().map(|level| level.id.clone()).collect();

    let mut saved = Vec::with_capacity(levels.len());
    // (ancien niveau, nouveau niveau) des niveaux gardés.
    let mut moves: Vec<(i64, i64)> = Vec::new();

    for (new_index, input) in levels.iter().enumerate() {
        let one = clean_level_name(&input.one, "one")?;
        let other = if input.other.trim().is_empty() {
            one.clone()
        } else {
            clean_level_name(&input.other, "other")?
        };

        if !(0..=MAX_START).contains(&input.start) || !(1..=MAX_DIGITS).contains(&input.digits) {
            return Err(AppError::validation("Numérotation invalide.")
                .with_key("structure.invalidNumbering"));
        }

        let kept = input
            .id
            .as_deref()
            .and_then(|id| old_ids.iter().position(|old| old == id));

        let id = match kept {
            Some(old_index) => {
                if moves.iter().any(|&(old, _)| old >= old_index as i64) {
                    return Err(AppError::validation("L'ordre des niveaux existants ne peut pas changer.")
                        .with_key("structure.levelsReordered"));
                }
                moves.push((old_index as i64, new_index as i64));
                old_ids[old_index].clone()
            }
            None => new_id(),
        };

        let color = match input.color.as_deref().map(str::trim) {
            Some(value) if !value.is_empty() => Some(clean_color(value)?),
            _ => None,
        };

        saved.push(StructureLevel {
            id,
            one: Some(one),
            other: Some(other),
            numbering: input.numbering,
            start: input.start,
            digits: input.digits,
            color,
        });
    }

    let mut tx = pool.begin().await?;

    // Un niveau retiré doit être vide.
    for old_index in 0..old_ids.len() as i64 {
        if moves.iter().any(|&(old, _)| old == old_index) {
            continue;
        }

        let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM structure_nodes WHERE level = ?")
            .bind(old_index)
            .fetch_one(&mut *tx)
            .await?;

        if used > 0 {
            return Err(AppError::validation(if used == 1 {
                "Ce niveau contient encore 1 élément.".to_owned()
            } else {
                format!("Ce niveau contient encore {used} éléments.")
            })
            .with_key("structure.levelInUse")
            .with_param("count", used));
        }
    }

    // Les éléments suivent leur niveau (l'ordre étant gardé, chaque élément
    // reste sous un parent de niveau inférieur).
    let changed: Vec<&(i64, i64)> = moves.iter().filter(|(old, new)| old != new).collect();

    if !changed.is_empty() {
        let cases = "WHEN ? THEN ? ".repeat(changed.len());
        let sql = format!("UPDATE structure_nodes SET level = CASE level {cases}ELSE level END");

        let mut query = sqlx::query(&sql);
        for (old, new) in changed {
            query = query.bind(old).bind(new);
        }
        query.execute(&mut *tx).await?;
    }

    // Numérotation changée (ou nouveau niveau) : numéros recalculés.
    let renumbered: Vec<i64> = saved
        .iter()
        .enumerate()
        .filter(|(new_index, level)| {
            let kept = moves.iter().find(|&&(_, new)| new == *new_index as i64);
            kept.is_none_or(|&(old, _)| !same_numbering(&old_levels[old as usize], level))
        })
        .map(|(new_index, _)| new_index as i64)
        .collect();
    forget_numbers(&mut tx, &renumbered).await?;

    sqlx::query(
        "INSERT INTO structure_settings (id, template, levels, updated_at) VALUES ('default', NULL, ?, ?) \
         ON CONFLICT (id) DO UPDATE SET levels = excluded.levels, updated_at = excluded.updated_at",
    )
    .bind(serde_json::to_string(&saved)?)
    .bind(now_utc())
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Éléments
// ----------------------------------------------------------------------------

/// Ajoute un élément à la fin de son parent (ou de la racine), ou juste
/// après l'élément `after_id` (même parent).
pub async fn create_node(
    pool: &SqlitePool,
    project_type: ProjectType,
    parent_id: Option<&str>,
    level: i64,
    title: &str,
    after_id: Option<&str>,
) -> AppResult<StructureNode> {
    check_level(level, level_count(pool).await?)?;
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
    let mut tx = pool.begin().await?;

    match after_id {
        Some(after_id) => {
            let sql = format!("SELECT {NODE_COLUMNS} FROM structure_nodes WHERE id = ?");
            let after = sqlx::query_as::<_, StructureNode>(&sql)
                .bind(after_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(node_not_found)?;

            if after.parent_id.as_deref() != parent_id {
                return Err(AppError::validation("L'élément de référence n'a pas le même parent.")
                    .with_key("structure.invalidParent"));
            }

            // Place libérée juste après l'élément de référence.
            sqlx::query(
                "UPDATE structure_nodes SET position = position + 1 \
                 WHERE parent_id IS ? AND position > ?",
            )
            .bind(parent_id)
            .bind(after.position)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT INTO structure_nodes \
                    (id, parent_id, level, title, summary, position, numbered, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, '', ?, 1, ?, ?)",
            )
            .bind(&id)
            .bind(parent_id)
            .bind(level)
            .bind(&title)
            .bind(after.position + 1)
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            // Position calculée dans la même instruction que l'insertion.
            sqlx::query(
                r#"
                INSERT INTO structure_nodes
                    (id, parent_id, level, title, summary, position, numbered, created_at, updated_at)
                SELECT ?, ?, ?, ?, '',
                       COALESCE(MAX(position), -1) + 1, 1, ?, ?
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
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    // Mode non automatique : le numéro suivant, gardé ensuite.
    if !auto_numbering(pool).await? {
        let levels = levels_in_force(pool, project_type).await?;
        let nodes = all_nodes(pool).await?;

        if let Some(number) = next_number(&nodes, &levels, &id) {
            sqlx::query("UPDATE structure_nodes SET number = ? WHERE id = ?")
                .bind(number)
                .bind(&id)
                .execute(pool)
                .await?;
        }
    }

    find_node(pool, &id)
        .await?
        .ok_or_else(|| AppError::internal("Élément introuvable après création"))
}

/// Modifie le titre, le résumé et/ou la numérotation d'un élément.
pub async fn update_node(
    pool: &SqlitePool,
    id: &str,
    title: Option<&str>,
    summary: Option<&str>,
    numbered: Option<bool>,
    number: Option<i64>,
) -> AppResult<StructureNode> {
    if number.is_some_and(|n| !(0..=MAX_NUMBER).contains(&n)) {
        return Err(AppError::validation("Numéro invalide.")
            .with_key("structure.invalidNumber")
            .with_param("max", MAX_NUMBER));
    }

    let current = find_node(pool, id).await?.ok_or_else(node_not_found)?;

    let title = match title {
        Some(value) => clean_title(value)?,
        None => current.title,
    };
    let summary = match summary {
        Some(value) => clean_summary(value)?,
        None => current.summary,
    };

    let numbered = numbered.unwrap_or(current.numbered);
    let number = number.or(current.number);

    sqlx::query(
        "UPDATE structure_nodes SET title = ?, summary = ?, numbered = ?, number = ?, updated_at = ? WHERE id = ?",
    )
        .bind(&title)
        .bind(&summary)
        .bind(numbered)
        .bind(number)
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
pub async fn delete_node(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = crate::services::trash_service::Snapshot::new();
    snapshot.capture(&mut tx, "structure_nodes", "id", id).await?;
    if snapshot.is_empty() {
        return Err(node_not_found());
    }
    let label: String = sqlx::query_scalar("SELECT title FROM structure_nodes WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM structure_nodes WHERE id = ?").bind(id).execute(&mut *tx).await?;

    let trash_id = snapshot.store(&mut tx, "structureNode", id, &label).await?;
    tx.commit().await?;

    Ok(trash_id)
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

        set_template(&pool, ProjectType::Manga, Some("film")).await.unwrap();
        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        assert_eq!(s.template, StructureTemplate::Film);
        assert!(s.template_chosen);

        set_template(&pool, ProjectType::Novel, None).await.unwrap();
        let s = get_structure(&pool, ProjectType::Rpg).await.unwrap();
        assert_eq!(s.template, StructureTemplate::Rpg);

        assert!(set_template(&pool, ProjectType::Novel, Some("inconnu")).await.is_err());
        assert_eq!(
            StructureTemplate::for_project_type(ProjectType::Custom),
            StructureTemplate::Generic
        );
    }

    #[tokio::test]
    async fn nodes_are_created_in_order_under_their_parent() {
        let pool = pool().await;

        let part = create_node(&pool, ProjectType::Novel, None, 0, "Première partie", None).await.unwrap();
        let c1 = create_node(&pool, ProjectType::Novel, Some(&part.id), 1, "Chapitre 1", None).await.unwrap();
        let c2 = create_node(&pool, ProjectType::Novel, Some(&part.id), 1, "  Chapitre 2  ", None).await.unwrap();
        create_node(&pool, ProjectType::Novel, Some(&c1.id), 2, "Scène 1", None).await.unwrap();
        // Une scène directement sous la partie (niveau sauté) est permise.
        create_node(&pool, ProjectType::Novel, Some(&part.id), 2, "Interlude", None).await.unwrap();
        // Un chapitre à la racine (roman sans parties) aussi.
        create_node(&pool, ProjectType::Novel, None, 1, "Épilogue", None).await.unwrap();

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
        let chapter = create_node(&pool, ProjectType::Novel, None, 1, "Chapitre", None).await.unwrap();

        // Une partie ne peut pas être dans un chapitre, ni un chapitre dans un chapitre.
        assert!(create_node(&pool, ProjectType::Novel, Some(&chapter.id), 0, "Partie", None).await.is_err());
        assert!(create_node(&pool, ProjectType::Novel, Some(&chapter.id), 1, "Chapitre", None).await.is_err());
        assert!(create_node(&pool, ProjectType::Novel, None, 3, "Trop profond", None).await.is_err());
        assert!(create_node(&pool, ProjectType::Novel, None, -1, "Négatif", None).await.is_err());
        // Titre facultatif : un élément sans titre affiche « Partie 1 ».
        assert_eq!(create_node(&pool, ProjectType::Novel, None, 0, "   ", None).await.unwrap().title, "");
        assert!(create_node(&pool, ProjectType::Novel, None, 0, &"x".repeat(201), None).await.is_err());
        assert!(create_node(&pool, ProjectType::Novel, Some("inconnu"), 2, "Scène", None).await.is_err());
    }

    #[tokio::test]
    async fn update_changes_only_given_fields() {
        let pool = pool().await;
        let node = create_node(&pool, ProjectType::Novel, None, 0, "Titre", None).await.unwrap();

        let node = update_node(&pool, &node.id, None, Some("  Le héros part.  "), None, None)
            .await
            .unwrap();
        assert_eq!((node.title.as_str(), node.summary.as_str()), ("Titre", "Le héros part."));

        let node = update_node(&pool, &node.id, Some("Nouveau titre"), None, None, None)
            .await
            .unwrap();
        assert_eq!(node.summary, "Le héros part.");
        assert_eq!(node.title, "Nouveau titre");

        assert!(update_node(&pool, &node.id, Some(&"x".repeat(201)), None, None, None).await.is_err());
        assert!(update_node(&pool, "inconnu", Some("x"), None, None, None).await.is_err());
    }

    #[tokio::test]
    async fn nodes_move_among_their_siblings_only() {
        let pool = pool().await;
        let a = create_node(&pool, ProjectType::Novel, None, 1, "A", None).await.unwrap();
        let b = create_node(&pool, ProjectType::Novel, None, 1, "B", None).await.unwrap();
        let c = create_node(&pool, ProjectType::Novel, None, 1, "C", None).await.unwrap();
        let inner = create_node(&pool, ProjectType::Novel, Some(&a.id), 2, "dans A", None).await.unwrap();

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
        let part = create_node(&pool, ProjectType::Novel, None, 0, "Partie", None).await.unwrap();
        let chapter = create_node(&pool, ProjectType::Novel, Some(&part.id), 1, "Chapitre", None).await.unwrap();
        create_node(&pool, ProjectType::Novel, Some(&chapter.id), 2, "Scène", None).await.unwrap();
        create_node(&pool, ProjectType::Novel, None, 0, "Autre partie", None).await.unwrap();

        delete_node(&pool, &part.id).await.unwrap();

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(s.nodes.len(), 1);
        assert_eq!(s.nodes[0].title, "Autre partie");
        assert!(delete_node(&pool, &part.id).await.is_err());
    }

    fn level(id: Option<&str>, one: &str, numbering: Numbering) -> LevelInput {
        LevelInput {
            id: id.map(str::to_owned),
            one: one.to_owned(),
            other: String::new(),
            numbering,
            start: 1,
            digits: 1,
            color: None,
        }
    }

    fn level_ids(structure: &Structure) -> Vec<String> {
        structure.levels.iter().map(|l| l.id.clone()).collect()
    }

    #[tokio::test]
    async fn template_levels_have_smart_default_numbering() {
        let pool = pool().await;

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert!(!s.levels_custom);
        assert_eq!(level_ids(&s), ["0", "1", "2"]);
        assert!(s.levels.iter().all(|l| l.one.is_none()));
        assert_eq!(
            s.levels.iter().map(|l| l.numbering).collect::<Vec<_>>(),
            [Numbering::Continuous, Numbering::Continuous, Numbering::PerParent]
        );

        let s = get_structure(&pool, ProjectType::Series).await.unwrap();
        assert_eq!(s.levels[1].numbering, Numbering::PerParent);
    }

    #[tokio::test]
    async fn levels_can_be_renamed_inserted_and_removed() {
        let pool = pool().await;
        let tome = create_node(&pool, ProjectType::Novel, None, 0, "", None).await.unwrap();
        let chapter = create_node(&pool, ProjectType::Novel, Some(&tome.id), 1, "", None).await.unwrap();
        let page = create_node(&pool, ProjectType::Novel, Some(&chapter.id), 2, "", None).await.unwrap();

        // Renommage et nouvelle numérotation, plus un niveau « Arc » inséré
        // entre les tomes et les chapitres.
        set_levels(&pool, ProjectType::Novel,
            &[
                level(Some("0"), "Kkhkk", Numbering::Continuous),
                level(None, "Arc", Numbering::PerParent),
                level(Some("1"), "Chapitre", Numbering::Continuous),
                LevelInput { digits: 2, start: 0, ..level(Some("2"), "Planche", Numbering::PerParent) },
            ],
        )
        .await
        .unwrap();

        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        assert!(s.levels_custom);
        assert_eq!(s.levels.len(), 4);
        assert_eq!(s.levels[0].one.as_deref(), Some("Kkhkk"));
        assert_eq!(s.levels[0].other.as_deref(), Some("Kkhkk"));
        assert_eq!((s.levels[3].start, s.levels[3].digits), (0, 2));
        let level_of = |id: &str| s.nodes.iter().find(|n| n.id == id).unwrap().level;
        // Les éléments suivent leur niveau.
        assert_eq!((level_of(&tome.id), level_of(&chapter.id), level_of(&page.id)), (0, 2, 3));

        // Un 5e niveau est accepté, un 6e non.
        let mut five: Vec<LevelInput> = s
            .levels
            .iter()
            .map(|l| level(Some(&l.id), l.one.as_deref().unwrap(), l.numbering))
            .collect();
        five.push(level(None, "Case", Numbering::PerParent));
        set_levels(&pool, ProjectType::Novel, &five).await.unwrap();
        let mut six = five.clone();
        six.push(level(None, "Bulle", Numbering::None));
        assert!(set_levels(&pool, ProjectType::Novel, &six).await.is_err());
        assert!(set_levels(&pool, ProjectType::Novel, &[]).await.is_err());

        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        let ids = level_ids(&s);

        // Retirer un niveau vide (« Arc ») : les chapitres et pages remontent.
        let without_arc: Vec<LevelInput> = s
            .levels
            .iter()
            .filter(|l| l.one.as_deref() != Some("Arc"))
            .map(|l| level(Some(&l.id), l.one.as_deref().unwrap(), l.numbering))
            .collect();
        set_levels(&pool, ProjectType::Novel, &without_arc).await.unwrap();
        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        let level_of = |id: &str| s.nodes.iter().find(|n| n.id == id).unwrap().level;
        assert_eq!((level_of(&chapter.id), level_of(&page.id)), (1, 2));

        // Retirer un niveau utilisé, changer l'ordre ou vider un nom : refusé.
        let without_chapters: Vec<LevelInput> = s
            .levels
            .iter()
            .filter(|l| l.one.as_deref() != Some("Chapitre"))
            .map(|l| level(Some(&l.id), l.one.as_deref().unwrap(), l.numbering))
            .collect();
        assert!(set_levels(&pool, ProjectType::Novel, &without_chapters).await.is_err());
        assert!(set_levels(&pool, ProjectType::Novel, &[level(Some(&ids[2]), "A", Numbering::None), level(Some(&ids[0]), "B", Numbering::None)])
            .await
            .is_err());
        assert!(set_levels(&pool, ProjectType::Novel, &[level(Some(&ids[0]), "  ", Numbering::None)]).await.is_err());
        assert!(set_levels(&pool, ProjectType::Novel, &[LevelInput { digits: 9, ..level(None, "X", Numbering::None) }]).await.is_err());

        // Retour au modèle impossible tant qu'un élément est au 4e niveau…
        create_node(&pool, ProjectType::Novel, Some(&page.id), 3, "", None).await.unwrap();
        assert!(set_template(&pool, ProjectType::Novel, None).await.is_err());
        // … possible sinon : les niveaux redeviennent ceux du modèle.
        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        let deepest = s.nodes.iter().find(|n| n.level == 3).unwrap().id.clone();
        delete_node(&pool, &deepest).await.unwrap();
        set_template(&pool, ProjectType::Novel, Some("novel")).await.unwrap();
        let s = get_structure(&pool, ProjectType::Manga).await.unwrap();
        assert!(!s.levels_custom);
        assert_eq!(s.levels.len(), 3);
    }

    #[tokio::test]
    async fn nodes_can_be_inserted_after_a_sibling_and_excluded_from_numbering() {
        let pool = pool().await;
        let a = create_node(&pool, ProjectType::Novel, None, 1, "A", None).await.unwrap();
        let b = create_node(&pool, ProjectType::Novel, None, 1, "B", None).await.unwrap();
        create_node(&pool, ProjectType::Novel, None, 1, "Après A", Some(&a.id)).await.unwrap();
        create_node(&pool, ProjectType::Novel, None, 1, "Après B", Some(&b.id)).await.unwrap();

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(titles(&s, None), ["A", "Après A", "B", "Après B"]);

        // L'élément de référence doit avoir le même parent.
        let inner = create_node(&pool, ProjectType::Novel, Some(&a.id), 2, "", None).await.unwrap();
        assert!(create_node(&pool, ProjectType::Novel, None, 2, "", Some(&inner.id)).await.is_err());

        assert!(a.numbered);
        let prologue = update_node(&pool, &a.id, Some("Prologue"), None, Some(false), None).await.unwrap();
        assert!(!prologue.numbered);
        let unchanged = update_node(&pool, &a.id, None, Some("…"), None, None).await.unwrap();
        assert!(!unchanged.numbered);
    }

    #[tokio::test]
    async fn generated_titles_are_cleared_by_the_migration() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // Base d'avant la migration 010.
        let before = sqlx::migrate::Migrator {
            migrations: std::borrow::Cow::Owned(
                PROJECT_MIGRATOR.iter().filter(|m| m.version < 10).cloned().collect(),
            ),
            ..sqlx::migrate::Migrator::DEFAULT
        };
        before.run(&pool).await.unwrap();

        for (id, title) in [
            ("1", "Chapitre 3"),
            ("2", "Scène 12"),
            ("3", "Chapter 7"),
            ("4", "Chapitre 3 bis"),
            ("5", "Le départ"),
            ("6", "Chapitre"),
            ("7", "Épisode 2"),
        ] {
            sqlx::query(
                "INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) \
                 VALUES (?, NULL, 1, ?, '', ?, 'x', 'x')",
            )
            .bind(id)
            .bind(title)
            .bind(id.parse::<i64>().unwrap())
            .execute(&pool)
            .await
            .unwrap();
        }

        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();

        let s = get_structure(&pool, ProjectType::Novel).await.unwrap();
        assert_eq!(titles(&s, None), ["", "", "", "Chapitre 3 bis", "Le départ", "Chapitre", ""]);
        assert!(s.nodes.iter().all(|n| n.numbered));
    }

    /// Numéros affichés (enregistrés en mode non automatique, calculés sinon).
    async fn shown_numbers(pool: &SqlitePool) -> Vec<(String, Option<i64>)> {
        let s = get_structure(pool, ProjectType::Novel).await.unwrap();
        let computed = compute_numbers(&s.nodes, &s.levels);
        reading_order(&s.nodes)
            .into_iter()
            .map(|n| {
                let number = if s.auto_numbering { computed.get(&n.id).copied() } else { n.number };
                (n.title.clone(), number)
            })
            .collect()
    }

    #[tokio::test]
    async fn numbers_are_kept_by_default_and_renumbered_on_demand() {
        let pool = pool().await;
        let novel = ProjectType::Novel;

        // Par défaut : numéros gardés.
        assert!(!get_structure(&pool, novel).await.unwrap().auto_numbering);

        let c1 = create_node(&pool, novel, None, 1, "A", None).await.unwrap();
        let c2 = create_node(&pool, novel, None, 1, "B", None).await.unwrap();
        create_node(&pool, novel, None, 1, "C", None).await.unwrap();
        create_node(&pool, novel, Some(&c1.id), 2, "a1", None).await.unwrap();
        assert_eq!(c1.number, Some(1));
        assert_eq!(c2.number, Some(2));

        // Déplacement, suppression : les numéros ne bougent pas.
        move_node(&pool, &c2.id, MoveDirection::Up).await.unwrap();
        assert_eq!(
            shown_numbers(&pool).await,
            [("B".into(), Some(2)), ("A".into(), Some(1)), ("a1".into(), Some(1)), ("C".into(), Some(3))]
        );
        delete_node(&pool, &c1.id).await.unwrap();

        // Un nouvel élément prend le numéro qui suit celui qui le précède.
        let after_b = create_node(&pool, novel, None, 1, "B bis", Some(&c2.id)).await.unwrap();
        assert_eq!(after_b.number, Some(3));
        let last = create_node(&pool, novel, None, 1, "D", None).await.unwrap();
        assert_eq!(last.number, Some(4));

        // Numéro choisi à la main.
        let node = update_node(&pool, &last.id, None, None, None, Some(10)).await.unwrap();
        assert_eq!(node.number, Some(10));
        assert!(update_node(&pool, &last.id, None, None, None, Some(-1)).await.is_err());

        // « Renuméroter » : tout repart dans l'ordre du plan.
        renumber(&pool, novel).await.unwrap();
        assert_eq!(
            shown_numbers(&pool).await,
            [("B".into(), Some(1)), ("B bis".into(), Some(2)), ("C".into(), Some(3)), ("D".into(), Some(4))]
        );

        // Mode automatique : les numéros suivent l'ordre du plan.
        set_auto_numbering(&pool, novel, true).await.unwrap();
        assert!(get_structure(&pool, novel).await.unwrap().auto_numbering);
        move_node(&pool, &last.id, MoveDirection::Up).await.unwrap();
        assert_eq!(
            shown_numbers(&pool).await,
            [("B".into(), Some(1)), ("B bis".into(), Some(2)), ("D".into(), Some(3)), ("C".into(), Some(4))]
        );

        // Retour au mode non automatique : chacun garde le numéro affiché.
        set_auto_numbering(&pool, novel, false).await.unwrap();
        move_node(&pool, &last.id, MoveDirection::Up).await.unwrap();
        assert_eq!(
            shown_numbers(&pool).await,
            [("B".into(), Some(1)), ("D".into(), Some(3)), ("B bis".into(), Some(2)), ("C".into(), Some(4))]
        );
    }

    #[tokio::test]
    async fn changing_a_level_numbering_recomputes_only_that_level() {
        let pool = pool().await;
        let novel = ProjectType::Novel;
        let part = create_node(&pool, novel, None, 0, "P", None).await.unwrap();
        let chapter = create_node(&pool, novel, Some(&part.id), 1, "C", None).await.unwrap();
        update_node(&pool, &part.id, None, None, None, Some(7)).await.unwrap();
        update_node(&pool, &chapter.id, None, None, None, Some(9)).await.unwrap();

        // Renommer les parties garde leurs numéros ; les chapitres qui
        // commencent maintenant à 0 sont renumérotés.
        let s = get_structure(&pool, novel).await.unwrap();
        set_levels(
            &pool,
            novel,
            &[
                LevelInput { id: Some(s.levels[0].id.clone()), ..level(None, "Livre", Numbering::Continuous) },
                LevelInput { id: Some(s.levels[1].id.clone()), start: 0, ..level(None, "Chapitre", Numbering::Continuous) },
                LevelInput { id: Some(s.levels[2].id.clone()), ..level(None, "Scène", Numbering::PerParent) },
            ],
        )
        .await
        .unwrap();

        assert_eq!(shown_numbers(&pool).await, [("P".into(), Some(7)), ("C".into(), Some(0))]);
    }

    #[tokio::test]
    async fn levels_can_have_colors() {
        let pool = pool().await;
        let novel = ProjectType::Novel;

        // Couleur d'un niveau, gardée dans les niveaux personnalisés.
        let s = get_structure(&pool, novel).await.unwrap();
        assert!(s.levels.iter().all(|l| l.color.is_none()));
        let mut inputs: Vec<LevelInput> = s
            .levels
            .iter()
            .map(|l| level(Some(&l.id), "Niveau", l.numbering))
            .collect();
        inputs[1].color = Some("#16A34A".into());
        set_levels(&pool, novel, &inputs).await.unwrap();
        let s = get_structure(&pool, novel).await.unwrap();
        assert_eq!(s.levels[1].color.as_deref(), Some("#16a34a"));
        assert_eq!(s.levels[0].color, None);

        inputs[0].color = Some("#12345".into());
        assert!(set_levels(&pool, novel, &inputs).await.is_err());
    }
}
