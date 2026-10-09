//! Modèle de données pour les projets narratifs.

use serde::{Deserialize, Serialize};

/// Statut d'un projet narratif.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    sqlx::Type,
)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "snake_case")]
pub enum ProjectStatus {
    Preparing,
    InProgress,
    Paused,
    Done,
}

impl Default for ProjectStatus {
    fn default() -> Self {
        ProjectStatus::Preparing
    }
}

impl ProjectStatus {
    /// Représentation du statut utilisée par la base de données.
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectStatus::Preparing => "preparing",
            ProjectStatus::InProgress => "in_progress",
            ProjectStatus::Paused => "paused",
            ProjectStatus::Done => "done",
        }
    }

    /// Convertit une valeur provenant de la base de données
    /// en `ProjectStatus`.
    pub fn from_str(s: &str) -> Self {
        match s {
            "in_progress" => ProjectStatus::InProgress,
            "paused" => ProjectStatus::Paused,
            "done" => ProjectStatus::Done,
            _ => ProjectStatus::Preparing,
        }
    }
}

/// Type de projet narratif.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    sqlx::Type,
)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
pub enum ProjectType {
    Manga,
    Novel,
    Film,
    Series,
    Game,
    Rpg,
    Custom,
}

impl Default for ProjectType {
    fn default() -> Self {
        ProjectType::Custom
    }
}

impl ProjectType {
    /// Représentation du type utilisée par la base de données.
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectType::Manga => "manga",
            ProjectType::Novel => "novel",
            ProjectType::Film => "film",
            ProjectType::Series => "series",
            ProjectType::Game => "game",
            ProjectType::Rpg => "rpg",
            ProjectType::Custom => "custom",
        }
    }

    /// Convertit une valeur provenant de la base de données
    /// en `ProjectType`.
    pub fn from_str(s: &str) -> Self {
        match s {
            "manga" => ProjectType::Manga,
            "novel" => ProjectType::Novel,
            "film" => ProjectType::Film,
            "series" => ProjectType::Series,
            "game" => ProjectType::Game,
            "rpg" => ProjectType::Rpg,
            _ => ProjectType::Custom,
        }
    }
}

/// Représente un projet narratif.
///
/// Le champ Rust `project_type` est sérialisé en `type` côté frontend.
/// Cela permet de conserver :
///
/// - `project_type` pour la colonne SQL ;
/// - `type` pour le modèle TypeScript `Project`.
///
/// Les champs `is_favorite` et `is_archived` sont désormais exposés
/// au frontend. Ils sont stockés en base comme `INTEGER` (0 ou 1)
/// et convertis automatiquement en `bool` par `sqlx`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,

    /// Colonne SQL : `project_type`
    /// Nom JSON/frontend : `type`
    #[serde(rename = "type")]
    #[sqlx(rename = "project_type")]
    pub project_type: ProjectType,

    pub status: ProjectStatus,

    /// Colonne SQL : `is_favorite`
    /// Nom JSON/frontend : `isFavorite`
    #[serde(rename = "isFavorite")]
    #[sqlx(rename = "is_favorite")]
    pub is_favorite: bool,

    /// Colonne SQL : `is_archived`
    /// Nom JSON/frontend : `isArchived`
    #[serde(rename = "isArchived")]
    #[sqlx(rename = "is_archived")]
    pub is_archived: bool,

    /// Colonne SQL : `created_at`
    /// Nom JSON/frontend : `createdAt`
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "created_at")]
    pub created_at: String,

    /// Colonne SQL : `updated_at`
    /// Nom JSON/frontend : `updatedAt`
    #[serde(rename = "updatedAt")]
    #[sqlx(rename = "updated_at")]
    pub updated_at: String,

    /// Colonne SQL : `last_opened_at`
    /// Nom JSON/frontend : `lastOpenedAt`
    ///
    /// `None` tant que le projet n'a jamais été ouvert.
    #[serde(rename = "lastOpenedAt")]
    #[sqlx(rename = "last_opened_at")]
    pub last_opened_at: Option<String>,

    // ------------------------------------------------------------------
    // Chiffrement (jamais envoyé à l'interface)
    // ------------------------------------------------------------------
    //
    // En base, `name` et `description` restent vides pour un projet
    // chiffré : les valeurs sont dans `*_sealed`, chiffrées avec la clé du
    // compte. `project_service` les déchiffre avant de rendre le projet.

    /// Nom chiffré.
    #[serde(skip)]
    #[sqlx(default)]
    pub name_sealed: Option<String>,

    /// Description chiffrée.
    #[serde(skip)]
    #[sqlx(default)]
    pub description_sealed: Option<String>,

    /// Clé du projet, enfermée par la clé du compte. `None` : projet créé
    /// avant le chiffrement, pas encore chiffré.
    #[serde(skip)]
    #[sqlx(default)]
    pub wrapped_key: Option<String>,
}
