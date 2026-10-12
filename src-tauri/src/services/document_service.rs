//! Documents rangés dans le découpage (PDF, Word, pages de manga, images,
//! textes, sons, vidéos…).
//!
//! - Le contenu des fichiers est dans `document_blobs`, chiffré avec le
//!   reste du projet. Les documents, leurs versions et la corbeille n'en
//!   gardent qu'une référence : supprimer ou restaurer un document ne copie
//!   jamais son contenu.
//! - Remplacer le contenu d'un document (nouveau fichier, modification dans
//!   une autre application, texte modifié dans GANIS) garde l'ancien comme
//!   version (20 au plus par document).
//! - Un contenu qui ne sert plus à rien (ni document, ni version, ni entrée
//!   de la corbeille) est supprimé par [`clean_orphans`].
//!
//! Modification dans une autre application (Word, Acrobat, Clip Studio…) :
//! GANIS écrit une copie du document dans un dossier de travail
//! (`open-documents/<compte>/<document>/`), l'ouvre avec l'application
//! associée, et reprend le fichier dès qu'il est enregistré (voir
//! [`external_status`]). Cette copie n'est pas chiffrée : elle est supprimée
//! quand on termine, et au démarrage de GANIS.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::services::trash_service::Snapshot;
use crate::utils::{new_id, now_utc};

/// Taille maximale d'un document (300 Mo).
pub const MAX_DOCUMENT_BYTES: u64 = 300 * 1024 * 1024;
/// Versions gardées par document.
const MAX_VERSIONS: i64 = 20;
const MAX_NAME_CHARS: usize = 180;
const MAX_NOTE_CHARS: usize = 2000;
/// Documents ajoutés en une fois.
pub const MAX_FILES_AT_ONCE: usize = 500;
/// Textes lus par la recherche (au-delà : seulement le nom et la note).
const SEARCH_TEXT_BYTES: i64 = 512 * 1024;

/// Dossier de travail des documents ouverts dans une autre application.
const OPEN_DIR: &str = "open-documents";
/// Fichier d'état d'un document ouvert (à côté de la copie).
const STATE_FILE: &str = ".ganis-open.json";

// ----------------------------------------------------------------------------
// Modèles
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StructureDocument {
    pub id: String,
    pub node_id: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    pub note: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Nombre de versions précédentes.
    pub versions: i64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersion {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: i64,
    pub created_at: String,
}

const SELECT_DOCUMENT: &str = "SELECT d.id, d.node_id, d.name, d.mime, d.size, d.note, d.position, \
     d.created_at, d.updated_at, \
     (SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) AS versions \
     FROM structure_documents d";

fn not_found() -> AppError {
    AppError::not_found("Ce document n'existe plus.").with_key("documents.notFound")
}

fn node_not_found() -> AppError {
    AppError::not_found("Cet élément du découpage n'existe plus.").with_key("documents.nodeNotFound")
}

fn version_not_found() -> AppError {
    AppError::not_found("Cette version du document n'existe plus.").with_key("documents.versionNotFound")
}

pub fn too_large(name: &str) -> AppError {
    AppError::validation(format!("« {name} » dépasse 300 Mo."))
        .with_key("documents.tooLarge")
        .with_param("name", name)
}

// ----------------------------------------------------------------------------
// Noms et types
// ----------------------------------------------------------------------------

/// Nom de fichier sûr (aussi sous Windows) : sans dossier, sans caractères
/// interdits, 180 caractères au plus en gardant l'extension.
pub fn clean_name(name: &str) -> String {
    // Seul le dernier élément d'un chemin compte.
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut cleaned: String = base
        .chars()
        .map(|c| if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') { '_' } else { c })
        .collect();
    cleaned = cleaned.trim().trim_end_matches(['.', ' ']).to_owned();
    if cleaned.is_empty() || cleaned.chars().all(|c| c == '.') {
        cleaned = "document".to_owned();
    }

    if cleaned.chars().count() > MAX_NAME_CHARS {
        let (stem, ext) = split_extension(&cleaned);
        let ext: String = ext.chars().take(20).collect();
        let keep = MAX_NAME_CHARS - ext.chars().count() - usize::from(!ext.is_empty());
        let stem: String = stem.chars().take(keep).collect();
        cleaned = if ext.is_empty() { stem } else { format!("{}.{ext}", stem.trim_end()) };
    }

    // Noms réservés de Windows (« CON », « NUL.txt »…).
    let (stem, _) = split_extension(&cleaned);
    let upper = stem.to_ascii_uppercase();
    let reserved = matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.len() == 4
            && upper.as_bytes()[3].is_ascii_digit());
    if reserved {
        cleaned.insert(0, '_');
    }
    cleaned
}

/// « Chapitre 1.pdf » → (« Chapitre 1 », « pdf »).
fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index + 1..]),
        _ => (name, ""),
    }
}

/// Type du document, d'après son contenu quand c'est possible (PDF, images),
/// sinon d'après l'extension.
pub fn mime_of(name: &str, bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"%PDF-") {
        return "application/pdf";
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return "image/png";
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "image/jpeg";
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "image/gif";
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }

    let (_, ext) = split_extension(name);
    match ext.to_ascii_lowercase().as_str() {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "odt" => "application/vnd.oasis.opendocument.text",
        "rtf" => "application/rtf",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "ppt" => "application/vnd.ms-powerpoint",
        "odp" => "application/vnd.oasis.opendocument.presentation",
        "epub" => "application/epub+zip",
        "txt" | "text" | "log" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "fountain" => "text/plain",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "zip" => "application/zip",
        "cbz" => "application/vnd.comicbook+zip",
        "psd" => "image/vnd.adobe.photoshop",
        "clip" => "application/x-clip-studio",
        "kra" => "application/x-krita",
        _ => "application/octet-stream",
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

pub async fn find(pool: &SqlitePool, id: &str) -> AppResult<Option<StructureDocument>> {
    Ok(sqlx::query_as::<_, StructureDocument>(&format!("{SELECT_DOCUMENT} WHERE d.id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await?)
}

async fn get(pool: &SqlitePool, id: &str) -> AppResult<StructureDocument> {
    find(pool, id).await?.ok_or_else(not_found)
}

/// Documents d'un élément du découpage, dans leur ordre.
pub async fn list(pool: &SqlitePool, node_id: &str) -> AppResult<Vec<StructureDocument>> {
    Ok(sqlx::query_as::<_, StructureDocument>(&format!(
        "{SELECT_DOCUMENT} WHERE d.node_id = ? ORDER BY d.position, d.created_at"
    ))
    .bind(node_id)
    .fetch_all(pool)
    .await?)
}

/// Nombre de documents de chaque élément du découpage (plan du récit).
pub async fn counts(pool: &SqlitePool) -> AppResult<Vec<(String, i64)>> {
    Ok(sqlx::query_as("SELECT node_id, COUNT(*) FROM structure_documents GROUP BY node_id")
        .fetch_all(pool)
        .await?)
}

/// Contenu d'un document.
pub async fn content(pool: &SqlitePool, id: &str) -> AppResult<(StructureDocument, Vec<u8>)> {
    let document = get(pool, id).await?;
    let data: Vec<u8> = sqlx::query_scalar(
        "SELECT b.data FROM structure_documents d JOIN document_blobs b ON b.id = d.blob_id WHERE d.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(not_found)?;
    Ok((document, data))
}

// ----------------------------------------------------------------------------
// Ajout et modification
// ----------------------------------------------------------------------------

async fn insert_blob(conn: &mut sqlx::SqliteConnection, bytes: &[u8]) -> AppResult<String> {
    let id = new_id();
    sqlx::query("INSERT INTO document_blobs (id, data, size, created_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(bytes)
        .bind(bytes.len() as i64)
        .bind(now_utc())
        .execute(&mut *conn)
        .await?;
    Ok(id)
}

/// Ajoute un document à la fin de ceux d'un élément du découpage.
pub async fn add(pool: &SqlitePool, node_id: &str, name: &str, bytes: &[u8]) -> AppResult<StructureDocument> {
    let name = clean_name(name);
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(too_large(&name));
    }

    let mut tx = pool.begin().await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?")
        .bind(node_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(node_not_found());
    }

    let position: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM structure_documents WHERE node_id = ?")
            .bind(node_id)
            .fetch_one(&mut *tx)
            .await?;
    let blob_id = insert_blob(&mut tx, bytes).await?;
    let id = new_id();
    let now = now_utc();
    sqlx::query(
        "INSERT INTO structure_documents (id, node_id, name, mime, size, blob_id, note, position, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)",
    )
    .bind(&id)
    .bind(node_id)
    .bind(&name)
    .bind(mime_of(&name, bytes))
    .bind(bytes.len() as i64)
    .bind(&blob_id)
    .bind(position)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    get(pool, &id).await
}

/// Renomme un document. Sans extension, il garde la sienne (on ne change
/// pas le type d'un fichier en le renommant).
pub async fn rename(pool: &SqlitePool, id: &str, name: &str) -> AppResult<StructureDocument> {
    let current = get(pool, id).await?;
    let mut name = clean_name(name);
    let (_, old_ext) = split_extension(&current.name);
    let (_, new_ext) = split_extension(&name);
    if new_ext.is_empty() && !old_ext.is_empty() {
        name = clean_name(&format!("{name}.{old_ext}"));
    }

    sqlx::query("UPDATE structure_documents SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

/// Note libre sur un document (« planches à reprendre », « version envoyée
/// à l'éditeur »…).
pub async fn set_note(pool: &SqlitePool, id: &str, note: &str) -> AppResult<StructureDocument> {
    let note: String = note.trim().chars().take(MAX_NOTE_CHARS).collect();
    let result = sqlx::query("UPDATE structure_documents SET note = ?, updated_at = ? WHERE id = ?")
        .bind(&note)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    get(pool, id).await
}

/// Range un document dans un autre élément du découpage (à la fin).
pub async fn move_to(pool: &SqlitePool, id: &str, node_id: &str) -> AppResult<StructureDocument> {
    let mut tx = pool.begin().await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?")
        .bind(node_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(node_not_found());
    }
    let position: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM structure_documents WHERE node_id = ?")
            .bind(node_id)
            .fetch_one(&mut *tx)
            .await?;
    let result = sqlx::query("UPDATE structure_documents SET node_id = ?, position = ?, updated_at = ? WHERE id = ?")
        .bind(node_id)
        .bind(position)
        .bind(now_utc())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(not_found());
    }
    tx.commit().await?;
    get(pool, id).await
}

/// Nouvel ordre des documents d'un élément (les identifiants inconnus sont
/// ignorés ; ceux qui manquent gardent leur place, à la fin).
pub async fn reorder(pool: &SqlitePool, node_id: &str, ids: &[String]) -> AppResult<Vec<StructureDocument>> {
    let mut tx = pool.begin().await?;
    let current: Vec<String> =
        sqlx::query_scalar("SELECT id FROM structure_documents WHERE node_id = ? ORDER BY position, created_at")
            .bind(node_id)
            .fetch_all(&mut *tx)
            .await?;

    let mut order: Vec<&String> = ids.iter().filter(|id| current.contains(id)).collect();
    order.dedup();
    for id in &current {
        if !order.contains(&id) {
            order.push(id);
        }
    }

    for (position, id) in order.iter().enumerate() {
        sqlx::query("UPDATE structure_documents SET position = ? WHERE id = ?")
            .bind(position as i64)
            .bind(id.as_str())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    list(pool, node_id).await
}

/// Remplace le contenu d'un document ; l'ancien est gardé comme version.
/// `name` : nouveau nom (fichier remplacé par un autre). Un contenu
/// identique ne crée pas de version.
pub async fn replace_content(
    pool: &SqlitePool,
    id: &str,
    bytes: &[u8],
    name: Option<&str>,
) -> AppResult<StructureDocument> {
    let current = get(pool, id).await?;
    let name = name.map(clean_name).unwrap_or_else(|| current.name.clone());
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(too_large(&name));
    }

    let mut tx = pool.begin().await?;
    let (blob_id, old): (String, Vec<u8>) = sqlx::query_as(
        "SELECT d.blob_id, b.data FROM structure_documents d JOIN document_blobs b ON b.id = d.blob_id WHERE d.id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(not_found)?;

    if old == bytes && name == current.name {
        return Ok(current);
    }

    sqlx::query(
        "INSERT INTO document_versions (id, document_id, blob_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(id)
    .bind(&blob_id)
    .bind(&current.name)
    .bind(&current.mime)
    .bind(current.size)
    .bind(now_utc())
    .execute(&mut *tx)
    .await?;

    let new_blob = insert_blob(&mut tx, bytes).await?;
    sqlx::query("UPDATE structure_documents SET blob_id = ?, name = ?, mime = ?, size = ?, updated_at = ? WHERE id = ?")
        .bind(&new_blob)
        .bind(&name)
        .bind(mime_of(&name, bytes))
        .bind(bytes.len() as i64)
        .bind(now_utc())
        .bind(id)
        .execute(&mut *tx)
        .await?;

    // Les versions les plus anciennes au-delà de 20.
    sqlx::query(
        "DELETE FROM document_versions WHERE document_id = ?1 AND id NOT IN \
         (SELECT id FROM document_versions WHERE document_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?2)",
    )
    .bind(id)
    .bind(MAX_VERSIONS)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    clean_orphans(pool).await?;
    get(pool, id).await
}

/// Met un document à la corbeille (ses versions partent avec lui) ; renvoie
/// l'identifiant de l'entrée de la corbeille.
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<String> {
    let mut tx = pool.begin().await?;
    let mut snapshot = Snapshot::new();
    snapshot.capture(&mut tx, "structure_documents", "id", id).await?;
    if snapshot.is_empty() {
        return Err(not_found());
    }
    let label: String = sqlx::query_scalar("SELECT name FROM structure_documents WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM structure_documents WHERE id = ?").bind(id).execute(&mut *tx).await?;
    let trash_id = snapshot.store(&mut tx, "document", id, &label).await?;
    tx.commit().await?;
    Ok(trash_id)
}

// ----------------------------------------------------------------------------
// Versions
// ----------------------------------------------------------------------------

pub async fn list_versions(pool: &SqlitePool, document_id: &str) -> AppResult<Vec<DocumentVersion>> {
    get(pool, document_id).await?;
    Ok(sqlx::query_as::<_, DocumentVersion>(
        "SELECT id, name, mime, size, created_at FROM document_versions WHERE document_id = ? \
         ORDER BY created_at DESC, rowid DESC",
    )
    .bind(document_id)
    .fetch_all(pool)
    .await?)
}

/// Contenu d'une version (pour la voir ou l'enregistrer ailleurs).
pub async fn version_content(pool: &SqlitePool, version_id: &str) -> AppResult<(DocumentVersion, Vec<u8>)> {
    let version = sqlx::query_as::<_, DocumentVersion>(
        "SELECT id, name, mime, size, created_at FROM document_versions WHERE id = ?",
    )
    .bind(version_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(version_not_found)?;
    let data: Vec<u8> = sqlx::query_scalar(
        "SELECT b.data FROM document_versions v JOIN document_blobs b ON b.id = v.blob_id WHERE v.id = ?",
    )
    .bind(version_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(version_not_found)?;
    Ok((version, data))
}

/// Remet une version ; le contenu actuel devient une version (rien n'est
/// perdu).
pub async fn restore_version(pool: &SqlitePool, document_id: &str, version_id: &str) -> AppResult<StructureDocument> {
    let current = get(pool, document_id).await?;
    let mut tx = pool.begin().await?;

    let version: Option<(String, String, String, i64)> = sqlx::query_as(
        "SELECT blob_id, name, mime, size FROM document_versions WHERE id = ? AND document_id = ?",
    )
    .bind(version_id)
    .bind(document_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((blob_id, name, mime, size)) = version else {
        return Err(version_not_found());
    };
    let current_blob: String = sqlx::query_scalar("SELECT blob_id FROM structure_documents WHERE id = ?")
        .bind(document_id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO document_versions (id, document_id, blob_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(document_id)
    .bind(&current_blob)
    .bind(&current.name)
    .bind(&current.mime)
    .bind(current.size)
    .bind(now_utc())
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM document_versions WHERE id = ?").bind(version_id).execute(&mut *tx).await?;
    sqlx::query("UPDATE structure_documents SET blob_id = ?, name = ?, mime = ?, size = ?, updated_at = ? WHERE id = ?")
        .bind(&blob_id)
        .bind(&name)
        .bind(&mime)
        .bind(size)
        .bind(now_utc())
        .bind(document_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    get(pool, document_id).await
}

pub async fn delete_version(pool: &SqlitePool, version_id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM document_versions WHERE id = ?").bind(version_id).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(version_not_found());
    }
    clean_orphans(pool).await
}

/// Supprime les contenus qui ne servent plus : ni document, ni version, ni
/// entrée de la corbeille (qui ne garde que leur identifiant).
pub async fn clean_orphans(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        "DELETE FROM document_blobs WHERE \
         NOT EXISTS (SELECT 1 FROM structure_documents d WHERE d.blob_id = document_blobs.id) \
         AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.blob_id = document_blobs.id) \
         AND NOT EXISTS (SELECT 1 FROM trash t WHERE instr(t.payload, document_blobs.id) > 0)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Textes des documents pour la recherche : (élément, nom, note, texte).
/// Le contenu n'est lu que pour les petits documents texte.
pub async fn search_rows(pool: &SqlitePool) -> AppResult<Vec<(String, String, String, String)>> {
    let rows: Vec<(String, String, String, Option<Vec<u8>>)> = sqlx::query_as(
        "SELECT d.node_id, d.name, d.note, \
         CASE WHEN (d.mime LIKE 'text/%' OR d.mime = 'application/json') AND d.size <= ? \
              THEN (SELECT data FROM document_blobs b WHERE b.id = d.blob_id) END \
         FROM structure_documents d ORDER BY d.name",
    )
    .bind(SEARCH_TEXT_BYTES)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(node, name, note, data)| {
            let text = data.map(|d| String::from_utf8_lossy(&d).into_owned()).unwrap_or_default();
            (node, name, note, text)
        })
        .collect())
}

// ----------------------------------------------------------------------------
// Modification dans une autre application
// ----------------------------------------------------------------------------

/// État d'un document ouvert dans une autre application.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OpenState {
    project_id: String,
    file_name: String,
    /// Empreinte du dernier contenu connu (écrit ou repris).
    hash: String,
    /// Date de modification et taille du fichier à ce moment-là.
    modified_ms: u128,
    len: u64,
}

/// Où en est un document ouvert ailleurs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStatus {
    /// Faux : le document n'est pas (ou plus) ouvert ailleurs.
    pub open: bool,
    /// Vrai : le fichier a été enregistré depuis la dernière reprise.
    pub changed: bool,
    pub path: String,
}

fn io_error(context: &str, error: impl std::fmt::Display) -> AppError {
    AppError::internal(format!("{context} : {error}"))
        .with_key("documents.fileError")
        .with_detail(error.to_string())
}

/// Extensions qui lanceraient un programme au lieu d'ouvrir un document.
const UNSAFE_EXTENSIONS: [&str; 34] = [
    "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "cpl", "dll", "sys", "lnk", "url", "hta", "reg",
    "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "jar", "msc", "inf", "application", "appref-ms",
    "sh", "command", "app", "desktop", "run", "bin",
];

/// Vrai si le document peut être ouvert avec l'application associée
/// (jamais un fichier qui lancerait un programme).
pub fn can_open_externally(name: &str) -> bool {
    let (_, ext) = split_extension(name);
    !ext.is_empty() && !UNSAFE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str())
}

/// Dossier de travail de tous les documents ouverts ailleurs.
pub fn open_root(data_dir: &Path) -> PathBuf {
    data_dir.join(OPEN_DIR)
}

/// Dossier de travail d'un document (un dossier par document : les
/// applications y créent souvent leurs fichiers temporaires).
pub fn open_dir(data_dir: &Path, user_id: &str, document_id: &str) -> PathBuf {
    open_root(data_dir).join(clean_name(user_id)).join(clean_name(document_id))
}

/// Supprime toutes les copies de travail (démarrage de GANIS).
pub fn clean_open_copies(data_dir: &Path) {
    let _ = std::fs::remove_dir_all(open_root(data_dir));
}

fn file_stamp(path: &Path) -> std::io::Result<(u128, u64)> {
    let meta = std::fs::metadata(path)?;
    let modified = meta
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    Ok((modified, meta.len()))
}

fn read_state(dir: &Path) -> Option<OpenState> {
    let text = std::fs::read_to_string(dir.join(STATE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_state(dir: &Path, state: &OpenState) -> AppResult<()> {
    let text = serde_json::to_string(state).map_err(|e| io_error("État du document ouvert", e))?;
    std::fs::write(dir.join(STATE_FILE), text).map_err(|e| io_error("État du document ouvert", e))
}

/// Écrit la copie de travail ; renvoie son chemin. Une copie déjà ouverte
/// est gardée telle quelle (elle peut contenir des modifications pas encore
/// reprises).
pub fn write_open_copy(dir: &Path, project_id: &str, name: &str, bytes: &[u8]) -> AppResult<PathBuf> {
    if let Some(state) = read_state(dir) {
        let path = dir.join(&state.file_name);
        if path.is_file() {
            return Ok(path);
        }
    }

    std::fs::create_dir_all(dir).map_err(|e| io_error("Dossier de travail", e))?;
    let file_name = clean_name(name);
    let path = dir.join(&file_name);
    std::fs::write(&path, bytes).map_err(|e| io_error("Copie du document", e))?;
    let (modified_ms, len) = file_stamp(&path).map_err(|e| io_error("Copie du document", e))?;
    write_state(
        dir,
        &OpenState { project_id: project_id.to_owned(), file_name, hash: sha256_hex(bytes), modified_ms, len },
    )?;
    Ok(path)
}

/// Le fichier a-t-il été enregistré dans l'autre application ? Renvoie
/// aussi le nouveau contenu quand il a changé.
pub fn check_open_copy(dir: &Path) -> AppResult<(ExternalStatus, Option<Vec<u8>>)> {
    let Some(state) = read_state(dir) else {
        return Ok((ExternalStatus { open: false, changed: false, path: String::new() }, None));
    };
    let path = dir.join(&state.file_name);
    let shown = path.to_string_lossy().into_owned();

    // Fichier momentanément absent (enregistrement en cours) : rien de neuf.
    let Ok((modified_ms, len)) = file_stamp(&path) else {
        return Ok((ExternalStatus { open: true, changed: false, path: shown }, None));
    };
    if modified_ms == state.modified_ms && len == state.len {
        return Ok((ExternalStatus { open: true, changed: false, path: shown }, None));
    }

    // Fichier encore verrouillé ou en cours d'écriture : on réessaiera.
    let Ok(bytes) = std::fs::read(&path) else {
        return Ok((ExternalStatus { open: true, changed: false, path: shown }, None));
    };
    if sha256_hex(&bytes) == state.hash {
        write_state(dir, &OpenState { modified_ms, len, ..state })?;
        return Ok((ExternalStatus { open: true, changed: false, path: shown }, None));
    }
    Ok((ExternalStatus { open: true, changed: true, path: shown }, Some(bytes)))
}

/// Le contenu repris devient le contenu connu de la copie.
pub fn mark_imported(dir: &Path, bytes: &[u8]) -> AppResult<()> {
    let Some(state) = read_state(dir) else {
        return Ok(());
    };
    let (modified_ms, len) = file_stamp(&dir.join(&state.file_name)).unwrap_or((0, 0));
    write_state(dir, &OpenState { hash: sha256_hex(bytes), modified_ms, len, ..state })
}

/// Termine la modification ailleurs : la copie de travail est supprimée.
pub fn close_open_copy(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::trash_service;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    async fn node(pool: &SqlitePool, id: &str) {
        sqlx::query(
            "INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) \
             VALUES (?, NULL, 0, 'Chapitre', '', 0, '2026-01-01', '2026-01-01')",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn blobs(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM document_blobs").fetch_one(pool).await.unwrap()
    }

    #[test]
    fn names_are_safe() {
        assert_eq!(clean_name("C:\\manga\\Chapitre 1.pdf"), "Chapitre 1.pdf");
        assert_eq!(clean_name("../../etc/passwd"), "passwd");
        assert_eq!(clean_name("a<b>:c?.docx"), "a_b__c_.docx");
        assert_eq!(clean_name("   "), "document");
        assert_eq!(clean_name(".."), "document");
        assert_eq!(clean_name("CON.txt"), "_CON.txt");
        let long = format!("{}.pdf", "x".repeat(400));
        let cleaned = clean_name(&long);
        assert!(cleaned.chars().count() <= MAX_NAME_CHARS && cleaned.ends_with(".pdf"));
    }

    #[test]
    fn programs_are_never_opened() {
        assert!(can_open_externally("Chapitre 1.docx"));
        assert!(can_open_externally("planche.clip"));
        assert!(!can_open_externally("setup.EXE"));
        assert!(!can_open_externally("script.ps1"));
        assert!(!can_open_externally("raccourci.lnk"));
        assert!(!can_open_externally("sans-extension"));
    }

    #[test]
    fn types_come_from_content_first() {
        assert_eq!(mime_of("planche.bin", b"\x89PNG\r\n\x1a\nxxxx"), "image/png");
        assert_eq!(mime_of("faux.docx", b"%PDF-1.7"), "application/pdf");
        assert_eq!(mime_of("Chapitre.DOCX", b"PK\x03\x04"), mime_of("a.docx", b""));
        assert_eq!(mime_of("notes.md", b"# Titre"), "text/markdown");
        assert_eq!(mime_of("inconnu", b"???"), "application/octet-stream");
    }

    #[tokio::test]
    async fn add_list_rename_move_and_reorder() {
        let pool = pool().await;
        node(&pool, "n1").await;
        node(&pool, "n2").await;

        let a = add(&pool, "n1", "Planche 01.png", b"\x89PNG\r\n\x1a\n1").await.unwrap();
        let b = add(&pool, "n1", "Chapitre.pdf", b"%PDF-1.7 ...").await.unwrap();
        assert_eq!((a.position, b.position), (0, 1));
        assert_eq!(b.mime, "application/pdf");
        assert!(add(&pool, "absent", "x.txt", b"x").await.is_err());

        let ordered = reorder(&pool, "n1", &[b.id.clone(), a.id.clone()]).await.unwrap();
        assert_eq!(ordered.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(), [b.id.as_str(), a.id.as_str()]);

        // Sans extension, le document garde la sienne.
        assert_eq!(rename(&pool, &b.id, "Chapitre 1 — final").await.unwrap().name, "Chapitre 1 — final.pdf");
        assert_eq!(set_note(&pool, &b.id, "  envoyé  ").await.unwrap().note, "envoyé");

        let moved = move_to(&pool, &a.id, "n2").await.unwrap();
        assert_eq!((moved.node_id.as_str(), moved.position), ("n2", 0));
        assert_eq!(list(&pool, "n1").await.unwrap().len(), 1);
        assert_eq!(content(&pool, &a.id).await.unwrap().1, b"\x89PNG\r\n\x1a\n1");
    }

    #[tokio::test]
    async fn versions_keep_old_content_and_restore() {
        let pool = pool().await;
        node(&pool, "n1").await;
        let doc = add(&pool, "n1", "scenario.txt", b"v1").await.unwrap();

        // Contenu identique : pas de version.
        assert_eq!(replace_content(&pool, &doc.id, b"v1", None).await.unwrap().versions, 0);
        let doc2 = replace_content(&pool, &doc.id, b"v2", None).await.unwrap();
        assert_eq!(doc2.versions, 1);
        assert_eq!(doc2.size, 2);

        let versions = list_versions(&pool, &doc.id).await.unwrap();
        assert_eq!(version_content(&pool, &versions[0].id).await.unwrap().1, b"v1");

        let back = restore_version(&pool, &doc.id, &versions[0].id).await.unwrap();
        assert_eq!(back.versions, 1);
        assert_eq!(content(&pool, &doc.id).await.unwrap().1, b"v1");

        // Fichier remplacé par un autre : nom et type suivent.
        let pdf = replace_content(&pool, &doc.id, b"%PDF-1.4", Some("scenario.pdf")).await.unwrap();
        assert_eq!((pdf.name.as_str(), pdf.mime.as_str()), ("scenario.pdf", "application/pdf"));

        for i in 0..30 {
            replace_content(&pool, &doc.id, format!("v{i}x").as_bytes(), None).await.unwrap();
        }
        assert_eq!(list_versions(&pool, &doc.id).await.unwrap().len() as i64, MAX_VERSIONS);
        // Contenus des versions retirées supprimés : document + 20 versions.
        assert_eq!(blobs(&pool).await, MAX_VERSIONS + 1);

        let last = list_versions(&pool, &doc.id).await.unwrap().pop().unwrap();
        delete_version(&pool, &last.id).await.unwrap();
        assert_eq!(blobs(&pool).await, MAX_VERSIONS);
    }

    #[tokio::test]
    async fn trash_keeps_content_until_purged() {
        let pool = pool().await;
        node(&pool, "n1").await;
        let doc = add(&pool, "n1", "Chapitre 1.pdf", b"%PDF-1.7 big").await.unwrap();
        replace_content(&pool, &doc.id, b"%PDF-1.7 bigger", None).await.unwrap();
        assert_eq!(blobs(&pool).await, 2);

        // Document supprimé : son contenu reste tant qu'il est dans la corbeille.
        let trash_id = delete(&pool, &doc.id).await.unwrap();
        trash_service::list(&pool).await.unwrap();
        assert_eq!(blobs(&pool).await, 2);
        trash_service::restore(&pool, &trash_id).await.unwrap();
        assert_eq!(content(&pool, &doc.id).await.unwrap().1, b"%PDF-1.7 bigger");
        assert_eq!(list_versions(&pool, &doc.id).await.unwrap().len(), 1);

        // Élément du découpage supprimé : ses documents partent avec lui.
        let snapshot_trash = {
            let mut tx = pool.begin().await.unwrap();
            let mut snapshot = Snapshot::new();
            snapshot.capture(&mut tx, "structure_nodes", "id", "n1").await.unwrap();
            sqlx::query("DELETE FROM structure_nodes WHERE id = 'n1'").execute(&mut *tx).await.unwrap();
            let id = snapshot.store(&mut tx, "structureNode", "n1", "Chapitre").await.unwrap();
            tx.commit().await.unwrap();
            id
        };
        assert_eq!(list(&pool, "n1").await.unwrap().len(), 0);
        trash_service::list(&pool).await.unwrap();
        assert_eq!(blobs(&pool).await, 2);

        trash_service::purge(&pool, &snapshot_trash).await.unwrap();
        assert_eq!(blobs(&pool).await, 0);
    }

    #[test]
    fn external_copy_detects_saves() {
        let dir = std::env::temp_dir().join(format!("ganis-open-{}", new_id()));
        let path = write_open_copy(&dir, "p1", "Chapitre 1.docx", b"one").unwrap();
        assert!(path.ends_with("Chapitre 1.docx"));

        let (status, bytes) = check_open_copy(&dir).unwrap();
        assert!(status.open && !status.changed && bytes.is_none());

        // Ouvrir à nouveau garde la copie (modifications pas encore reprises).
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&path, b"two!").unwrap();
        write_open_copy(&dir, "p1", "Chapitre 1.docx", b"one").unwrap();
        let (status, bytes) = check_open_copy(&dir).unwrap();
        assert!(status.changed);
        assert_eq!(bytes.as_deref(), Some(&b"two!"[..]));

        mark_imported(&dir, b"two!").unwrap();
        assert!(!check_open_copy(&dir).unwrap().0.changed);

        close_open_copy(&dir);
        assert!(!check_open_copy(&dir).unwrap().0.open);
    }
}
