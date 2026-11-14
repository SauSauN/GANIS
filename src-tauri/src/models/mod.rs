//! Modèles de données pour l'application GANIS.
//!
//! Ce module centralise les exports des différents modèles utilisés
//! par l'application (utilisateurs, projets, etc.).

pub mod package;
pub mod project;
pub mod user;

#[allow(unused_imports)]
pub use project::{Project, ProjectStatus, ProjectType};

#[allow(unused_imports)]
pub use user::{Role, User};
