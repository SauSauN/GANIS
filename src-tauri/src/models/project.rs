//! Modèle de données pour les projets narratifs.

use serde::{Deserialize, Serialize};

/// Statut d'un projet narratif.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectStatus::Preparing => "preparing",
            ProjectStatus::InProgress => "in_progress",
            ProjectStatus::Paused => "paused",
            ProjectStatus::Done => "done",
        }
    }

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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub project_type: ProjectType,
    pub status: ProjectStatus,
    pub created_at: String,
    pub updated_at: String,
}