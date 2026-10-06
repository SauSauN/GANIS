//! Modèle de données pour les sessions utilisateur.

use serde::{Deserialize, Serialize};

/// Représente une session utilisateur active.
///
/// Le jeton de session n'est jamais stocké en clair : seul son hachage
/// SHA-256 est conservé en base de données.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub token_hash: String,
    pub expires_at: i64,
    pub created_at: String,
}

impl Session {
    /// Vérifie si la session est expirée par rapport à un timestamp Unix.
    pub fn is_expired(&self, now: i64) -> bool {
        self.expires_at <= now
    }
}