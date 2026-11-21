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

/// Nombre maximal d'images **par dossier** de la galerie (« Sans dossier »
/// compris). Le nombre de dossiers n'est pas limité.
pub const MAX_GALLERY_IMAGES: i64 = 30;

/// Longueur maximale du nom (légende) d'une image.
const MAX_CAPTION_CHARS: usize = 200;

/// Longueur maximale de la description d'une image.
const MAX_DESCRIPTION_CHARS: usize = 2000;

/// Longueur maximale du nom d'un dossier.
const MAX_FOLDER_NAME_CHARS: usize = 100;

/// Image de la galerie du projet, sans son contenu.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImage {
    pub id: String,
    /// Nom de l'image.
    pub caption: Option<String>,
    /// Description libre.
    pub description: Option<String>,
    /// Dossier où l'image est rangée (`None` : à la racine de la galerie).
    pub folder_id: Option<String>,
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

/// Texte facultatif nettoyé (espaces retirés, vide = `None`), avec une longueur maximale.
fn clean_text(value: Option<&str>, max: usize, key: &'static str, message: &str) -> AppResult<Option<String>> {
    let value = value.map(str::trim).filter(|value| !value.is_empty());

    if value.is_some_and(|value| value.chars().count() > max) {
        return Err(AppError::validation(message.to_owned()).with_key(key).with_param("max", max));
    }

    Ok(value.map(str::to_owned))
}

fn clean_description(description: Option<&str>) -> AppResult<Option<String>> {
    clean_text(description, MAX_DESCRIPTION_CHARS, "project.descriptionTooLong", "La description est trop longue.")
}

/// Dossier de la galerie (et sous-dossier, par `parent_id`).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GalleryFolder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn folder_full() -> AppError {
    AppError::validation("Ce dossier est plein.")
        .with_key("project.galleryFull")
        .with_param("max", MAX_GALLERY_IMAGES)
}

fn folder_not_found() -> AppError {
    AppError::not_found("Dossier introuvable.").with_key("project.galleryFolderNotFound")
}

fn clean_folder_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("Le nom du dossier ne peut pas être vide.").with_key("project.galleryFolderNameEmpty"));
    }
    if name.chars().count() > MAX_FOLDER_NAME_CHARS {
        return Err(AppError::validation("Nom de dossier trop long.")
            .with_key("project.galleryFolderNameTooLong")
            .with_param("max", MAX_FOLDER_NAME_CHARS));
    }
    Ok(name.to_owned())
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
// Dossiers de la galerie
// ----------------------------------------------------------------------------

const FOLDER_COLUMNS: &str = "id, parent_id, name, position, created_at, updated_at";

/// Tous les dossiers de la galerie.
pub async fn list_folders(pool: &SqlitePool) -> AppResult<Vec<GalleryFolder>> {
    let sql = format!("SELECT {FOLDER_COLUMNS} FROM gallery_folders ORDER BY position, name");
    Ok(sqlx::query_as::<_, GalleryFolder>(&sql).fetch_all(pool).await?)
}

async fn find_folder(pool: &SqlitePool, id: &str) -> AppResult<Option<GalleryFolder>> {
    let sql = format!("SELECT {FOLDER_COLUMNS} FROM gallery_folders WHERE id = ?");
    Ok(sqlx::query_as::<_, GalleryFolder>(&sql).bind(id).fetch_optional(pool).await?)
}

/// Vérifie qu'un dossier existe (`None` : la racine, toujours valable).
async fn check_folder(pool: &SqlitePool, id: Option<&str>) -> AppResult<()> {
    match id {
        Some(id) if find_folder(pool, id).await?.is_none() => Err(folder_not_found()),
        _ => Ok(()),
    }
}

/// Crée un dossier, à la racine ou dans `parent_id`.
pub async fn create_folder(pool: &SqlitePool, parent_id: Option<&str>, name: &str) -> AppResult<GalleryFolder> {
    let name = clean_folder_name(name)?;
    check_folder(pool, parent_id).await?;

    let id = new_id();
    let now = now_utc();

    sqlx::query(
        "INSERT INTO gallery_folders (id, parent_id, name, position, created_at, updated_at) \
         SELECT ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?, ? FROM gallery_folders WHERE parent_id IS ?",
    )
    .bind(&id)
    .bind(parent_id)
    .bind(&name)
    .bind(&now)
    .bind(&now)
    .bind(parent_id)
    .execute(pool)
    .await?;

    find_folder(pool, &id).await?.ok_or_else(folder_not_found)
}

/// Renomme un dossier.
pub async fn rename_folder(pool: &SqlitePool, id: &str, name: &str) -> AppResult<GalleryFolder> {
    let name = clean_folder_name(name)?;
    let result = sqlx::query("UPDATE gallery_folders SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(folder_not_found());
    }
    find_folder(pool, id).await?.ok_or_else(folder_not_found)
}

/// Déplace un dossier dans un autre (ou à la racine). Un dossier ne peut
/// pas aller dans lui-même ni dans un de ses sous-dossiers.
pub async fn move_folder(pool: &SqlitePool, id: &str, parent_id: Option<&str>) -> AppResult<GalleryFolder> {
    find_folder(pool, id).await?.ok_or_else(folder_not_found)?;
    check_folder(pool, parent_id).await?;

    let mut cursor = parent_id.map(str::to_owned);
    while let Some(current) = cursor {
        if current == id {
            return Err(AppError::validation("Un dossier ne peut pas aller dans un de ses sous-dossiers.")
                .with_key("project.galleryFolderCycle"));
        }
        cursor = find_folder(pool, &current).await?.and_then(|f| f.parent_id);
    }

    sqlx::query("UPDATE gallery_folders SET parent_id = ?, updated_at = ? WHERE id = ?")
        .bind(parent_id)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;

    find_folder(pool, id).await?.ok_or_else(folder_not_found)
}

/// Supprime un dossier et ses sous-dossiers ; leurs images reviennent à la
/// racine de la galerie (elles ne sont pas supprimées).
pub async fn delete_folder(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    // Le dossier et tous ses sous-dossiers.
    let ids: Vec<String> = sqlx::query_scalar(
        "WITH RECURSIVE tree(id) AS ( \
             SELECT id FROM gallery_folders WHERE id = ? \
             UNION ALL SELECT f.id FROM gallery_folders f JOIN tree ON f.parent_id = tree.id \
         ) SELECT id FROM tree",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;

    if ids.is_empty() {
        return Err(folder_not_found());
    }

    // Images à la racine (sans compter sur les clés étrangères, qui peuvent
    // être désactivées sur certaines connexions).
    for folder in &ids {
        sqlx::query("UPDATE project_images SET folder_id = NULL WHERE folder_id = ?")
            .bind(folder)
            .execute(&mut *tx)
            .await?;
    }
    for folder in ids.iter().rev() {
        sqlx::query("DELETE FROM gallery_folders WHERE id = ?").bind(folder).execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Images de la galerie
// ----------------------------------------------------------------------------

const IMAGE_COLUMNS: &str = "id, caption, description, folder_id, created_at";

/// Images de la galerie (sans leur contenu), dans l'ordre.
pub async fn list_gallery(pool: &SqlitePool) -> AppResult<Vec<ProjectImage>> {
    let sql = format!("SELECT {IMAGE_COLUMNS} FROM project_images ORDER BY position, created_at");
    Ok(sqlx::query_as::<_, ProjectImage>(&sql).fetch_all(pool).await?)
}

async fn find_image(pool: &SqlitePool, image_id: &str) -> AppResult<ProjectImage> {
    let sql = format!("SELECT {IMAGE_COLUMNS} FROM project_images WHERE id = ?");
    sqlx::query_as::<_, ProjectImage>(&sql)
        .bind(image_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(image_not_found)
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

/// Ajoute une image à la fin de la galerie, dans `folder_id` (`None` : à la
/// racine). Refusé si ce dossier contient déjà `MAX_GALLERY_IMAGES` images.
pub async fn add_gallery_image(
    pool: &SqlitePool,
    data: &str,
    caption: Option<&str>,
    folder_id: Option<&str>,
) -> AppResult<ProjectImage> {
    let (bytes, mime) = decode_image(data)?;
    let caption = clean_caption(caption)?;
    check_folder(pool, folder_id).await?;
    let id = new_id();
    let now = now_utc();

    // Comptage et ajout dans la même requête : la limite ne peut pas être
    // dépassée par deux ajouts simultanés.
    let result = sqlx::query(
        r#"
        INSERT INTO project_images (id, mime, data, caption, folder_id, position, created_at)
        SELECT ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM project_images), ?
        WHERE (SELECT COUNT(*) FROM project_images WHERE folder_id IS ?) < ?
        "#,
    )
    .bind(&id)
    .bind(mime)
    .bind(&bytes)
    .bind(&caption)
    .bind(folder_id)
    .bind(&now)
    .bind(folder_id)
    .bind(MAX_GALLERY_IMAGES)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(folder_full());
    }

    Ok(ProjectImage { id, caption, description: None, folder_id: folder_id.map(str::to_owned), created_at: now })
}

/// Change la légende (le nom) d'une image.
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

/// Nom et description d'une image (vides : effacés).
pub async fn update_gallery_image(
    pool: &SqlitePool,
    image_id: &str,
    caption: Option<&str>,
    description: Option<&str>,
) -> AppResult<ProjectImage> {
    let caption = clean_caption(caption)?;
    let description = clean_description(description)?;

    let result = sqlx::query("UPDATE project_images SET caption = ?, description = ? WHERE id = ?")
        .bind(&caption)
        .bind(&description)
        .bind(image_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(image_not_found());
    }

    find_image(pool, image_id).await
}

/// Range des images dans un dossier (`None` : à la racine de la galerie).
/// Refusé (sans rien changer) si le dossier dépasserait `MAX_GALLERY_IMAGES` images.
pub async fn move_gallery_images(pool: &SqlitePool, image_ids: &[String], folder_id: Option<&str>) -> AppResult<()> {
    check_folder(pool, folder_id).await?;
    let mut tx = pool.begin().await?;

    // Images déjà dans le dossier, et celles qui y arrivent (sans compter deux fois une image déjà rangée là).
    let already: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_images WHERE folder_id IS ?")
        .bind(folder_id)
        .fetch_one(&mut *tx)
        .await?;
    let mut arriving: i64 = 0;
    for id in image_ids {
        let current: Option<Option<String>> = sqlx::query_scalar("SELECT folder_id FROM project_images WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
        match current {
            None => return Err(image_not_found()),
            Some(current) if current.as_deref() != folder_id => arriving += 1,
            Some(_) => {}
        }
    }
    if already + arriving > MAX_GALLERY_IMAGES {
        return Err(folder_full());
    }

    for id in image_ids {
        let result = sqlx::query("UPDATE project_images SET folder_id = ? WHERE id = ?")
            .bind(folder_id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if result.rows_affected() == 0 {
            return Err(image_not_found());
        }
    }

    tx.commit().await?;
    Ok(())
}

/// Range la galerie : `ids` donne le nouvel ordre de **toutes** les images.
///
/// Refusé si la liste ne correspond pas exactement aux images présentes
/// (image ajoutée ou supprimée entre-temps) : rien n'est modifié.
pub async fn reorder_gallery(pool: &SqlitePool, ids: &[String]) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let mut current: Vec<String> = sqlx::query_scalar("SELECT id FROM project_images")
        .fetch_all(&mut *tx)
        .await?;
    let mut wanted = ids.to_vec();
    current.sort();
    wanted.sort();

    if current != wanted {
        return Err(AppError::validation("La galerie a changé : rechargez-la puis recommencez.")
            .with_key("project.galleryChanged"));
    }

    for (position, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE project_images SET position = ? WHERE id = ?")
            .bind(position as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
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

        let first = add_gallery_image(&pool, &png(), Some("  Carte du monde  "), None).await.unwrap();
        let second = add_gallery_image(&pool, &png(), None, None).await.unwrap();

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
    async fn gallery_is_limited_per_folder() {
        let pool = pool().await;

        // « Sans dossier » plein…
        for _ in 0..MAX_GALLERY_IMAGES {
            add_gallery_image(&pool, &png(), None, None).await.unwrap();
        }
        assert!(add_gallery_image(&pool, &png(), None, None).await.is_err());

        // … mais un dossier a sa propre limite.
        let cartes = create_folder(&pool, None, "Cartes").await.unwrap();
        let mut in_folder = Vec::new();
        for _ in 0..MAX_GALLERY_IMAGES {
            in_folder.push(add_gallery_image(&pool, &png(), None, Some(&cartes.id)).await.unwrap().id);
        }
        assert!(add_gallery_image(&pool, &png(), None, Some(&cartes.id)).await.is_err());

        // Ranger une image dans un dossier plein : refusé, rien ne bouge.
        let loose = list_gallery(&pool).await.unwrap().into_iter().find(|image| image.folder_id.is_none()).unwrap();
        assert!(move_gallery_images(&pool, &[loose.id.clone()], Some(&cartes.id)).await.is_err());
        assert_eq!(find_image(&pool, &loose.id).await.unwrap().folder_id, None);

        // Une image déjà dans le dossier n'est pas comptée deux fois.
        move_gallery_images(&pool, &[in_folder[0].clone()], Some(&cartes.id)).await.unwrap();

        // Après une sortie, il y a de nouveau de la place.
        let autre = create_folder(&pool, None, "Autre").await.unwrap();
        move_gallery_images(&pool, &[in_folder[0].clone()], Some(&autre.id)).await.unwrap();
        move_gallery_images(&pool, &[loose.id], Some(&cartes.id)).await.unwrap();
    }

    #[tokio::test]
    async fn gallery_image_details_are_updated() {
        let pool = pool().await;
        let image = add_gallery_image(&pool, &png(), None, None).await.unwrap();

        let updated = update_gallery_image(&pool, &image.id, Some(" Le port "), Some("Vue du port au matin."))
            .await
            .unwrap();
        assert_eq!(updated.caption.as_deref(), Some("Le port"));
        assert_eq!(updated.description.as_deref(), Some("Vue du port au matin."));

        // Vides : effacés.
        let cleared = update_gallery_image(&pool, &image.id, Some(""), Some("   ")).await.unwrap();
        assert_eq!((cleared.caption, cleared.description), (None, None));

        let long = "a".repeat(MAX_DESCRIPTION_CHARS + 1);
        assert!(update_gallery_image(&pool, &image.id, None, Some(&long)).await.is_err());
        assert!(update_gallery_image(&pool, "inconnue", None, None).await.is_err());
    }

    #[tokio::test]
    async fn gallery_folders_hold_images() {
        let pool = pool().await;
        let cartes = create_folder(&pool, None, "  Cartes  ").await.unwrap();
        assert_eq!(cartes.name, "Cartes");
        let nord = create_folder(&pool, Some(&cartes.id), "Le Nord").await.unwrap();
        assert!(create_folder(&pool, None, "   ").await.is_err());
        assert!(create_folder(&pool, Some("inconnu"), "X").await.is_err());

        // Ajout directement dans un dossier, puis déplacement.
        let a = add_gallery_image(&pool, &png(), None, Some(&nord.id)).await.unwrap();
        let b = add_gallery_image(&pool, &png(), None, None).await.unwrap();
        assert_eq!(a.folder_id.as_deref(), Some(nord.id.as_str()));
        move_gallery_images(&pool, &[b.id.clone()], Some(&cartes.id)).await.unwrap();
        assert!(move_gallery_images(&pool, &[b.id.clone()], Some("inconnu")).await.is_err());

        // Renommer, et pas de boucle : un dossier ne va pas dans son sous-dossier.
        assert_eq!(rename_folder(&pool, &nord.id, "Nord").await.unwrap().name, "Nord");
        assert!(move_folder(&pool, &cartes.id, Some(&nord.id)).await.is_err());
        assert!(move_folder(&pool, &cartes.id, Some(&cartes.id)).await.is_err());
        assert_eq!(move_folder(&pool, &nord.id, None).await.unwrap().parent_id, None);
        move_folder(&pool, &nord.id, Some(&cartes.id)).await.unwrap();

        // Supprimer « Cartes » : son sous-dossier part aussi, les images restent (à la racine).
        delete_folder(&pool, &cartes.id).await.unwrap();
        assert!(list_folders(&pool).await.unwrap().is_empty());
        let images = list_gallery(&pool).await.unwrap();
        assert_eq!(images.len(), 2);
        assert!(images.iter().all(|image| image.folder_id.is_none()));
        assert!(delete_folder(&pool, &cartes.id).await.is_err());
    }

    #[tokio::test]
    async fn gallery_is_reordered() {
        let pool = pool().await;
        let a = add_gallery_image(&pool, &png(), None, None).await.unwrap().id;
        let b = add_gallery_image(&pool, &png(), None, None).await.unwrap().id;
        let c = add_gallery_image(&pool, &png(), None, None).await.unwrap().id;

        reorder_gallery(&pool, &[c.clone(), a.clone(), b.clone()]).await.unwrap();
        let order: Vec<String> = list_gallery(&pool).await.unwrap().into_iter().map(|i| i.id).collect();
        assert_eq!(order, [c.clone(), a.clone(), b.clone()]);

        // Liste incomplète : refusée, l'ordre ne change pas.
        assert!(reorder_gallery(&pool, &[a.clone(), b.clone()]).await.is_err());
        let after: Vec<String> = list_gallery(&pool).await.unwrap().into_iter().map(|i| i.id).collect();
        assert_eq!(after, [c, a, b]);
    }
}
