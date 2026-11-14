//! Logo du projet et galerie de l'univers (base du projet).
//!
//! Le logo est unique (`project_logo`, une ligne au plus). La galerie
//! (`project_images`) rassemble les images liées à l'univers et à
//! l'histoire : affiches, cartes du monde, ambiances, croquis…

use crate::error::{AppError, AppResult};
use crate::services::character_service::{decode_image, Portrait};
use crate::utils::{new_id, now_utc};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;
use sqlx::SqlitePool;

/// Nombre maximal d'images dans la galerie du projet.
pub const MAX_GALLERY_IMAGES: i64 = 30;

/// Longueur maximale d'une légende d'image.
const MAX_CAPTION_CHARS: usize = 200;

/// Image de la galerie du projet, sans son contenu.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImage {
    pub id: String,
    pub caption: Option<String>,
    pub created_at: String,
}

fn image_not_found() -> AppError {
    AppError::not_found("Image introuvable.").with_key("project.imageNotFound")
}

fn clean_caption(caption: Option<&str>) -> AppResult<Option<String>> {
    let caption = caption.map(str::trim).filter(|value| !value.is_empty());

    if caption.is_some_and(|value| value.chars().count() > MAX_CAPTION_CHARS) {
        return Err(AppError::validation("La légende est trop longue.")
            .with_key("project.captionTooLong")
            .with_param("max", MAX_CAPTION_CHARS));
    }

    Ok(caption.map(str::to_owned))
}

// ----------------------------------------------------------------------------
// Logo
// ----------------------------------------------------------------------------

/// Logo du projet (`None` : il n'en a pas).
pub async fn get_logo(pool: &SqlitePool) -> AppResult<Option<Portrait>> {
    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT mime, data, updated_at FROM project_logo WHERE id = 1")
            .fetch_optional(pool)
            .await?;

    Ok(row.map(|(mime, data, updated_at)| Portrait { mime, data: BASE64.encode(data), updated_at }))
}

/// Remplace le logo. `data` : image encodée en base64.
pub async fn set_logo(pool: &SqlitePool, data: &str) -> AppResult<Portrait> {
    let (bytes, mime) = decode_image(data)?;
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO project_logo (id, mime, data, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE
        SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at
        "#,
    )
    .bind(mime)
    .bind(&bytes)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(Portrait { mime: mime.to_owned(), data: BASE64.encode(bytes), updated_at: now })
}

/// Retire le logo (sans erreur s'il n'y en a pas).
pub async fn remove_logo(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM project_logo WHERE id = 1").execute(pool).await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Galerie de l'univers
// ----------------------------------------------------------------------------

/// Images de la galerie (sans leur contenu), dans l'ordre.
pub async fn list_gallery(pool: &SqlitePool) -> AppResult<Vec<ProjectImage>> {
    Ok(sqlx::query_as::<_, ProjectImage>(
        "SELECT id, caption, created_at FROM project_images ORDER BY position, created_at",
    )
    .fetch_all(pool)
    .await?)
}

/// Contenu d'une image de la galerie.
pub async fn get_gallery_image(pool: &SqlitePool, image_id: &str) -> AppResult<Portrait> {
    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT mime, data, created_at FROM project_images WHERE id = ?")
            .bind(image_id)
            .fetch_optional(pool)
            .await?;

    row.map(|(mime, data, updated_at)| Portrait { mime, data: BASE64.encode(data), updated_at })
        .ok_or_else(image_not_found)
}

/// Ajoute une image à la fin de la galerie.
pub async fn add_gallery_image(
    pool: &SqlitePool,
    data: &str,
    caption: Option<&str>,
) -> AppResult<ProjectImage> {
    let (bytes, mime) = decode_image(data)?;
    let caption = clean_caption(caption)?;
    let id = new_id();
    let now = now_utc();

    // Comptage et ajout dans la même requête : la limite ne peut pas être
    // dépassée par deux ajouts simultanés.
    let result = sqlx::query(
        r#"
        INSERT INTO project_images (id, mime, data, caption, position, created_at)
        SELECT ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?
        FROM project_images
        HAVING COUNT(*) < ?
        "#,
    )
    .bind(&id)
    .bind(mime)
    .bind(&bytes)
    .bind(&caption)
    .bind(&now)
    .bind(MAX_GALLERY_IMAGES)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::validation("La galerie est pleine.")
            .with_key("project.galleryFull")
            .with_param("max", MAX_GALLERY_IMAGES));
    }

    Ok(ProjectImage { id, caption, created_at: now })
}

/// Change la légende d'une image.
pub async fn set_gallery_caption(
    pool: &SqlitePool,
    image_id: &str,
    caption: Option<&str>,
) -> AppResult<()> {
    let caption = clean_caption(caption)?;

    let result = sqlx::query("UPDATE project_images SET caption = ? WHERE id = ?")
        .bind(&caption)
        .bind(image_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(image_not_found());
    }

    Ok(())
}

/// Supprime une image de la galerie.
pub async fn delete_gallery_image(pool: &SqlitePool, image_id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM project_images WHERE id = ?")
        .bind(image_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(image_not_found());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();

        pool
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 0];

    fn png() -> String {
        BASE64.encode(PNG)
    }

    #[tokio::test]
    async fn logo_is_set_replaced_and_removed() {
        let pool = pool().await;

        assert!(get_logo(&pool).await.unwrap().is_none());

        set_logo(&pool, &png()).await.unwrap();
        set_logo(&pool, &png()).await.unwrap();

        let logo = get_logo(&pool).await.unwrap().unwrap();
        assert_eq!(logo.mime, "image/png");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_logo")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);

        remove_logo(&pool).await.unwrap();
        assert!(get_logo(&pool).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn logo_rejects_non_images() {
        let pool = pool().await;
        assert!(set_logo(&pool, &BASE64.encode(b"pas une image")).await.is_err());
    }

    #[tokio::test]
    async fn gallery_images_are_added_captioned_and_deleted() {
        let pool = pool().await;

        let first = add_gallery_image(&pool, &png(), Some("  Carte du monde  ")).await.unwrap();
        let second = add_gallery_image(&pool, &png(), None).await.unwrap();

        assert_eq!(first.caption.as_deref(), Some("Carte du monde"));

        let list = list_gallery(&pool).await.unwrap();
        assert_eq!(list.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), [first.id.as_str(), second.id.as_str()]);

        set_gallery_caption(&pool, &second.id, Some("Affiche")).await.unwrap();
        assert_eq!(list_gallery(&pool).await.unwrap()[1].caption.as_deref(), Some("Affiche"));

        assert_eq!(get_gallery_image(&pool, &first.id).await.unwrap().mime, "image/png");

        delete_gallery_image(&pool, &first.id).await.unwrap();
        assert_eq!(list_gallery(&pool).await.unwrap().len(), 1);
        assert!(delete_gallery_image(&pool, &first.id).await.is_err());
        assert!(get_gallery_image(&pool, &first.id).await.is_err());
    }

    #[tokio::test]
    async fn gallery_is_limited() {
        let pool = pool().await;

        for _ in 0..MAX_GALLERY_IMAGES {
            add_gallery_image(&pool, &png(), None).await.unwrap();
        }

        assert!(add_gallery_image(&pool, &png(), None).await.is_err());
    }
}
