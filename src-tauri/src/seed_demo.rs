//! Création des projets d'exemple en ligne de commande, sans ouvrir GANIS.
//!
//! Moteur : `services::demo_service`, dans l'**espace public** (projets ouvrables
//! sans compte, bouton « Commencer »). Si l'exemple y existe déjà, rien
//! n'est créé ni modifié.
//!
//! ## Lancer
//!
//! **Fermez GANIS d'abord**, puis, depuis la racine du dépôt :
//!
//! ```text
//! npm run seed:roman
//! npm run seed:manga
//! ```
//!
//! (ou, dans `src-tauri` : `cargo test --lib seed_demo_roman -- --ignored --nocapture`).
//!
//! Le dossier de données est celui de l'application installée (Windows :
//! `%APPDATA%\app.ganis.studio`, macOS : `~/Library/Application Support/
//! app.ganis.studio`, Linux : `~/.local/share/app.ganis.studio`). Pour en
//! choisir un autre (essai, démonstration) : variable `GANIS_DATA_DIR`.

use std::path::PathBuf;

use crate::db;
use crate::services::demo_service;
use crate::state::{AppState, Viewer};

/// Identifiant de l'application (`tauri.conf.json`), nom de son dossier.
const IDENTIFIER: &str = "app.ganis.studio";

/// Dossier de données de GANIS : `GANIS_DATA_DIR`, sinon celui que Tauri
/// utilise sur ce système.
fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("GANIS_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let home = || PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default());
    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| home().join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home().join("Library").join("Application Support")
    } else {
        std::env::var("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|_| home().join(".local").join("share"))
    };
    base.join(IDENTIFIER)
}

async fn seed(demo_id: &str) {
    let dir = data_dir();
    println!("Dossier de données de GANIS : {}", dir.display());
    std::fs::create_dir_all(&dir).expect("dossier de données inaccessible");

    let app_db = db::init_app_db(&dir).await.expect("base de l'application illisible (GANIS est-il fermé ?)");
    let state = AppState::new(app_db.clone(), dir);

    match demo_service::create(&state, &Viewer::Guest, demo_id).await {
        Ok(outcome) if outcome.created => {
            println!("Projet d'exemple créé : « {} » ({}).", outcome.project.name, outcome.project.id);
            println!("Ouvrez GANIS, cliquez sur « Commencer » : il est dans l'espace public.");
        }
        Ok(outcome) => {
            println!("« {} » existe déjà dans l'espace public : rien n'a été modifié.", outcome.project.name);
            println!("Pour le recréer : mettez-le à la corbeille dans GANIS, puis relancez cette commande.");
        }
        Err(error) => panic!("Échec : {error} ({})", error.detail().unwrap_or_default()),
    }

    state.close_project_pools().await;
    app_db.close().await;
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "crée un projet dans le dossier de données de GANIS ; à lancer à la main"]
async fn seed_demo_roman() {
    seed("roman").await;
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "crée un projet dans le dossier de données de GANIS ; à lancer à la main"]
async fn seed_demo_manga() {
    seed("manga").await;
}
