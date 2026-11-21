//! Affichage des sections « Récit » et « Trame » sur les fiches d'un module
//! (migration `034_sheet_display.sql`). Réglage du projet : il ne change
//! que l'affichage des fiches, jamais les données.
//!
//! Par défaut, les deux sections sont masquées : un module sans ligne dans
//! la table ne les montre pas (les valeurs par défaut des colonnes ne
//! servent pas, `set` écrit toujours les deux).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::utils::now_utc;

/// Modules dont les fiches ont les sections « Récit » et « Trame ».
pub const MODULES: [&str; 7] = ["character", "location", "item", "species", "faction", "people", "magic"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetDisplay {
    pub module: String,
    pub show_story: bool,
    pub show_plot: bool,
    /// Panneau du milieu en arborescence (vrai, par défaut) ou en simple
    /// liste (migration `041_panel_tree.sql`).
    pub panel_tree: bool,
}

fn check(module: &str) -> AppResult<()> {
    if MODULES.contains(&module) {
        Ok(())
    } else {
        Err(AppError::validation("Module inconnu.").with_key("sheets.invalidModule"))
    }
}

/// Réglage de chaque module ; les deux sections sont masquées par défaut.
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<SheetDisplay>> {
    let rows: Vec<(String, i64, i64, i64)> =
        sqlx::query_as("SELECT module, show_story, show_plot, panel_tree FROM sheet_display").fetch_all(pool).await?;
    Ok(MODULES
        .iter()
        .map(|module| {
            let row = rows.iter().find(|(m, _, _, _)| m == module);
            SheetDisplay {
                module: (*module).to_owned(),
                show_story: row.is_some_and(|(_, story, _, _)| *story != 0),
                show_plot: row.is_some_and(|(_, _, plot, _)| *plot != 0),
                // Pas de ligne : arborescence (défaut).
                panel_tree: row.is_none_or(|(_, _, _, tree)| *tree != 0),
            }
        })
        .collect())
}

pub async fn set(pool: &SqlitePool, module: &str, show_story: bool, show_plot: bool) -> AppResult<SheetDisplay> {
    check(module)?;
    sqlx::query(
        "INSERT INTO sheet_display (module, show_story, show_plot, updated_at) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT (module) DO UPDATE SET show_story = ?2, show_plot = ?3, updated_at = ?4",
    )
    .bind(module)
    .bind(show_story)
    .bind(show_plot)
    .bind(now_utc())
    .execute(pool)
    .await?;
    get(pool, module).await
}

/// Modules dont les fiches peuvent en contenir d'autres : le panneau du
/// milieu peut les montrer en arborescence.
pub const TREE_MODULES: [&str; 6] = ["location", "item", "species", "faction", "people", "magic"];

/// Panneau du milieu en arborescence ou en simple liste, pour un module.
/// Les sections « Récit » et « Trame » ne changent pas (masquées si le
/// module n'avait pas encore de réglage : ce n'est pas le défaut de la table).
pub async fn set_panel_tree(pool: &SqlitePool, module: &str, tree: bool) -> AppResult<SheetDisplay> {
    if !TREE_MODULES.contains(&module) {
        return Err(AppError::validation("Module inconnu.").with_key("sheets.invalidModule"));
    }
    sqlx::query(
        "INSERT INTO sheet_display (module, show_story, show_plot, panel_tree, updated_at) VALUES (?1, 0, 0, ?2, ?3) \
         ON CONFLICT (module) DO UPDATE SET panel_tree = ?2, updated_at = ?3",
    )
    .bind(module)
    .bind(tree)
    .bind(now_utc())
    .execute(pool)
    .await?;
    get(pool, module).await
}

async fn get(pool: &SqlitePool, module: &str) -> AppResult<SheetDisplay> {
    list(pool)
        .await?
        .into_iter()
        .find(|d| d.module == module)
        .ok_or_else(|| AppError::validation("Module inconnu.").with_key("sheets.invalidModule"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn hidden_by_default_then_saved_per_module() {
        let pool = pool().await;
        let all = list(&pool).await.unwrap();
        assert_eq!(all.len(), MODULES.len());
        assert!(all.iter().all(|d| !d.show_story && !d.show_plot));

        set(&pool, "character", true, true).await.unwrap();
        set(&pool, "character", false, true).await.unwrap();
        let all = list(&pool).await.unwrap();
        let character = all.iter().find(|d| d.module == "character").unwrap();
        let location = all.iter().find(|d| d.module == "location").unwrap();
        assert_eq!((character.show_story, character.show_plot), (false, true));
        assert_eq!((location.show_story, location.show_plot), (false, false));

        assert!(set(&pool, "plot", false, false).await.is_err());
        set(&pool, "magic", true, false).await.unwrap();
    }

    #[tokio::test]
    async fn the_panel_is_a_tree_by_default_and_the_choice_keeps_the_sections() {
        let pool = pool().await;
        assert!(list(&pool).await.unwrap().iter().all(|d| d.panel_tree));

        // Premier réglage du module : les sections restent masquées (le défaut).
        let saved = set_panel_tree(&pool, "location", false).await.unwrap();
        assert_eq!((saved.panel_tree, saved.show_story, saved.show_plot), (false, false, false));

        // Les sections changent, l'arborescence reste ; et inversement.
        set(&pool, "location", true, true).await.unwrap();
        let saved = list(&pool).await.unwrap().into_iter().find(|d| d.module == "location").unwrap();
        assert_eq!((saved.panel_tree, saved.show_story, saved.show_plot), (false, true, true));
        let saved = set_panel_tree(&pool, "location", true).await.unwrap();
        assert_eq!((saved.panel_tree, saved.show_story, saved.show_plot), (true, true, true));

        // Les personnages n'ont pas d'arborescence.
        assert!(set_panel_tree(&pool, "character", false).await.is_err());
    }
}
