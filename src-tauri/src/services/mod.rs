//! Module de services métier.
//!
//! Contient la logique applicative qui n'est pas directement liée à l'interface
//! ou aux commandes Tauri. Les services sont utilisés par les commandes.

pub mod auth_service;
pub mod session_service;
pub mod user_service;