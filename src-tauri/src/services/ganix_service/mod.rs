//! Format `.ganix` : projet portable (cahier des charges §23 et §24).
//!
//! Un `.ganix` est une archive ZIP qui ne contient que du XML et les images
//! du projet — jamais de base de données :
//!
//! ```text
//! mon-projet.ganix
//! ├── manifest.xml     identité, versions, contenu, compatibilité
//! ├── checksums.xml    empreintes SHA-256 des autres fichiers
//! ├── project.xml      toutes les données du projet, table par table
//! └── assets/
//!     └── 3f/3fa9c1…e2.png   images, nommées par leur empreinte SHA-256
//! ```
//!
//! `project.xml` contient, pour chaque table du projet, ses lignes et leurs
//! valeurs :
//!
//! ```xml
//! <project schemaVersion="9">
//!   <table name="characters">
//!     <row>
//!       <id>c1</id>
//!       <first_name>Aldric</first_name>
//!       <sort_order type="integer">3</sort_order>
//!       <died_at type="null"/>
//!     </row>
//!   </table>
//!   <table name="character_portraits">
//!     <row>
//!       <character_id>c1</character_id>
//!       <data type="asset">assets/3f/3fa9c1…e2.png</data>
//!     </row>
//!   </table>
//! </project>
//! ```
//!
//! Types d'une valeur (attribut `type`, absent pour un texte) : `integer`,
//! `real`, `null`, `asset` (image, ou document de 64 Ko et plus en `.bin`,
//! dans `assets/`), `blob` (autres données binaires, en base64) et `text-base64` (texte contenant des caractères
//! interdits en XML). Aucune donnée de compte n'est exportée (ni mot de
//! passe, ni clé, ni identifiant d'utilisateur).
//!
//! # Export (§24.1)
//! Lecture du projet dans une seule transaction (instantané cohérent),
//! écriture du XML et des images, empreintes, manifeste, archive écrite sous
//! un nom temporaire (`.ganix.part`), relue et vérifiée, puis renommée : un
//! export interrompu ne laisse jamais un faux `.ganix`.
//!
//! # Import (§24.2)
//! Rien n'est écrit dans l'espace de l'utilisateur avant la fin des
//! contrôles. Le fichier est vérifié puis extrait dans une zone d'attente
//! (`staging/<id>`). GANIS y **reconstruit lui-même** la base : schéma créé
//! par ses propres migrations (jusqu'à la version du fichier), puis lignes
//! du XML insérées colonne par colonne, contraintes et clés étrangères
//! vérifiées. Le fichier n'apporte donc que des données : aucune table,
//! aucun déclencheur, aucune requête SQL ne vient de lui. L'utilisateur voit
//! un aperçu et confirme ; la base est alors chiffrée avec la clé du projet,
//! mise à jour par les migrations restantes, contrôlée une dernière fois,
//! puis rattachée au compte.
//!
//! Contrôles : structure du ZIP (noms autorisés, pas de chemin absolu ni de
//! « .. », pas de lien symbolique, tailles et taux de compression),
//! manifeste, compatibilité, empreintes, type réel des images, XML (aucune
//! DTD ni entité externe, seulement les tables et colonnes connues),
//! intégrité de la base reconstruite.

use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
use crate::db::project_db::{export_encrypted, init_project_db, DB_FILE};
use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType};
use crate::security::crypto::SecretKey;
use crate::services::{project_service, project_storage};
use crate::state::AppState;
use crate::utils::{new_id, now_utc};
use base64::Engine as _;
use futures_util::TryStreamExt;
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

// ----------------------------------------------------------------------------
// Avancement (barre de progression de l'interface)
// ----------------------------------------------------------------------------

/// Étape d'un export ou d'un import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    /// Export : lecture des données du projet (lignes).
    Data,
    /// Export : écriture des images et documents dans l'archive ;
    /// import : extraction et contrôle des fichiers.
    Files,
    /// Relecture et contrôle de l'archive écrite (sans total).
    Verify,
    /// Import : reconstruction de la base (lignes).
    Build,
}

/// Avancement : `done` sur `total` (total 0 : étape sans mesure).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: Stage,
    pub done: u64,
    pub total: u64,
}

/// Reçoit l'avancement (la commande le transmet à l'interface).
pub type Reporter<'a> = &'a (dyn Fn(Progress) + Send + Sync);

/// Avancement ignoré (sauvegardes internes, tests).
pub fn no_progress(_: Progress) {}

/// Version de la structure de l'archive (§23.1).
pub const FORMAT_VERSION: u32 = 1;

/// Version minimale de GANIS capable de lire les fichiers produits.
const MIN_APP_VERSION: &str = "0.1.0";

const MANIFEST: &str = "manifest.xml";
const CHECKSUMS: &str = "checksums.xml";
const DATA: &str = "project.xml";
const ASSETS_PREFIX: &str = "assets/";
/// Contenus binaires (hors images) écrits à part, en `assets/xx/<empreinte>.bin`,
/// à partir de cette taille ; les plus petits restent en base64 dans le XML.
const BIN_ASSET_MIN_BYTES: usize = 64 * 1024;

/// Fichiers de la zone d'attente (jamais dans une archive).
const STAGED_DB: &str = "staged.db";
const STAGED_MANIFEST: &str = "staged-manifest.json";
const STAGED_ASSETS: &str = "assets";

/// Limites de sécurité (§24.4).
const MAX_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED: u64 = 4 * 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 100_000;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_PATH_CHARS: usize = 255;
/// Taux de compression maximal d'un fichier. Un XML très répétitif se
/// compresse énormément : le contrôle ne vaut qu'au-delà de 10 Mo.
const MAX_RATIO: u64 = 100;
const RATIO_MIN_BYTES: u64 = 10 * 1024 * 1024;
/// Profondeur et nombre d'éléments maximaux du manifeste et des empreintes.
const MAX_XML_DEPTH: usize = 16;
const MAX_XML_NODES: usize = MAX_ENTRIES + 64;

/// Dossiers de travail dans le dossier de données de l'application.
const STAGING_DIR: &str = "staging";
const WORK_DIR: &str = "tmp";

/// Tables propres à SQLite ou à sqlx : jamais exportées.
const INTERNAL_TABLE: &str = "_sqlx_migrations";

// ----------------------------------------------------------------------------
// Erreurs (§24.5 : message simple pour l'utilisateur, détail dans le journal)
// ----------------------------------------------------------------------------

fn ganix_error(key: &'static str, message: &str, detail: impl std::fmt::Display) -> AppError {
    AppError::validation(message.to_owned())
        .with_key(key)
        .with_detail(detail)
}

fn unreadable(detail: impl std::fmt::Display) -> AppError {
    ganix_error("ganix.unreadable", "Ce fichier .ganix est illisible.", detail)
}

fn damaged(detail: impl std::fmt::Display) -> AppError {
    ganix_error(
        "ganix.damaged",
        "Ce fichier est endommagé ou incomplet. Essayez de le télécharger à nouveau.",
        detail,
    )
}

fn unsafe_archive(detail: impl std::fmt::Display) -> AppError {
    ganix_error(
        "ganix.unsafe",
        "Ce fichier contient des éléments non autorisés et a été refusé.",
        detail,
    )
}

fn not_ganix(detail: impl std::fmt::Display) -> AppError {
    ganix_error("ganix.notGanix", "Ce fichier n'est pas un projet GANIS.", detail)
}

fn too_new(detail: impl std::fmt::Display) -> AppError {
    ganix_error(
        "ganix.tooNew",
        "Ce projet a été créé avec une version plus récente de GANIS : mettez l'application à jour.",
        detail,
    )
}

fn io_error(context: &str, e: impl std::fmt::Display) -> AppError {
    AppError::io(format!("{context} : {e}"))
}

// ----------------------------------------------------------------------------
// Manifeste (§23.3)
// ----------------------------------------------------------------------------

/// Contenu de `manifest.xml`. (Sérialisable en JSON pour la zone d'attente.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub min_app_version: String,
    pub created_with: String,
    pub schema_version: i64,
    pub export: ExportInfo,
    pub project: ProjectInfo,
    pub author: AuthorInfo,
    pub content: ContentInfo,
    pub encryption: EncryptionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportInfo {
    pub id: String,
    pub exported_at: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub kind: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthorInfo {
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContentInfo {
    pub counts: Counts,
    pub assets: AssetsInfo,
    pub data: DataInfo,
}

/// Statistiques montrées dans l'aperçu avant import.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub characters: i64,
    pub locations: i64,
    pub structure_nodes: i64,
    pub relations: i64,
    pub place_links: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AssetsInfo {
    pub count: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DataInfo {
    pub file: String,
    pub size_bytes: u64,
    pub tables: u64,
    pub rows: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionInfo {
    pub enabled: bool,
}

/// Contenu de `checksums.xml` : chemin → empreinte SHA-256.
#[derive(Debug, Clone, Default)]
struct Checksums {
    files: BTreeMap<String, String>,
}

// ----------------------------------------------------------------------------
// Outils
// ----------------------------------------------------------------------------

/// Version de l'application (Cargo.toml).
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Compare deux versions « majeur.mineur.correctif » (parties manquantes : 0).
fn version_le(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.').map(|part| part.trim().parse::<u64>().unwrap_or(u64::MAX)).collect()
    };
    let (mut a, mut b) = (parse(a), parse(b));
    a.resize(3, 0);
    b.resize(3, 0);
    a <= b
}

/// Dernière migration du schéma des projets connue de cette version.
pub fn current_schema_version() -> i64 {
    PROJECT_MIGRATOR.iter().map(|m| m.version).max().unwrap_or(0)
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut reader = BufReader::new(File::open(path).map_err(|e| io_error("Lecture", e))?);
    sha256_reader(&mut reader)
}

fn sha256_reader(reader: &mut impl Read) -> AppResult<String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];

    loop {
        let read = reader.read(&mut buffer).map_err(|e| io_error("Lecture", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

/// Nom de fichier proposé : `<nom du projet>.ganix`, sans caractère
/// interdit par Windows.
pub fn suggested_file_name(project_name: &str) -> String {
    let cleaned: String = project_name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    let base: String = cleaned.chars().take(120).collect();

    format!("{}.ganix", if base.is_empty() { "projet" } else { &base })
}

/// Identifiant SQL entre guillemets.
fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Type réel d'une image d'après ses premiers octets → extension.
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else {
        None
    }
}

/// Chemin d'une image dans l'archive : `assets/<2 car.>/<empreinte>.<ext>`.
fn asset_entry_name(hash: &str, extension: &str) -> String {
    format!("{ASSETS_PREFIX}{}/{hash}.{extension}", &hash[..2])
}

/// Décompose un nom d'image de l'archive → (empreinte, extension).
fn parse_asset_name(name: &str) -> Option<(&str, &str)> {
    let rest = name.strip_prefix(ASSETS_PREFIX)?;
    let (folder, file) = rest.split_once('/')?;
    let (hash, extension) = file.split_once('.')?;

    let hex = |s: &str| s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    let ok = hash.len() == 64
        && hex(hash)
        && folder == &hash[..2]
        && matches!(extension, "png" | "jpg" | "webp" | "gif" | "bin");

    ok.then_some((hash, extension))
}

/// Un texte peut être écrit tel quel en XML 1.0 (sinon : base64). Les
/// retours chariot sont aussi encodés : un lecteur XML les convertirait.
fn xml_safe(text: &str) -> bool {
    text.chars().all(|c| {
        matches!(c, '\t' | '\n')
            || (c >= '\u{20}' && c != '\u{FFFE}' && c != '\u{FFFF}')
    })
}

/// Base SQLite en clair, sans migration : zone d'attente ou préparation de
/// la copie chiffrée. Clés étrangères vérifiées explicitement.
async fn open_plain(path: &Path) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        // Le droit de création sert aussi à ATTACH (copie chiffrée).
        .create_if_missing(true)
        .foreign_keys(false)
        .pragma("trusted_schema", "OFF");

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| AppError::database(&e).with_detail(format!("Ouverture de la base de travail : {e}")))
}

async fn count(conn: &mut SqliteConnection, table: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(0)
}

async fn counts(conn: &mut SqliteConnection) -> Counts {
    Counts {
        characters: count(conn, "characters").await,
        locations: count(conn, "locations").await,
        structure_nodes: count(conn, "structure_nodes").await,
        relations: count(conn, "character_relations").await,
        place_links: count(conn, "character_locations").await,
    }
}

async fn schema_version_of(conn: &mut SqliteConnection) -> AppResult<i64> {
    sqlx::query_scalar::<_, Option<i64>>("SELECT MAX(version) FROM _sqlx_migrations WHERE success = 1")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| AppError::database(&e).with_detail(format!("Version du schéma illisible : {e}")))?
        .ok_or_else(|| AppError::internal("Aucune migration enregistrée"))
}

/// Tables du projet et leurs colonnes (dans l'ordre du schéma).
async fn user_tables(conn: &mut SqliteConnection) -> AppResult<BTreeMap<String, Vec<String>>> {
    let names: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' \
         AND name NOT LIKE 'sqlite_%' AND name <> ? ORDER BY name",
    )
    .bind(INTERNAL_TABLE)
    .fetch_all(&mut *conn)
    .await?;

    let mut tables = BTreeMap::new();

    for name in names {
        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info(?) ORDER BY cid")
                .bind(&name)
                .fetch_all(&mut *conn)
                .await?;
        tables.insert(name, columns);
    }

    Ok(tables)
}

mod archive;
mod export;
mod import;
mod rebuild;
mod xml;

#[cfg(test)]
mod tests;

pub use archive::*;
pub use export::*;
pub use import::*;
use rebuild::*;
use xml::*;
