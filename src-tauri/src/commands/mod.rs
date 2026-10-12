//! Module des commandes Tauri.
//!
//! Chaque sous-module expose des fonctions `#[tauri::command]` qui sont
//! enregistrées dans `lib.rs`.

pub mod auth;
pub mod character_locations;
pub mod characters;
pub mod diagnostics;
pub mod ganix;
pub mod locations;
pub mod notes;
pub mod packages;
pub mod projects;
pub mod relations;
pub mod structure;
pub mod structure_links;
pub mod synopsis;
pub mod users;