//! Modèle de données pour les utilisateurs de l'application.

use serde::{Deserialize, Serialize};

/// Rôle d'un utilisateur dans l'application.
///
/// Le rôle détermine les privilèges et les actions autorisées.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// Administrateur : gestion des comptes, paramètres généraux.
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
    /// Retourne la représentation textuelle du rôle (pour la base de données).
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Developer => "developer",
            Role::User => "user",
        }
    }

    /// Convertit une chaîne en rôle, avec fallback sur `User`.
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
/// Le hash et le sel du mot de passe ne sont **jamais** sérialisés
/// vers l'interface (`#[serde(skip_serializing)]`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: Role,
    #[serde(skip_serializing)]
    pub password_hash: String,
    #[serde(skip_serializing)]
    pub password_salt: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Version allégée d'un utilisateur, exposée à l'interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: Role,
    pub created_at: String,
    pub updated_at: String,
}

impl From<User> for UserPublic {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }
    }
}