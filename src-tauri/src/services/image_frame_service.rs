//! Cadrage des images (migration `040_image_frames.sql`) : la zone affichée
//! d'une image, sans toucher à l'image elle-même.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::utils::now_utc;

pub const MAX_ZOOM: f64 = 5.0;
const MAX_KEY_CHARS: usize = 200;

/// Cadrage d'une image.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

/// Cadrage d'une image, avec la clé de l'image.
#[derive(Debug, Clone, PartialEq, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ImageFrame {
    pub key: String,
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

fn invalid() -> AppError {
    AppError::validation("Cadrage invalide.").with_key("imageFrame.invalid")
}

/// Tous les cadrages du projet.
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<ImageFrame>> {
    Ok(sqlx::query_as::<_, ImageFrame>("SELECT key, x, y, zoom FROM image_frames ORDER BY key").fetch_all(pool).await?)
}

/// Enregistre le cadrage d'une image ; `None` (ou un cadrage neutre) le
/// retire : l'image est de nouveau centrée, sans zoom.
pub async fn set(pool: &SqlitePool, key: &str, frame: Option<Frame>) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() || key.chars().count() > MAX_KEY_CHARS || !key.contains(':') {
        return Err(invalid());
    }
    let Some(frame) = frame else {
        sqlx::query("DELETE FROM image_frames WHERE key = ?").bind(key).execute(pool).await?;
        return Ok(());
    };
    let in_range = |v: f64, min: f64, max: f64| v.is_finite() && (min..=max).contains(&v);
    if !in_range(frame.x, 0.0, 100.0) || !in_range(frame.y, 0.0, 100.0) || !in_range(frame.zoom, 1.0, MAX_ZOOM) {
        return Err(invalid());
    }
    let neutral = (frame.x - 50.0).abs() < 0.01 && (frame.y - 50.0).abs() < 0.01 && (frame.zoom - 1.0).abs() < 0.001;
    if neutral {
        sqlx::query("DELETE FROM image_frames WHERE key = ?").bind(key).execute(pool).await?;
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO image_frames (key, x, y, zoom, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT (key) DO UPDATE SET x = ?2, y = ?3, zoom = ?4, updated_at = ?5",
    )
    .bind(key)
    .bind(frame.x)
    .bind(frame.y)
    .bind(frame.zoom)
    .bind(now_utc())
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn frames_are_saved_replaced_and_reset() {
        let pool = pool().await;
        set(&pool, "character:lea", Some(Frame { x: 30.0, y: 20.0, zoom: 2.0 })).await.unwrap();
        set(&pool, "character:lea", Some(Frame { x: 40.0, y: 25.0, zoom: 1.5 })).await.unwrap();
        set(&pool, "image:abc", Some(Frame { x: 50.0, y: 10.0, zoom: 1.0 })).await.unwrap();
        assert_eq!(
            list(&pool).await.unwrap(),
            vec![
                ImageFrame { key: "character:lea".into(), x: 40.0, y: 25.0, zoom: 1.5 },
                ImageFrame { key: "image:abc".into(), x: 50.0, y: 10.0, zoom: 1.0 },
            ]
        );
        // Cadrage neutre ou retiré : plus de ligne.
        set(&pool, "character:lea", Some(Frame { x: 50.0, y: 50.0, zoom: 1.0 })).await.unwrap();
        set(&pool, "image:abc", None).await.unwrap();
        assert!(list(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn refuses_invalid_frames_and_keys() {
        let pool = pool().await;
        for frame in [
            Frame { x: -1.0, y: 50.0, zoom: 1.0 },
            Frame { x: 50.0, y: 101.0, zoom: 1.0 },
            Frame { x: 50.0, y: 50.0, zoom: 0.5 },
            Frame { x: 50.0, y: 50.0, zoom: MAX_ZOOM + 1.0 },
            Frame { x: f64::NAN, y: 50.0, zoom: 1.0 },
        ] {
            assert!(set(&pool, "character:lea", Some(frame)).await.is_err(), "{frame:?}");
        }
        assert!(set(&pool, "", Some(Frame { x: 10.0, y: 10.0, zoom: 1.0 })).await.is_err());
        assert!(set(&pool, "sans-deux-points", Some(Frame { x: 10.0, y: 10.0, zoom: 1.0 })).await.is_err());
    }
}
