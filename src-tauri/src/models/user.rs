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
}

/// Profil d'auteur : informations facultatives ajoutées au compte.
///
/// Stocké chiffré (JSON) dans `users.profile_sealed`, déchiffré dans la
/// session. Un champ vide n'est pas renseigné.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AuthorProfile {
    /// Nom d'auteur (nom de plume), tel qu'il apparaît sur les œuvres.
    pub pen_name: String,
    /// Nom complet (prénom et nom).
    pub full_name: String,
    /// Site web ou réseau social.
    pub website: String,
    /// Courte biographie.
    pub bio: String,
}

impl AuthorProfile {
    /// Longueurs maximales (en caractères).
    pub const MAX_NAME: usize = 100;
    pub const MAX_WEBSITE: usize = 200;
    pub const MAX_BIO: usize = 1000;

    /// Aucun champ renseigné.
    pub fn is_empty(&self) -> bool {
        self.pen_name.is_empty() && self.full_name.is_empty() && self.website.is_empty() && self.bio.is_empty()
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
    /// E-mail en clair.
    ///
    /// En base, cette colonne reste vide pour les comptes chiffrés : l'adresse
    /// est dans `email_sealed`. Dans la session (`AppState`), elle contient
    /// l'adresse déchiffrée.
    pub email: Option<String>,

    /// E-mail chiffré avec la clé du compte (jamais envoyé à l'interface).
    #[serde(skip)]
    #[sqlx(default)]
    pub email_sealed: Option<String>,

    /// Profil d'auteur chiffré avec la clé du compte (jamais envoyé à l'interface).
    #[serde(skip)]
    #[sqlx(default)]
    pub profile_sealed: Option<String>,

    /// Profil d'auteur déchiffré (session seulement ; jamais lu tel quel en base).
    #[serde(skip)]
    #[sqlx(skip)]
    pub profile: AuthorProfile,

    pub role: Role,

    #[serde(skip_serializing)]
    pub password_hash: String,

    /// Colonne remplie à la création ; le sel est aussi contenu dans `password_hash`.
    #[serde(skip_serializing)]
    #[allow(dead_code)]
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

    /// Profil d'auteur (déchiffré). Nom JSON/frontend : `profile`.
    #[serde(default)]
    pub profile: AuthorProfile,

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
            profile: user.profile,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}
