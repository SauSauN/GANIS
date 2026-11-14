//! Fabrication d'un manga (migration `033_manga_production.sql`) :
//! - l'étape de fabrication de chaque page (storyboard, crayonné, encrage,
//!   trames, lettrage, validée), pour les pages du récit comme pour les
//!   pages hors récit ;
//! - les pages hors récit d'un tome (couverture, page de titre, sommaire,
//!   crédits, bonus, postface…), placées avant ou après le récit.
//!
//! Le chemin de fer les range avec les pages du récit pour calculer les
//! folios ; les couvertures n'en ont pas (voir `src/lib/manga.ts`).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::services::trash_service::Snapshot;
use crate::utils::{new_id, now_utc};

/// Étapes de fabrication, dans l'ordre. La valeur enregistrée est la
/// dernière étape terminée ; `None` : rien de commencé.
pub const PRODUCTION_STAGES: [&str; 6] = ["storyboard", "pencils", "inks", "tones", "lettering", "done"];

/// Sortes de pages hors récit.
pub const EXTRA_KINDS: [&str; 12] = [
    "cover", "title", "toc", "credits", "cast", "foreword", "bonus", "afterword", "preview", "blank", "backCover", "other",
];

pub const PLACEMENTS: [&str; 2] = ["front", "back"];

const MAX_TITLE_CHARS: usize = 200;
const MAX_NOTES_CHARS: usize = 10_000;
/// Pages hors récit par tome.
const MAX_EXTRAS_PER_VOLUME: i64 = 100;
/// Pages changées d'étape en une fois (sélection).
const MAX_STAGE_IDS: usize = 5_000;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExtraPage {
    pub id: String,
    pub volume_id: Option<String>,
    pub placement: String,
    pub position: i64,
    pub kind: String,
    pub title: String,
    pub notes: String,
    pub production_stage: Option<String>,
    /// Vrai : la page a un dessin (migration 035) ; il se lit à part.
    pub has_art: bool,
    /// Date du dernier changement du dessin (rafraîchit la vignette).
    pub art_updated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Nouvelle page hors récit.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraPageInput {
    #[serde(default)]
    pub volume_id: Option<String>,
    pub placement: String,
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub notes: String,
}

/// Modification d'une page hors récit (sa place se change par `reorder`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraPageUpdate {
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub notes: String,
}

const COLUMNS: &str =
    "id, volume_id, placement, position, kind, title, notes, production_stage, art IS NOT NULL AS has_art, art_updated_at, created_at, updated_at";

/// Taille maximale d'un dessin de page hors récit (60 Mo).
const MAX_ART_BYTES: usize = 60 * 1024 * 1024;

fn invalid(key: &'static str) -> AppError {
    AppError::validation("Valeur invalide.").with_key(key)
}

fn not_found() -> AppError {
    AppError::not_found("Cette page n'existe plus.").with_key("manga.extraNotFound")
}

fn text(value: &str, max: usize, key: &'static str) -> AppResult<String> {
    let value = value.trim();
    if value.chars().count() > max {
        return Err(AppError::validation("Ce texte est trop long.").with_key(key).with_param("max", max));
    }
    Ok(value.to_owned())
}

/// Étape reçue de l'interface : `None` ou `""` : rien de commencé.
fn stage(value: Option<&str>) -> AppResult<Option<String>> {
    match value.map(str::trim) {
        None | Some("") => Ok(None),
        Some(v) if PRODUCTION_STAGES.contains(&v) => Ok(Some(v.to_owned())),
        Some(_) => Err(invalid("manga.invalidStage")),
    }
}

fn kind(value: &str) -> AppResult<String> {
    EXTRA_KINDS.contains(&value).then(|| value.to_owned()).ok_or_else(|| invalid("manga.invalidExtraKind"))
}

/// Une couverture ne va qu'avant le récit, la quatrième de couverture
/// qu'après.
fn check_place(kind: &str, placement: &str) -> AppResult<()> {
    if !PLACEMENTS.contains(&placement) {
        return Err(invalid("manga.invalidPlacement"));
    }
    match (kind, placement) {
        ("cover", "back") | ("backCover", "front") => Err(invalid("manga.coverPlacement")),
        _ => Ok(()),
    }
}

/// Une seule couverture (et une seule quatrième) par tome.
async fn check_single_cover(pool: &SqlitePool, volume_id: Option<&str>, kind: &str, except: Option<&str>) -> AppResult<()> {
    if kind != "cover" && kind != "backCover" {
        return Ok(());
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manga_extra_pages WHERE volume_id IS ? AND kind = ? AND id IS NOT ?")
        .bind(volume_id)
        .bind(kind)
        .bind(except)
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Err(AppError::conflict("Ce tome a déjà cette couverture.").with_key("manga.coverExists"));
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// Pages hors récit
// ----------------------------------------------------------------------------

/// Toutes les pages hors récit du projet, par tome, placement et ordre.
pub async fn list_extra_pages(pool: &SqlitePool) -> AppResult<Vec<ExtraPage>> {
    let sql = format!("SELECT {COLUMNS} FROM manga_extra_pages ORDER BY volume_id, placement, position, created_at");
    Ok(sqlx::query_as::<_, ExtraPage>(&sql).fetch_all(pool).await?)
}

pub async fn get_extra_page(pool: &SqlitePool, id: &str) -> AppResult<ExtraPage> {
    let sql = format!("SELECT {COLUMNS} FROM manga_extra_pages WHERE id = ?");
    sqlx::query_as::<_, ExtraPage>(&sql).bind(id).fetch_optional(pool).await?.ok_or_else(not_found)
}

/// Ajoute une page à la fin de son groupe (tome + placement).
pub async fn create_extra_page(pool: &SqlitePool, input: &ExtraPageInput) -> AppResult<ExtraPage> {
    let kind = kind(&input.kind)?;
    check_place(&kind, &input.placement)?;
    let title = text(&input.title, MAX_TITLE_CHARS, "manga.extraTitleTooLong")?;
    let notes = text(&input.notes, MAX_NOTES_CHARS, "manga.fieldTooLong")?;
    let volume_id = input.volume_id.as_deref().filter(|v| !v.is_empty());

    if let Some(volume) = volume_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM structure_nodes WHERE id = ?").bind(volume).fetch_optional(pool).await?;
        if exists.is_none() {
            return Err(AppError::not_found("Ce tome n'existe plus.").with_key("structure.notFound"));
        }
    }
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM manga_extra_pages WHERE volume_id IS ?").bind(volume_id).fetch_one(pool).await?;
    if count >= MAX_EXTRAS_PER_VOLUME {
        return Err(invalid("manga.tooManyExtras").with_param("max", MAX_EXTRAS_PER_VOLUME));
    }
    check_single_cover(pool, volume_id, &kind, None).await?;

    let position: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM manga_extra_pages WHERE volume_id IS ? AND placement = ?")
        .bind(volume_id)
        .bind(&input.placement)
        .fetch_one(pool)
        .await?;
    let id = new_id();
    let now = now_utc();
    sqlx::query(
        "INSERT INTO manga_extra_pages (id, volume_id, placement, position, kind, title, notes, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(volume_id)
    .bind(&input.placement)
    .bind(position)
    .bind(&kind)
    .bind(&title)
    .bind(&notes)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;
    get_extra_page(pool, &id).await
}

pub async fn update_extra_page(pool: &SqlitePool, id: &str, update: &ExtraPageUpdate) -> AppResult<ExtraPage> {
    let current = get_extra_page(pool, id).await?;
    let kind = kind(&update.kind)?;
    check_place(&kind, &current.placement)?;
    check_single_cover(pool, current.volume_id.as_deref(), &kind, Some(id)).await?;
    let title = text(&update.title, MAX_TITLE_CHARS, "manga.extraTitleTooLong")?;
    let notes = text(&update.notes, MAX_NOTES_CHARS, "manga.fieldTooLong")?;
    sqlx::query("UPDATE manga_extra_pages SET kind = ?, title = ?, notes = ?, updated_at = ? WHERE id = ?")
        .bind(&kind)
        .bind(&title)
        .bind(&notes)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    get_extra_page(pool, id).await
}

/// Nouvel ordre d'un groupe (tome + placement) : `ids` dans l'ordre voulu.
/// Une page d'un autre placement du même tome y est déplacée ; les pages
/// absentes de la liste gardent leur groupe, renuméroté.
pub async fn reorder_extra_pages(pool: &SqlitePool, volume_id: Option<&str>, placement: &str, ids: &[String]) -> AppResult<Vec<ExtraPage>> {
    if !PLACEMENTS.contains(&placement) {
        return Err(invalid("manga.invalidPlacement"));
    }
    let volume_id = volume_id.filter(|v| !v.is_empty());
    let mut tx = pool.begin().await?;
    let now = now_utc();
    for (position, id) in ids.iter().enumerate() {
        let row: Option<(Option<String>, String)> = sqlx::query_as("SELECT volume_id, kind FROM manga_extra_pages WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
        let Some((volume, kind)) = row else { return Err(not_found()) };
        if volume.as_deref() != volume_id {
            return Err(invalid("manga.extraOtherVolume"));
        }
        check_place(&kind, placement)?;
        sqlx::query("UPDATE manga_extra_pages SET placement = ?, position = ?, updated_at = ? WHERE id = ?")
            .bind(placement)
            .bind(position as i64)
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    // L'autre groupe du tome : positions resserrées.
    let other = if placement == "front" { "back" } else { "front" };
    let rest: Vec<String> = sqlx::query_scalar("SELECT id FROM manga_extra_pages WHERE volume_id IS ? AND placement = ? ORDER BY position, created_at")
        .bind(volume_id)
        .bind(other)
        .fetch_all(&mut *tx)
        .await?;
    for (position, id) in rest.iter().enumerate() {
        sqlx::query("UPDATE manga_extra_pages SET position = ? WHERE id = ?").bind(position as i64).bind(id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    list_extra_pages(pool).await
}

/// Met la page à la corbeille ; renvoie l'identifiant de l'entrée.
pub async fn delete_extra_page(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = Snapshot::new();
    snapshot.capture(&mut tx, "manga_extra_pages", "id", id).await?;
    if snapshot.is_empty() {
        return Err(not_found());
    }
    let (kind, title): (String, String) = sqlx::query_as("SELECT kind, title FROM manga_extra_pages WHERE id = ?").bind(id).fetch_one(&mut *tx).await?;
    sqlx::query("DELETE FROM manga_extra_pages WHERE id = ?").bind(id).execute(&mut *tx).await?;
    // Libellé : le titre, sinon la sorte (traduite par l'interface).
    let label = if title.is_empty() { format!("@{kind}") } else { title };
    let trash_id = snapshot.store(&mut tx, "mangaExtraPage", id, &label).await?;
    tx.commit().await?;
    Ok(trash_id)
}

// ----------------------------------------------------------------------------
// Dessin d'une page hors récit
// ----------------------------------------------------------------------------

/// Range le dessin d'une page (image seulement : PNG, JPEG, GIF, WebP).
pub async fn set_extra_art(pool: &SqlitePool, id: &str, name: &str, bytes: &[u8]) -> AppResult<ExtraPage> {
    if bytes.len() > MAX_ART_BYTES {
        return Err(invalid("manga.artTooLarge").with_param("max", MAX_ART_BYTES / (1024 * 1024)));
    }
    let mime = crate::services::document_service::mime_of(name, bytes);
    if !matches!(mime, "image/png" | "image/jpeg" | "image/gif" | "image/webp") {
        return Err(invalid("manga.artNotImage"));
    }
    let now = now_utc();
    let result = sqlx::query("UPDATE manga_extra_pages SET art = ?, art_mime = ?, art_updated_at = ?, updated_at = ? WHERE id = ?")
        .bind(bytes)
        .bind(mime)
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    get_extra_page(pool, id).await
}

pub async fn remove_extra_art(pool: &SqlitePool, id: &str) -> AppResult<ExtraPage> {
    let now = now_utc();
    let result = sqlx::query("UPDATE manga_extra_pages SET art = NULL, art_mime = NULL, art_updated_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    get_extra_page(pool, id).await
}

/// Contenu du dessin d'une page.
pub async fn extra_art(pool: &SqlitePool, id: &str) -> AppResult<Vec<u8>> {
    let row: Option<(Option<Vec<u8>>,)> = sqlx::query_as("SELECT art FROM manga_extra_pages WHERE id = ?").bind(id).fetch_optional(pool).await?;
    match row {
        Some((Some(bytes),)) => Ok(bytes),
        Some((None,)) => Err(AppError::not_found("Cette page n'a pas de dessin.").with_key("manga.noArt")),
        None => Err(not_found()),
    }
}

// ----------------------------------------------------------------------------
// Étapes de fabrication
// ----------------------------------------------------------------------------

/// Donne une étape à des pages du récit (`page_ids`) et à des pages hors
/// récit (`extra_ids`). Les pages du récit gardent leur date de
/// modification : l'avancement du dessin n'est pas une modification du
/// scénario.
pub async fn set_production_stage(pool: &SqlitePool, page_ids: &[String], extra_ids: &[String], value: Option<&str>) -> AppResult<()> {
    let value = stage(value)?;
    if page_ids.len() + extra_ids.len() > MAX_STAGE_IDS {
        return Err(invalid("manga.tooManyPages").with_param("max", MAX_STAGE_IDS));
    }
    let mut tx = pool.begin().await?;
    for id in page_ids {
        let result = sqlx::query("UPDATE structure_nodes SET production_stage = ? WHERE id = ?").bind(&value).bind(id).execute(&mut *tx).await?;
        if result.rows_affected() == 0 {
            return Err(AppError::not_found("Élément du découpage introuvable.").with_key("structure.notFound"));
        }
    }
    let now = now_utc();
    for id in extra_ids {
        let result = sqlx::query("UPDATE manga_extra_pages SET production_stage = ?, updated_at = ? WHERE id = ?")
            .bind(&value)
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        if result.rows_affected() == 0 {
            return Err(not_found());
        }
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::{structure_service::find_node, trash_service};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn node(pool: &SqlitePool, title: &str) -> String {
        let id = new_id();
        let now = now_utc();
        sqlx::query("INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) VALUES (?, NULL, 0, ?, '', 0, ?, ?)")
            .bind(&id)
            .bind(title)
            .bind(&now)
            .bind(&now)
            .execute(pool)
            .await
            .unwrap();
        id
    }

    fn input(volume: Option<&str>, placement: &str, kind: &str) -> ExtraPageInput {
        ExtraPageInput { volume_id: volume.map(str::to_owned), placement: placement.into(), kind: kind.into(), title: String::new(), notes: String::new() }
    }

    #[tokio::test]
    async fn extras_are_ordered_and_checked() {
        let pool = pool().await;
        let tome = node(&pool, "Tome 1").await;
        let title = create_extra_page(&pool, &input(Some(&tome), "front", "title")).await.unwrap();
        let toc = create_extra_page(&pool, &input(Some(&tome), "front", "toc")).await.unwrap();
        let after = create_extra_page(&pool, &input(Some(&tome), "back", "afterword")).await.unwrap();
        assert_eq!((title.position, toc.position, after.position), (0, 1, 0));

        // Sans tome : un groupe à part.
        let loose = create_extra_page(&pool, &input(None, "front", "title")).await.unwrap();
        assert_eq!(loose.position, 0);

        // Sortes, placements et couvertures vérifiés.
        assert!(create_extra_page(&pool, &input(Some(&tome), "front", "poster")).await.is_err());
        assert!(create_extra_page(&pool, &input(Some(&tome), "middle", "bonus")).await.is_err());
        assert!(create_extra_page(&pool, &input(Some(&tome), "back", "cover")).await.is_err());
        assert!(create_extra_page(&pool, &input(Some("absent"), "front", "bonus")).await.is_err());
        create_extra_page(&pool, &input(Some(&tome), "front", "cover")).await.unwrap();
        assert!(create_extra_page(&pool, &input(Some(&tome), "front", "cover")).await.is_err());
        create_extra_page(&pool, &input(None, "front", "cover")).await.unwrap();

        // Le sommaire passe après le récit, devant la postface.
        let all = reorder_extra_pages(&pool, Some(&tome), "back", &[toc.id.clone(), after.id.clone()]).await.unwrap();
        let moved = all.iter().find(|p| p.id == toc.id).unwrap();
        assert_eq!((moved.placement.as_str(), moved.position), ("back", 0));
        assert!(reorder_extra_pages(&pool, Some(&tome), "back", &[loose.id.clone()]).await.is_err());

        let updated = update_extra_page(&pool, &title.id, &ExtraPageUpdate { kind: "credits".into(), title: " Mentions ".into(), notes: String::new() }).await.unwrap();
        assert_eq!((updated.kind.as_str(), updated.title.as_str()), ("credits", "Mentions"));
        assert!(update_extra_page(&pool, &title.id, &ExtraPageUpdate { kind: "cover".into(), title: String::new(), notes: String::new() }).await.is_err());
    }

    #[tokio::test]
    async fn stages_and_trash() {
        let pool = pool().await;
        let tome = node(&pool, "Tome 1").await;
        let page = node(&pool, "Page 1").await;
        let extra = create_extra_page(&pool, &input(Some(&tome), "back", "bonus")).await.unwrap();
        let before = find_node(&pool, &page).await.unwrap().unwrap();

        set_production_stage(&pool, &[page.clone()], &[extra.id.clone()], Some("inks")).await.unwrap();
        let after = find_node(&pool, &page).await.unwrap().unwrap();
        assert_eq!(after.production_stage.as_deref(), Some("inks"));
        assert_eq!(after.updated_at, before.updated_at);
        assert_eq!(get_extra_page(&pool, &extra.id).await.unwrap().production_stage.as_deref(), Some("inks"));

        assert!(set_production_stage(&pool, &[page.clone()], &[], Some("colour")).await.is_err());
        assert!(set_production_stage(&pool, &["absent".into()], &[], Some("inks")).await.is_err());
        set_production_stage(&pool, &[page.clone()], &[], None).await.unwrap();
        assert_eq!(find_node(&pool, &page).await.unwrap().unwrap().production_stage, None);

        // Corbeille : la page revient avec son étape.
        let trash_id = delete_extra_page(&pool, &extra.id).await.unwrap();
        assert!(list_extra_pages(&pool).await.unwrap().is_empty());
        let item = trash_service::restore(&pool, &trash_id).await.unwrap();
        assert_eq!((item.kind.as_str(), item.label.as_str()), ("mangaExtraPage", "@bonus"));
        assert_eq!(get_extra_page(&pool, &extra.id).await.unwrap().production_stage.as_deref(), Some("inks"));

        // Dessin : une image seulement ; il revient avec la page restaurée.
        const PNG: &[u8] = b"\x89PNG\r\n\x1a\nreste";
        assert!(set_extra_art(&pool, &extra.id, "notes.txt", b"pas une image").await.is_err());
        let with_art = set_extra_art(&pool, &extra.id, "bonus.png", PNG).await.unwrap();
        assert!(with_art.has_art && with_art.art_updated_at.is_some());
        assert_eq!(extra_art(&pool, &extra.id).await.unwrap(), PNG);
        let trash_id = delete_extra_page(&pool, &extra.id).await.unwrap();
        trash_service::restore(&pool, &trash_id).await.unwrap();
        assert_eq!(extra_art(&pool, &extra.id).await.unwrap(), PNG);
        assert!(!remove_extra_art(&pool, &extra.id).await.unwrap().has_art);
        assert!(extra_art(&pool, &extra.id).await.is_err());

        // Supprimer le tome emporte ses pages hors récit.
        sqlx::query("DELETE FROM structure_nodes WHERE id = ?").bind(&tome).execute(&pool).await.unwrap();
        assert!(list_extra_pages(&pool).await.unwrap().is_empty());
    }
}
