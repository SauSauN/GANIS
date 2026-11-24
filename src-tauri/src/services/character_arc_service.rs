//! Arcs des personnages (voir la migration `047_arcs_boards.sql`).
//!
//! Un arc est enregistré d'un bloc, en JSON, comme la trame : l'interface
//! le met en forme (`src/lib/arcs.ts`) et l'envoie entier. Rust vérifie
//! seulement que c'est un objet JSON de taille raisonnable. L'arc d'un
//! personnage supprimé reste en place (il revient avec le personnage s'il
//! est restauré depuis la corbeille) ; l'interface l'ignore entre-temps.

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::utils::now_utc;

/// Taille maximale d'un arc (1 Mo de JSON).
const MAX_ARC_BYTES: usize = 1024 * 1024;
const MAX_ID_CHARS: usize = 64;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CharacterArc {
    pub character_id: String,
    /// Document JSON de l'arc.
    pub data: String,
    pub updated_at: String,
}

fn invalid() -> AppError {
    AppError::validation("L'arc reçu est illisible.").with_key("arcs.invalid")
}

/// Vérifie le document : un objet JSON, 1 Mo au plus.
pub fn validate(data: &str) -> AppResult<()> {
    if data.len() > MAX_ARC_BYTES {
        return Err(AppError::validation("L'arc dépasse 1 Mo.").with_key("arcs.tooLarge"));
    }
    match serde_json::from_str::<Value>(data) {
        Ok(Value::Object(_)) => Ok(()),
        _ => Err(invalid()),
    }
}

/// Arcs de tous les personnages qui en ont un.
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<CharacterArc>> {
    Ok(sqlx::query_as::<_, CharacterArc>("SELECT character_id, data, updated_at FROM character_arcs ORDER BY character_id")
        .fetch_all(pool)
        .await?)
}

/// Enregistre l'arc d'un personnage (création ou remplacement).
pub async fn save(pool: &SqlitePool, character_id: &str, data: &str) -> AppResult<CharacterArc> {
    let character_id = character_id.trim();
    if character_id.is_empty() || character_id.chars().count() > MAX_ID_CHARS {
        return Err(invalid());
    }
    validate(data)?;

    let now = now_utc();
    sqlx::query(
        "INSERT INTO character_arcs (character_id, data, updated_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT (character_id) DO UPDATE SET data = ?2, updated_at = ?3",
    )
    .bind(character_id)
    .bind(data)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(CharacterArc { character_id: character_id.to_owned(), data: data.to_owned(), updated_at: now })
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
    async fn arcs_are_saved_replaced_and_checked() {
        let pool = pool().await;
        assert!(list(&pool).await.unwrap().is_empty());

        assert!(save(&pool, "c1", "[1]").await.is_err());
        assert!(save(&pool, "c1", "pas du json").await.is_err());
        assert!(save(&pool, "  ", "{}").await.is_err());
        assert!(save(&pool, "c1", &format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_ARC_BYTES))).await.is_err());

        save(&pool, "c1", r#"{"type":"positive"}"#).await.unwrap();
        save(&pool, "c2", "{}").await.unwrap();
        save(&pool, "c1", r#"{"type":"flat"}"#).await.unwrap();

        let arcs = list(&pool).await.unwrap();
        assert_eq!(arcs.len(), 2);
        assert_eq!(arcs[0].character_id, "c1");
        assert_eq!(arcs[0].data, r#"{"type":"flat"}"#);
    }
}
