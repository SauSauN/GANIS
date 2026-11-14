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
    let rows: Vec<(String, i64, i64)> = sqlx::query_as("SELECT module, show_story, show_plot FROM sheet_display").fetch_all(pool).await?;
    Ok(MODULES
        .iter()
        .map(|module| {
            let row = rows.iter().find(|(m, _, _)| m == module);
            SheetDisplay {
                module: (*module).to_owned(),
                show_story: row.is_some_and(|(_, story, _)| *story != 0),
                show_plot: row.is_some_and(|(_, _, plot)| *plot != 0),
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
    Ok(SheetDisplay { module: module.to_owned(), show_story, show_plot })
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
}
