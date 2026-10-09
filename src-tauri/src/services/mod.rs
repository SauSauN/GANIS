//! Module des services métier.
//!
//! Les services contiennent la logique applicative utilisée par
//! les commandes Tauri.

pub mod auth_service;
pub mod diagnostics_service;
pub mod keyring_service;
pub mod login_throttle;
pub mod package_service;
pub mod project_service;
pub mod project_storage;
pub mod session_service;
pub mod structure_service;
pub mod synopsis_service;
pub mod user_service;

#[cfg(test)]
mod encryption_tests;
