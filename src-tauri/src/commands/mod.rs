//! Module des commandes Tauri.
//!
//! Chaque sous-module expose des fonctions `#[tauri::command]` qui sont
//! enregistrées dans `lib.rs`.

pub mod auth;
pub mod diagnostics;
pub mod packages;
pub mod projects;
pub mod structure;
pub mod synopsis;
pub mod users;
