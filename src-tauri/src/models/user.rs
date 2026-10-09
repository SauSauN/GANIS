//! Modèle de données pour les utilisateurs de l'application.

use serde::{Deserialize, Serialize};

/// Rôle d'un utilisateur dans l'application.
///
/// Le rôle détermine les privilèges et les actions autorisées.
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
pub enum Role {
    /// Administrateur : gestion des comptes et paramètres généraux.
    Admin,

    /// Développeur : accès aux outils de diagnostic et de test.
    Developer,

    /// Utilisateur standard : création et gestion de ses projets.
    User,
}

impl Default for Role {
    fn default() -> Self {
        Role::User
    }
}

impl Role {
    /// Retourne la représentation textuelle du rôle
    /// utilisée par la base de données.
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Developer => "developer",
            Role::User => "user",
        }
    }

    /// Convertit une chaîne en rôle.
    ///
    /// Toute valeur inconnue est considérée comme `User`.
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "admin" => Role::Admin,
            "developer" => Role::Developer,
            _ => Role::User,
        }
    }
}

/// Représente un utilisateur dans la base de données de l'application.
///
/// `password_hash` et `password_salt` ne sont jamais sérialisés
/// vers le frontend.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: Role,

    #[serde(skip_serializing)]
    pub password_hash: String,

    #[serde(skip_serializing)]
    pub password_salt: String,

    /// Nom SQL : `created_at`
    ///
    /// Nom JSON/frontend : `createdAt`
    #[serde(rename = "createdAt")]
    #[sqlx(rename = "created_at")]
    pub created_at: String,

    /// Nom SQL : `updated_at`
    ///
    /// Nom JSON/frontend : `updatedAt`
    #[serde(rename = "updatedAt")]
    #[sqlx(rename = "updated_at")]
    pub updated_at: String,
}

/// Version publique d'un utilisateur.
///
/// Cette structure est utilisée lorsque le backend doit explicitement
/// exposer uniquement les informations publiques d'un utilisateur.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: Role,

    /// Nom JSON/frontend : `createdAt`.
    #[serde(rename = "createdAt")]
    pub created_at: String,

    /// Nom JSON/frontend : `updatedAt`.
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

impl From<User> for UserPublic {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}
