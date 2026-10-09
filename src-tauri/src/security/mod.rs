//! Sécurité des données : chiffrement et clés.
//!
//! # Organisation des clés
//!
//! ```text
//! mot de passe ──(Argon2id)──┐
//!                            ├─► verrous ─► clé du compte ─┬─► clé du projet A ─► project.db (SQLCipher)
//! clé de récupération ───────┘                             ├─► clé du projet B ─► project.db (SQLCipher)
//!                                                          └─► e-mail, nom et description des projets
//! ```
//!
//! - Chaque compte a une **clé de compte** aléatoire. Elle n'est jamais
//!   écrite en clair : elle est enfermée dans plusieurs **verrous**
//!   (`user_key_slots`), un par façon de l'ouvrir. Aujourd'hui : le mot de
//!   passe et la clé de récupération. Demain, un verrou « serveur » pourra
//!   s'ajouter sans toucher aux projets.
//! - Chaque projet a sa propre **clé de projet**, enfermée par la clé du
//!   compte (`projects.wrapped_key`). Elle chiffre toute la base du projet
//!   avec SQLCipher.
//! - Les données personnelles de la base de l'application (e-mail, nom et
//!   description des projets) sont chiffrées champ par champ avec la clé
//!   du compte.
//!
//! Changer de mot de passe ou de clé de récupération ne remplace qu'un
//! verrou : aucune donnée n'est rechiffrée.
//!
//! La clé du compte n'existe en mémoire que pendant la session
//! (`AppState::account_key`) et en est effacée à la déconnexion.

pub mod crypto;
pub mod recovery_key;

/// Contextes de chiffrement (AAD).
///
/// Ils lient chaque donnée chiffrée à son emplacement exact : recopier une
/// valeur chiffrée sur une autre ligne ou dans une autre colonne la rend
/// indéchiffrable.
pub mod aad {
    /// Verrou d'une clé de compte.
    pub fn key_slot(user_id: &str, kind: &str) -> String {
        format!("ganis/v1/key-slot/{user_id}/{kind}")
    }

    /// Clé d'un projet, enfermée par la clé du compte.
    pub fn project_key(project_id: &str) -> String {
        format!("ganis/v1/project-key/{project_id}")
    }

    /// Champ chiffré d'une table de la base de l'application.
    pub fn field(table: &str, column: &str, row_id: &str) -> String {
        format!("ganis/v1/field/{table}.{column}/{row_id}")
    }
}
