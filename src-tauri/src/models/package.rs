//! Modèles des packages créés par les utilisateurs (§20, §21).
//!
//! Pour l'instant, un seul type existe : le thème (`theme`), un package
//! purement déclaratif (des couleurs, aucun code).

use serde::{Deserialize, Serialize};

/// Type technique d'un package (§20.2).
///
/// Le catalogue est ouvert : un nouveau type s'ajoute ici, dans la
/// contrainte `CHECK` de la table `packages` et dans `types/index.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "kebab-case")]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "kebab-case")]
pub enum PackageType {
    Theme,
}

impl PackageType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PackageType::Theme => "theme",
        }
    }
}

/// Couleurs d'un thème pour un mode (clair ou sombre).
///
/// Seules ces couleurs sont modifiables ; les autres variables de
/// l'interface en sont dérivées côté interface. Chaque valeur est une
/// couleur hexadécimale `#RRGGBB`, vérifiée par `package_service`.
///
/// `deny_unknown_fields` : une clé inconnue fait refuser le thème, au lieu
/// d'être ignorée en silence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemePalette {
    pub background: String,
    pub foreground: String,
    pub card: String,
    pub sidebar: String,
    pub primary: String,
    pub primary_foreground: String,
    pub secondary: String,
    pub muted_foreground: String,
    pub border: String,
    pub destructive: String,
    pub success: String,
    pub warning: String,
}

impl ThemePalette {
    /// Couleurs avec leur nom JSON, pour la validation et les messages.
    pub fn entries(&self) -> [(&'static str, &str); 12] {
        [
            ("background", &self.background),
            ("foreground", &self.foreground),
            ("card", &self.card),
            ("sidebar", &self.sidebar),
            ("primary", &self.primary),
            ("primaryForeground", &self.primary_foreground),
            ("secondary", &self.secondary),
            ("mutedForeground", &self.muted_foreground),
            ("border", &self.border),
            ("destructive", &self.destructive),
            ("success", &self.success),
            ("warning", &self.warning),
        ]
    }
}

/// Données d'un package de type `theme`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeData {
    pub light: ThemePalette,
    pub dark: ThemePalette,
    /// Arrondi des coins, en rem (0 à 1,5).
    pub radius: f64,
}

/// Ligne de la table `packages`.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PackageRow {
    pub id: String,
    pub owner_id: String,
    pub package_id: String,
    pub package_type: PackageType,
    pub name: String,
    pub description: String,
    pub version: String,
    pub data: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Package tel qu'envoyé à l'interface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPackage {
    pub id: String,
    pub package_id: String,
    #[serde(rename = "type")]
    pub package_type: PackageType,
    pub name: String,
    pub description: String,
    pub version: String,
    /// Nom d'utilisateur de l'auteur.
    pub author: String,
    pub theme: ThemeData,
    pub created_at: String,
    pub updated_at: String,
}
