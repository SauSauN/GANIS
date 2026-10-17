//! Trame du projet : plateau vertical des intrigues parallèles (voir la
//! migration `020_plot.sql`).
//!
//! La trame est enregistrée d'un bloc, en JSON : l'interface la met en forme
//! (`src/lib/plot.ts`) et l'envoie entière à chaque enregistrement. Rust
//! vérifie seulement que c'est bien un objet JSON de taille raisonnable ;
//! chaque enregistrement est inscrit au journal et une version est gardée
//! au début de chaque séance de travail (voir `history_service`).

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::utils::now_utc;

/// Taille maximale de la trame enregistrée (20 Mo de JSON).
const MAX_PLOT_BYTES: usize = 20 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Plot {
    /// Document JSON de la trame ; vide tant qu'elle n'a jamais été ouverte.
    pub data: String,
    pub updated_at: String,
}

fn invalid() -> AppError {
    AppError::validation("La trame reçue est illisible.").with_key("plot.invalid")
}

pub async fn get(pool: &SqlitePool) -> AppResult<Plot> {
    let plot = sqlx::query_as::<_, Plot>("SELECT data, updated_at FROM plot WHERE id = 'default'")
        .fetch_optional(pool)
        .await?;
    match plot {
        Some(plot) => Ok(plot),
        None => {
            // Ligne absente (base réparée à la main…) : on la recrée.
            let now = now_utc();
            sqlx::query("INSERT OR IGNORE INTO plot (id, data, created_at, updated_at) VALUES ('default', '', ?, ?)")
                .bind(&now)
                .bind(&now)
                .execute(pool)
                .await?;
            Ok(Plot { data: String::new(), updated_at: now })
        }
    }
}

/// Vérifie le document : un objet JSON, 20 Mo au plus.
pub fn validate(data: &str) -> AppResult<()> {
    if data.len() > MAX_PLOT_BYTES {
        return Err(AppError::validation("La trame dépasse 20 Mo.").with_key("plot.tooLarge"));
    }
    match serde_json::from_str::<Value>(data) {
        Ok(Value::Object(_)) => Ok(()),
        _ => Err(invalid()),
    }
}

pub async fn save(pool: &SqlitePool, data: &str) -> AppResult<Plot> {
    validate(data)?;
    get(pool).await?;
    let now = now_utc();
    sqlx::query("UPDATE plot SET data = ?, updated_at = ? WHERE id = 'default'")
        .bind(data)
        .bind(&now)
        .execute(pool)
        .await?;
    Ok(Plot { data: data.to_owned(), updated_at: now })
}

/// Événements de la trame pour la recherche : (identifiant, titre, texte).
pub async fn search_rows(pool: &SqlitePool) -> AppResult<Vec<(String, String, String)>> {
    let data: Option<String> = sqlx::query_scalar("SELECT data FROM plot WHERE id = 'default'")
        .fetch_optional(pool)
        .await?;
    let Some(Ok(Value::Object(root))) = data.filter(|d| !d.is_empty()).map(|d| serde_json::from_str::<Value>(&d)) else {
        return Ok(Vec::new());
    };
    let text = |value: Option<&Value>| value.and_then(Value::as_str).unwrap_or_default().to_owned();

    let mut out = Vec::new();
    if let Some(Value::Array(events)) = root.get("events") {
        for event in events {
            let id = text(event.get("id"));
            if id.is_empty() {
                continue;
            }
            let tags = event
                .get("tags")
                .and_then(Value::as_array)
                .map(|tags| tags.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "))
                .unwrap_or_default();
            let body = format!("{} {} {}", text(event.get("note")), tags, text(event.get("date")));
            out.push((id, text(event.get("title")), body));
        }
    }
    Ok(out)
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
    async fn empty_then_saved_and_searchable() {
        let pool = pool().await;
        assert_eq!(get(&pool).await.unwrap().data, "");

        assert!(save(&pool, "[1,2]").await.is_err());
        assert!(save(&pool, "pas du json").await.is_err());

        let data = r#"{"lanes":[{"id":"l1"}],"events":[{"id":"e1","title":"La lettre cachée","note":"Dans la cheminée","tags":["flash-back"]},{"title":"sans id"}]}"#;
        save(&pool, data).await.unwrap();
        assert_eq!(get(&pool).await.unwrap().data, data);

        let rows = search_rows(&pool).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, "e1");
        assert!(rows[0].2.contains("cheminée") && rows[0].2.contains("flash-back"));
    }

    #[tokio::test]
    async fn missing_row_is_recreated() {
        let pool = pool().await;
        sqlx::query("DELETE FROM plot").execute(&pool).await.unwrap();
        assert_eq!(get(&pool).await.unwrap().data, "");
        save(&pool, "{}").await.unwrap();
    }
}
