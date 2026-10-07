//! Module de gestion de la base de données.
//!
//! Fournit les connexions à la base de l'application (`app.db`) et
//! aux bases de chaque projet (`project.db`), ainsi que les migrations.

pub mod app_db;
pub mod migrations;
pub mod project_db;

pub use app_db::init_app_db;

#[allow(unused_imports)]
pub use project_db::init_project_db;