//! Planches d'inspiration (voir la migration `047_arcs_boards.sql`).
//!
//! Une planche a un nom et une place dans la liste ; ses éléments (images de
//! la galerie, palettes, citations, notes, titres, avec leur position) sont
//! un document JSON mis en forme par l'interface (`src/lib/boards.ts`) et
//! envoyé entier. Rust vérifie que c'est un objet JSON de taille raisonnable.
//! Une image de la galerie supprimée depuis est ignorée par l'interface.

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};

/// Taille maximale des éléments d'une planche (2 Mo de JSON : les images
/// n'y sont que désignées, jamais copiées).
const MAX_BOARD_BYTES: usize = 2 * 1024 * 1024;
const MAX_NAME_CHARS: usize = 100;
/// Nombre maximal de planches par projet.
const MAX_BOARDS: i64 = 200;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub position: i64,
    /// Document JSON des éléments ; vide pour une planche neuve.
    pub data: String,
    pub created_at: String,
    pub updated_at: String,
}

const COLUMNS: &str = "id, name, position, data, created_at, updated_at";

fn not_found() -> AppError {
    AppError::not_found("Cette planche n'existe plus.").with_key("boards.notFound")
}

fn clean_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("Le nom de la planche ne peut pas être vide.").with_key("boards.nameEmpty"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation("Nom trop long.").with_key("boards.nameTooLong").with_param("max", MAX_NAME_CHARS));
    }
    Ok(name.to_owned())
}

/// Vérifie les éléments : un objet JSON, 2 Mo au plus.
pub fn validate(data: &str) -> AppResult<()> {
    if data.len() > MAX_BOARD_BYTES {
        return Err(AppError::validation("La planche dépasse 2 Mo.").with_key("boards.tooLarge"));
    }
    match serde_json::from_str::<Value>(data) {
        Ok(Value::Object(_)) => Ok(()),
        _ => Err(AppError::validation("La planche reçue est illisible.").with_key("boards.invalid")),
    }
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Board>> {
    Ok(sqlx::query_as::<_, Board>(&format!("SELECT {COLUMNS} FROM inspiration_boards ORDER BY position, created_at"))
        .fetch_all(pool)
        .await?)
}

async fn get(pool: &SqlitePool, id: &str) -> AppResult<Board> {
    sqlx::query_as::<_, Board>(&format!("SELECT {COLUMNS} FROM inspiration_boards WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(not_found)
}

/// Nouvelle planche, vide, à la fin de la liste.
pub async fn create(pool: &SqlitePool, name: &str) -> AppResult<Board> {
    let name = clean_name(name)?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM inspiration_boards").fetch_one(pool).await?;
    if count >= MAX_BOARDS {
        return Err(AppError::validation("Trop de planches.").with_key("boards.tooMany").with_param("max", MAX_BOARDS));
    }
    let position: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(position), -1) + 1 FROM inspiration_boards")
        .fetch_one(pool)
        .await?;
    let id = new_id();
    let now = now_utc();
    sqlx::query("INSERT INTO inspiration_boards (id, name, position, data, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(position)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;
    get(pool, &id).await
}

pub async fn rename(pool: &SqlitePool, id: &str, name: &str) -> AppResult<Board> {
    let name = clean_name(name)?;
    let result = sqlx::query("UPDATE inspiration_boards SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    get(pool, id).await
}

/// Enregistre les éléments d'une planche ; renvoie l'heure d'enregistrement.
pub async fn save_items(pool: &SqlitePool, id: &str, data: &str) -> AppResult<String> {
    validate(data)?;
    let now = now_utc();
    let result = sqlx::query("UPDATE inspiration_boards SET data = ?, updated_at = ? WHERE id = ?")
        .bind(data)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    Ok(now)
}

/// Supprime définitivement une planche (ses images restent dans la galerie).
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM inspiration_boards WHERE id = ?").bind(id).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    Ok(())
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
    async fn boards_lifecycle() {
        let pool = pool().await;
        assert!(create(&pool, "   ").await.is_err());
        assert!(create(&pool, &"x".repeat(MAX_NAME_CHARS + 1)).await.is_err());

        let a = create(&pool, "  Ton général  ").await.unwrap();
        let b = create(&pool, "La Forge").await.unwrap();
        assert_eq!(a.name, "Ton général");
        assert_eq!((a.position, b.position), (0, 1));
        assert_eq!(a.data, "");

        let renamed = rename(&pool, &b.id, "Forge des Cendres").await.unwrap();
        assert_eq!(renamed.name, "Forge des Cendres");
        assert!(rename(&pool, "absent", "x").await.is_err());

        assert!(save_items(&pool, &a.id, "[]").await.is_err());
        save_items(&pool, &a.id, r#"{"items":[{"kind":"note","text":"Cloches fêlées"}]}"#).await.unwrap();
        assert!(save_items(&pool, "absent", "{}").await.is_err());

        let all = list(&pool).await.unwrap();
        assert_eq!(all.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec![a.id.as_str(), b.id.as_str()]);
        assert!(all[0].data.contains("Cloches"));

        delete(&pool, &a.id).await.unwrap();
        assert!(delete(&pool, &a.id).await.is_err());
        assert_eq!(list(&pool).await.unwrap().len(), 1);
    }
}
