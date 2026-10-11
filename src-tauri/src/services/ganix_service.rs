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
//! `real`, `null`, `asset` (image dans `assets/`), `blob` (autres données
//! binaires, en base64) et `text-base64` (texte contenant des caractères
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

/// Version de la structure de l'archive (§23.1).
pub const FORMAT_VERSION: u32 = 1;

/// Version minimale de GANIS capable de lire les fichiers produits.
const MIN_APP_VERSION: &str = "0.1.0";

const MANIFEST: &str = "manifest.xml";
const CHECKSUMS: &str = "checksums.xml";
const DATA: &str = "project.xml";
const ASSETS_PREFIX: &str = "assets/";

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
        && matches!(extension, "png" | "jpg" | "webp" | "gif");

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

// ----------------------------------------------------------------------------
// XML : petit arbre pour le manifeste et les empreintes
// ----------------------------------------------------------------------------

#[derive(Debug, Default)]
struct XmlNode {
    name: String,
    attributes: BTreeMap<String, String>,
    text: String,
    children: Vec<XmlNode>,
}

impl XmlNode {
    fn child(&self, name: &str) -> Option<&XmlNode> {
        self.children.iter().find(|child| child.name == name)
    }

    fn attr(&self, name: &str) -> Option<&str> {
        self.attributes.get(name).map(String::as_str)
    }
}

fn reader_config<R>(reader: &mut Reader<R>) {
    let config = reader.config_mut();
    config.expand_empty_elements = true;
    config.check_end_names = true;
    config.trim_text(false);
}

fn element_name(start: &BytesStart<'_>) -> AppResult<String> {
    Ok(start.name().as_ref().to_owned())
}

fn attributes_of(start: &BytesStart<'_>) -> AppResult<BTreeMap<String, String>> {
    let mut attributes = BTreeMap::new();

    for attribute in start.attributes() {
        let attribute = attribute.map_err(|e| damaged(format!("XML : attribut invalide : {e}")))?;
        let key = attribute.key.as_ref().to_owned();
        let value = attribute
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|e| damaged(format!("XML : attribut invalide : {e}")))?
            .into_owned();
        attributes.insert(key, value);
    }

    Ok(attributes)
}

/// Texte d'une référence d'entité (`&amp;`, `&#233;`…). Seules les entités
/// prédéfinies du XML sont acceptées : aucune entité déclarée par le fichier.
fn resolve_reference(reference: &quick_xml::events::BytesRef<'_>) -> AppResult<String> {
    if reference.is_char_ref() {
        return reference
            .resolve_char_ref()
            .ok()
            .flatten()
            .map(String::from)
            .ok_or_else(|| damaged("XML : référence de caractère invalide"));
    }

    let name = reference.xml10_content();
    quick_xml::escape::resolve_predefined_entity(&name)
        .map(str::to_owned)
        .ok_or_else(|| unsafe_archive(format!("XML : entité inconnue &{name};")))
}

/// Lit un petit document XML (déjà limité en taille) en arbre.
fn parse_tree(bytes: &[u8]) -> AppResult<XmlNode> {
    let mut reader = Reader::from_reader(bytes);
    reader_config(&mut reader);

    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root: Option<XmlNode> = None;
    let mut nodes = 0usize;
    let mut buf = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| damaged(format!("XML invalide : {e}")))?;

        match event {
            Event::Decl(_) | Event::Comment(_) => {}
            Event::DocType(_) | Event::PI(_) => {
                return Err(unsafe_archive("XML : DTD ou instruction refusée"));
            }
            Event::Start(start) => {
                nodes += 1;
                if root.is_some() || stack.len() >= MAX_XML_DEPTH || nodes > MAX_XML_NODES {
                    return Err(damaged("XML : structure inattendue"));
                }
                stack.push(XmlNode {
                    name: element_name(&start)?,
                    attributes: attributes_of(&start)?,
                    ..XmlNode::default()
                });
            }
            Event::End(_) => {
                let node = stack.pop().ok_or_else(|| damaged("XML : fin inattendue"))?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => root = Some(node),
                }
            }
            Event::Text(text) => {
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&text.xml10_content());
                }
            }
            Event::CData(data) => {
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&data.xml10_content());
                }
            }
            Event::GeneralRef(reference) => {
                let text = resolve_reference(&reference)?;
                if let Some(node) = stack.last_mut() {
                    node.text.push_str(&text);
                }
            }
            Event::Empty(_) => unreachable!("expand_empty_elements"),
            Event::Eof => break,
        }

        buf.clear();
    }

    root.ok_or_else(|| damaged("XML vide"))
}

// ----------------------------------------------------------------------------
// XML : écriture
// ----------------------------------------------------------------------------

type XmlWriter<W> = Writer<W>;

fn xml_error(e: impl std::fmt::Display) -> AppError {
    io_error("Écriture du XML", e)
}

fn write_decl<W: Write>(writer: &mut XmlWriter<W>) -> AppResult<()> {
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(xml_error)
}

/// `<name attr…>texte</name>` (ou vide).
fn write_text_element<W: Write>(
    writer: &mut XmlWriter<W>,
    name: &str,
    attributes: &[(&str, &str)],
    text: &str,
) -> AppResult<()> {
    let element = writer
        .create_element(name)
        .with_attributes(attributes.iter().copied());

    if text.is_empty() {
        element.write_empty().map_err(xml_error)?;
    } else {
        // Seuls & < > sont échappés : le texte (JSON des fiches…) reste lisible.
        element
            .write_text_content(BytesText::from_escaped(quick_xml::escape::partial_escape(text)))
            .map_err(xml_error)?;
    }

    Ok(())
}

fn write_empty_element<W: Write>(
    writer: &mut XmlWriter<W>,
    name: &str,
    attributes: &[(&str, &str)],
) -> AppResult<()> {
    writer
        .create_element(name)
        .with_attributes(attributes.iter().copied())
        .write_empty()
        .map_err(xml_error)?;
    Ok(())
}

fn manifest_xml(manifest: &Manifest) -> AppResult<Vec<u8>> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    write_decl(&mut writer)?;

    let format_version = manifest.format_version.to_string();
    let schema_version = manifest.schema_version.to_string();
    let content = &manifest.content;
    let counts = &content.counts;
    let n = |value: i64| value.to_string();

    writer
        .create_element("manifest")
        .with_attributes([
            ("format", manifest.format.as_str()),
            ("formatVersion", format_version.as_str()),
            ("minAppVersion", manifest.min_app_version.as_str()),
            ("createdWith", manifest.created_with.as_str()),
            ("schemaVersion", schema_version.as_str()),
        ])
        .write_inner_content(|w| {
            let e = &manifest.export;
            write_empty_element(w, "export", &[("id", &e.id), ("exportedAt", &e.exported_at), ("kind", &e.kind)])
                .map_err(std::io::Error::other)?;

            let p = &manifest.project;
            w.create_element("project")
                .with_attributes([
                    ("id", p.id.as_str()),
                    ("type", p.kind.as_str()),
                    ("status", p.status.as_str()),
                    ("createdAt", p.created_at.as_str()),
                    ("updatedAt", p.updated_at.as_str()),
                ])
                .write_inner_content(|w| {
                    write_text_element(w, "name", &[], &p.name).map_err(std::io::Error::other)?;
                    write_text_element(w, "description", &[], &p.description)
                        .map_err(std::io::Error::other)?;
                    Ok(())
                })?;

            match &manifest.author.display_name {
                Some(name) => write_text_element(w, "author", &[], name),
                None => write_empty_element(w, "author", &[]),
            }
            .map_err(std::io::Error::other)?;

            w.create_element("content").write_inner_content(|w| {
                write_empty_element(
                    w,
                    "counts",
                    &[
                        ("characters", &n(counts.characters)),
                        ("locations", &n(counts.locations)),
                        ("structureNodes", &n(counts.structure_nodes)),
                        ("relations", &n(counts.relations)),
                        ("placeLinks", &n(counts.place_links)),
                    ],
                )
                .map_err(std::io::Error::other)?;
                write_empty_element(
                    w,
                    "assets",
                    &[
                        ("count", &content.assets.count.to_string()),
                        ("totalBytes", &content.assets.total_bytes.to_string()),
                    ],
                )
                .map_err(std::io::Error::other)?;
                write_empty_element(
                    w,
                    "data",
                    &[
                        ("file", &content.data.file),
                        ("sizeBytes", &content.data.size_bytes.to_string()),
                        ("tables", &content.data.tables.to_string()),
                        ("rows", &content.data.rows.to_string()),
                    ],
                )
                .map_err(std::io::Error::other)?;
                Ok(())
            })?;

            write_empty_element(w, "packages", &[]).map_err(std::io::Error::other)?;
            write_empty_element(w, "integrity", &[("algorithm", "sha256"), ("checksumsFile", CHECKSUMS)])
                .map_err(std::io::Error::other)?;
            write_empty_element(
                w,
                "encryption",
                &[("enabled", if manifest.encryption.enabled { "true" } else { "false" })],
            )
            .map_err(std::io::Error::other)?;
            Ok(())
        })
        .map_err(xml_error)?;

    Ok(writer.into_inner())
}

fn checksums_xml(checksums: &Checksums) -> AppResult<Vec<u8>> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    write_decl(&mut writer)?;

    writer
        .create_element("checksums")
        .with_attribute(("algorithm", "sha256"))
        .write_inner_content(|w| {
            for (path, hash) in &checksums.files {
                write_empty_element(w, "file", &[("path", path), ("sha256", hash)])
                    .map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .map_err(xml_error)?;

    Ok(writer.into_inner())
}

// ----------------------------------------------------------------------------
// XML : lecture du manifeste et des empreintes
// ----------------------------------------------------------------------------

fn required<'a>(node: &'a XmlNode, attribute: &str) -> AppResult<&'a str> {
    node.attr(attribute)
        .ok_or_else(|| not_ganix(format!("MANIFEST_INVALID : {}@{attribute} manquant", node.name)))
}

fn number<T: std::str::FromStr>(node: &XmlNode, attribute: &str) -> AppResult<T> {
    required(node, attribute)?
        .trim()
        .parse()
        .map_err(|_| not_ganix(format!("MANIFEST_INVALID : {}@{attribute}", node.name)))
}

fn optional_number<T: std::str::FromStr + Default>(node: Option<&XmlNode>, attribute: &str) -> T {
    node.and_then(|n| n.attr(attribute))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or_default()
}

fn parse_manifest(bytes: &[u8]) -> AppResult<Manifest> {
    let root = parse_tree(bytes).map_err(|e| not_ganix(format!("MANIFEST_INVALID : {:?}", e.detail())))?;

    if root.name != "manifest" {
        return Err(not_ganix("MANIFEST_INVALID : élément racine"));
    }

    let format = required(&root, "format")?.to_owned();
    if format != "ganix" {
        return Err(not_ganix(format!("MANIFEST_INVALID : format {format}")));
    }

    let export = root.child("export").ok_or_else(|| not_ganix("MANIFEST_INVALID : export"))?;
    let project = root.child("project").ok_or_else(|| not_ganix("MANIFEST_INVALID : project"))?;
    let name = project
        .child("name")
        .map(|n| n.text.clone())
        .filter(|n| !n.trim().is_empty())
        .ok_or_else(|| not_ganix("MANIFEST_INVALID : nom du projet"))?;

    let content = root.child("content");
    let counts = content.and_then(|c| c.child("counts"));
    let assets = content.and_then(|c| c.child("assets"));
    let data = content
        .and_then(|c| c.child("data"))
        .ok_or_else(|| not_ganix("MANIFEST_INVALID : data"))?;

    let encryption_enabled = root
        .child("encryption")
        .and_then(|e| e.attr("enabled"))
        .is_some_and(|v| v == "true");

    Ok(Manifest {
        format,
        format_version: number(&root, "formatVersion")?,
        min_app_version: required(&root, "minAppVersion")?.to_owned(),
        created_with: required(&root, "createdWith")?.to_owned(),
        schema_version: number(&root, "schemaVersion")?,
        export: ExportInfo {
            id: required(export, "id")?.to_owned(),
            exported_at: required(export, "exportedAt")?.to_owned(),
            kind: export.attr("kind").unwrap_or("full").to_owned(),
        },
        project: ProjectInfo {
            id: required(project, "id")?.to_owned(),
            name,
            description: project.child("description").map(|d| d.text.clone()).unwrap_or_default(),
            kind: required(project, "type")?.to_owned(),
            status: required(project, "status")?.to_owned(),
            created_at: project.attr("createdAt").unwrap_or_default().to_owned(),
            updated_at: project.attr("updatedAt").unwrap_or_default().to_owned(),
        },
        author: AuthorInfo {
            display_name: root
                .child("author")
                .map(|a| a.text.trim().to_owned())
                .filter(|a| !a.is_empty()),
        },
        content: ContentInfo {
            counts: Counts {
                characters: optional_number(counts, "characters"),
                locations: optional_number(counts, "locations"),
                structure_nodes: optional_number(counts, "structureNodes"),
                relations: optional_number(counts, "relations"),
                place_links: optional_number(counts, "placeLinks"),
            },
            assets: AssetsInfo {
                count: optional_number(assets, "count"),
                total_bytes: optional_number(assets, "totalBytes"),
            },
            data: DataInfo {
                file: required(data, "file")?.to_owned(),
                size_bytes: optional_number(Some(data), "sizeBytes"),
                tables: optional_number(Some(data), "tables"),
                rows: optional_number(Some(data), "rows"),
            },
        },
        encryption: EncryptionInfo { enabled: encryption_enabled },
    })
}

fn parse_checksums(bytes: &[u8]) -> AppResult<Checksums> {
    let root = parse_tree(bytes)?;

    if root.name != "checksums" || root.attr("algorithm") != Some("sha256") {
        return Err(damaged("checksums.xml : algorithme d'empreinte inconnu"));
    }

    let mut checksums = Checksums::default();

    for file in root.children.iter().filter(|c| c.name == "file") {
        let path = file.attr("path").ok_or_else(|| damaged("checksums.xml : chemin manquant"))?;
        let hash = file
            .attr("sha256")
            .filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or_else(|| damaged(format!("checksums.xml : empreinte invalide pour {path}")))?;

        if checksums.files.insert(path.to_owned(), hash.to_ascii_lowercase()).is_some() {
            return Err(damaged(format!("checksums.xml : doublon {path}")));
        }
    }

    Ok(checksums)
}

// ----------------------------------------------------------------------------
// Export (§24.1)
// ----------------------------------------------------------------------------

/// Résultat de l'écriture de `project.xml`.
struct DataExport {
    schema_version: i64,
    counts: Counts,
    tables: u64,
    rows: u64,
    /// Nom dans l'archive → fichier de travail.
    assets: BTreeMap<String, PathBuf>,
    assets_bytes: u64,
}

/// Écrit le `.ganix` d'un projet à `target`. `source` : base du projet
/// (déjà ouverte), `work_dir` : dossier de travail vide, supprimé ensuite.
pub async fn write_ganix(
    source: &SqlitePool,
    project: &Project,
    target: &Path,
    work_dir: &Path,
) -> AppResult<()> {
    std::fs::create_dir_all(work_dir).map_err(|e| io_error("Dossier de travail", e))?;

    let result = write_ganix_inner(source, project, target, work_dir).await;

    let _ = std::fs::remove_dir_all(work_dir);

    if result.is_err() {
        let _ = std::fs::remove_file(part_path(target));
    }

    result
}

fn part_path(target: &Path) -> PathBuf {
    let mut name = target.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

/// Écrit une valeur de colonne.
fn write_value<W: Write>(
    writer: &mut XmlWriter<W>,
    column: &str,
    kind: &str,
    row: &sqlx::sqlite::SqliteRow,
    index: usize,
    work_dir: &Path,
    export: &mut DataExport,
) -> AppResult<()> {
    let db = |e: sqlx::Error| AppError::database(&e).with_detail(format!("Lecture de {column} : {e}"));

    match kind {
        "null" => write_empty_element(writer, column, &[("type", "null")]),
        "integer" => {
            let value: i64 = row.try_get(index).map_err(db)?;
            write_text_element(writer, column, &[("type", "integer")], &value.to_string())
        }
        "real" => {
            let value: f64 = row.try_get(index).map_err(db)?;
            write_text_element(writer, column, &[("type", "real")], &value.to_string())
        }
        "text" => {
            let value: String = row.try_get(index).map_err(db)?;
            if xml_safe(&value) {
                write_text_element(writer, column, &[], &value)
            } else {
                write_text_element(writer, column, &[("type", "text-base64")], &b64().encode(value.as_bytes()))
            }
        }
        "blob" => {
            let value: Vec<u8> = row.try_get(index).map_err(db)?;

            match image_extension(&value) {
                Some(extension) => {
                    let hash = sha256_hex(&value);
                    let name = asset_entry_name(&hash, extension);

                    if !export.assets.contains_key(&name) {
                        let path = work_dir.join(STAGED_ASSETS).join(format!("{hash}.{extension}"));
                        std::fs::write(&path, &value).map_err(|e| io_error("Image", e))?;
                        export.assets_bytes += value.len() as u64;
                        export.assets.insert(name.clone(), path);
                    }

                    write_text_element(writer, column, &[("type", "asset")], &name)
                }
                None => write_text_element(writer, column, &[("type", "blob")], &b64().encode(&value)),
            }
        }
        other => Err(AppError::internal(format!("Type SQLite inattendu : {other}"))),
    }
}

/// Écrit `project.xml` depuis la base du projet, dans une seule transaction
/// de lecture (instantané cohérent).
async fn write_data(source: &SqlitePool, data_path: &Path, work_dir: &Path) -> AppResult<DataExport> {
    std::fs::create_dir_all(work_dir.join(STAGED_ASSETS)).map_err(|e| io_error("Dossier de travail", e))?;

    let mut tx = source.begin().await?;
    let schema_version = schema_version_of(&mut tx).await?;
    let tables = user_tables(&mut tx).await?;

    let mut export = DataExport {
        schema_version,
        counts: counts(&mut tx).await,
        tables: tables.len() as u64,
        rows: 0,
        assets: BTreeMap::new(),
        assets_bytes: 0,
    };

    let file = File::create(data_path).map_err(|e| io_error("Création de project.xml", e))?;
    let mut writer = Writer::new_with_indent(BufWriter::new(file), b' ', 2);
    write_decl(&mut writer)?;

    let schema = schema_version.to_string();
    writer
        .write_event(Event::Start(BytesStart::new("project").with_attributes([("schemaVersion", schema.as_str())])))
        .map_err(xml_error)?;

    for (table, columns) in &tables {
        writer
            .write_event(Event::Start(BytesStart::new("table").with_attributes([("name", table.as_str())])))
            .map_err(xml_error)?;

        if !columns.is_empty() {
            // typeof(col) puis col, pour chaque colonne : le type réel de
            // chaque valeur (SQLite autorise des types mélangés).
            let select = columns
                .iter()
                .map(|c| format!("typeof({0}), {0}", quote_ident(c)))
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!("SELECT {select} FROM {}", quote_ident(table));

            let mut rows = sqlx::query(&sql).fetch(&mut *tx);

            while let Some(row) = rows.try_next().await? {
                writer
                    .write_event(Event::Start(BytesStart::new("row")))
                    .map_err(xml_error)?;

                for (i, column) in columns.iter().enumerate() {
                    let kind: String = row.try_get(2 * i)?;
                    write_value(&mut writer, column, &kind, &row, 2 * i + 1, work_dir, &mut export)?;
                }

                writer
                    .write_event(Event::End(BytesEnd::new("row")))
                    .map_err(xml_error)?;
                export.rows += 1;
            }
        }

        writer
            .write_event(Event::End(BytesEnd::new("table")))
            .map_err(xml_error)?;
    }

    writer
        .write_event(Event::End(BytesEnd::new("project")))
        .map_err(xml_error)?;

    tx.rollback().await?;

    writer
        .into_inner()
        .into_inner()
        .map_err(|e| io_error("Écriture de project.xml", e))?
        .sync_all()
        .map_err(|e| io_error("Écriture de project.xml", e))?;

    Ok(export)
}

async fn write_ganix_inner(
    source: &SqlitePool,
    project: &Project,
    target: &Path,
    work_dir: &Path,
) -> AppResult<()> {
    // 1-3. Données en XML, images à part.
    let data_path = work_dir.join(DATA);
    let export = write_data(source, &data_path, work_dir).await?;

    // 4. Empreintes.
    let data_size = std::fs::metadata(&data_path).map_err(|e| io_error("Taille", e))?.len();
    let mut checksums = Checksums::default();
    checksums.files.insert(DATA.to_owned(), sha256_file(&data_path)?);
    for name in export.assets.keys() {
        let (hash, _) = parse_asset_name(name).ok_or_else(|| AppError::internal("Nom d'image"))?;
        checksums.files.insert(name.clone(), hash.to_owned());
    }

    // 5. Manifeste.
    let manifest = Manifest {
        format: "ganix".to_owned(),
        format_version: FORMAT_VERSION,
        min_app_version: MIN_APP_VERSION.to_owned(),
        created_with: app_version().to_owned(),
        schema_version: export.schema_version,
        export: ExportInfo { id: new_id(), exported_at: now_utc(), kind: "full".to_owned() },
        project: ProjectInfo {
            id: project.id.clone(),
            name: project.name.clone(),
            description: project.description.clone(),
            kind: project.project_type.as_str().to_owned(),
            status: project.status.as_str().to_owned(),
            created_at: project.created_at.clone(),
            updated_at: project.updated_at.clone(),
        },
        author: AuthorInfo::default(),
        content: ContentInfo {
            counts: export.counts.clone(),
            assets: AssetsInfo {
                count: export.assets.len() as u64,
                total_bytes: export.assets_bytes,
            },
            data: DataInfo {
                file: DATA.to_owned(),
                size_bytes: data_size,
                tables: export.tables,
                rows: export.rows,
            },
        },
        encryption: EncryptionInfo { enabled: false },
    };

    // 6. Archive sous un nom temporaire. XML compressé, images stockées
    //    telles quelles (déjà compressées).
    let part = part_path(target);
    {
        let file = File::create(&part).map_err(|e| io_error("Création du fichier", e))?;
        let mut zip = zip::ZipWriter::new(BufWriter::new(file));
        let deflated = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .large_file(data_size > u32::MAX as u64);
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        let zip_err = |e: zip::result::ZipError| io_error("Écriture de l'archive", e);
        let write_err = |e: std::io::Error| io_error("Écriture de l'archive", e);

        zip.start_file(MANIFEST, deflated).map_err(zip_err)?;
        zip.write_all(&manifest_xml(&manifest)?).map_err(write_err)?;

        zip.start_file(CHECKSUMS, deflated).map_err(zip_err)?;
        zip.write_all(&checksums_xml(&checksums)?).map_err(write_err)?;

        zip.start_file(DATA, deflated).map_err(zip_err)?;
        let mut data = BufReader::new(File::open(&data_path).map_err(write_err)?);
        std::io::copy(&mut data, &mut zip).map_err(write_err)?;

        for (name, path) in &export.assets {
            zip.start_file(name.as_str(), stored).map_err(zip_err)?;
            let mut image = BufReader::new(File::open(path).map_err(write_err)?);
            std::io::copy(&mut image, &mut zip).map_err(write_err)?;
        }

        let writer = zip.finish().map_err(zip_err)?;
        writer
            .into_inner()
            .map_err(|e| io_error("Écriture", e))?
            .sync_all()
            .map_err(write_err)?;
    }

    // 7. Relecture : mêmes contrôles qu'à l'import (niveaux 1 et 2).
    verify_archive(&part)?;

    // 8. Renommage seulement si tout est bon.
    std::fs::rename(&part, target).map_err(|e| io_error("Renommage du fichier", e))?;

    Ok(())
}

// ----------------------------------------------------------------------------
// Lecture et contrôle d'une archive (niveaux 1 et 2)
// ----------------------------------------------------------------------------

/// Nom d'entrée autorisé : les trois fichiers XML et les images
/// `assets/<2 car.>/<empreinte>.<png|jpg|webp|gif>`.
fn allowed_name(name: &str) -> bool {
    matches!(name, MANIFEST | CHECKSUMS | DATA) || parse_asset_name(name).is_some()
}

struct ArchiveIndex {
    manifest: Manifest,
    checksums: Checksums,
}

fn read_small_entry(archive: &mut zip::ZipArchive<BufReader<File>>, name: &str) -> AppResult<Option<Vec<u8>>> {
    let entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(damaged(format!("ZIP_INVALID : {e}"))),
    };

    if entry.size() > MAX_MANIFEST_BYTES {
        return Err(damaged(format!("{name} trop grand")));
    }

    let mut bytes = Vec::new();
    entry
        .take(MAX_MANIFEST_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| damaged(format!("{name} illisible : {e}")))?;

    Ok(Some(bytes))
}

/// Contrôle l'index du ZIP sans extraire (étape 2), lit le manifeste
/// (étapes 3-4) et les empreintes.
fn read_index(archive: &mut zip::ZipArchive<BufReader<File>>) -> AppResult<ArchiveIndex> {
    if archive.len() > MAX_ENTRIES {
        return Err(unsafe_archive(format!("ZIP_TOO_LARGE : {} entrées", archive.len())));
    }

    let mut seen = BTreeSet::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| damaged(format!("ZIP_INVALID : {e}")))?;
        let name = entry.name().to_owned();

        if entry.is_dir() {
            continue;
        }

        let path_ok = name.chars().count() <= MAX_PATH_CHARS
            && !name.starts_with('/')
            && !name.contains('\\')
            && !name.contains(':')
            && !name.split('/').any(|part| part == ".." || part == ".")
            && entry.enclosed_name().is_some();

        if !path_ok {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH : {name}")));
        }
        if entry.is_symlink() {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH (lien symbolique) : {name}")));
        }
        if !allowed_name(&name) {
            return Err(unsafe_archive(format!("FILE_UNEXPECTED : {name}")));
        }
        if !seen.insert(name.clone()) {
            return Err(unsafe_archive(format!("ZIP_UNSAFE_PATH (doublon) : {name}")));
        }

        let size = entry.size();
        total = total.saturating_add(size);

        if total > MAX_TOTAL_UNCOMPRESSED {
            return Err(unsafe_archive("ZIP_TOO_LARGE : taille décompressée"));
        }
        if size > RATIO_MIN_BYTES && size / entry.compressed_size().max(1) > MAX_RATIO {
            return Err(unsafe_archive(format!("ZIP_BOMB_SUSPECTED : {name}")));
        }
    }

    // Manifeste.
    let manifest = parse_manifest(
        &read_small_entry(archive, MANIFEST)?.ok_or_else(|| not_ganix("MANIFEST_MISSING"))?,
    )?;

    if manifest.format_version > FORMAT_VERSION {
        return Err(too_new(format!("FORMAT_TOO_NEW : {}", manifest.format_version)));
    }
    if !version_le(&manifest.min_app_version, app_version()) {
        return Err(too_new(format!("APP_UPDATE_REQUIRED : {}", manifest.min_app_version)));
    }
    if manifest.schema_version > current_schema_version() {
        return Err(too_new(format!("SCHEMA_TOO_NEW : {}", manifest.schema_version)));
    }
    if !PROJECT_MIGRATOR.iter().any(|m| m.version == manifest.schema_version) {
        return Err(not_ganix(format!("MANIFEST_INVALID : schéma {}", manifest.schema_version)));
    }
    if manifest.content.data.file != DATA {
        return Err(not_ganix("MANIFEST_INVALID : fichier de données"));
    }
    if manifest.encryption.enabled {
        return Err(not_ganix("MANIFEST_INVALID : fichier chiffré non pris en charge"));
    }

    // Empreintes.
    let checksums = parse_checksums(
        &read_small_entry(archive, CHECKSUMS)?.ok_or_else(|| damaged("FILE_MISSING : checksums.xml"))?,
    )?;

    // Tout fichier présent (hors manifeste et empreintes) doit être listé,
    // et tout fichier listé doit être présent.
    for name in &seen {
        if name != MANIFEST && name != CHECKSUMS && !checksums.files.contains_key(name) {
            return Err(damaged(format!("FILE_UNEXPECTED : {name}")));
        }
    }
    for (name, hash) in &checksums.files {
        if !seen.contains(name) {
            return Err(damaged(format!("FILE_MISSING : {name}")));
        }
        // Une image est nommée par son empreinte.
        if let Some((name_hash, _)) = parse_asset_name(name) {
            if name_hash != hash {
                return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
            }
        }
    }
    if !checksums.files.contains_key(DATA) {
        return Err(damaged("FILE_MISSING : project.xml"));
    }

    Ok(ArchiveIndex { manifest, checksums })
}

fn open_archive(path: &Path) -> AppResult<zip::ZipArchive<BufReader<File>>> {
    let size = std::fs::metadata(path).map_err(unreadable)?.len();

    if size > MAX_ARCHIVE_BYTES {
        return Err(unsafe_archive("ZIP_TOO_LARGE : archive"));
    }

    let file = File::open(path).map_err(unreadable)?;
    zip::ZipArchive::new(BufReader::new(file)).map_err(|e| damaged(format!("ZIP_INVALID : {e}")))
}

/// Contrôles des niveaux 1 et 2, sans rien extraire (relecture d'un export).
pub fn verify_archive(path: &Path) -> AppResult<Manifest> {
    let mut archive = open_archive(path)?;
    let index = read_index(&mut archive)?;

    for (name, expected) in &index.checksums.files {
        let mut entry = archive.by_name(name).map_err(|e| damaged(format!("{name} : {e}")))?;
        if &sha256_reader(&mut entry)? != expected {
            return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
        }
    }

    Ok(index.manifest)
}

// ----------------------------------------------------------------------------
// Reconstruction de la base depuis project.xml (étapes 9 à 11)
// ----------------------------------------------------------------------------

/// Migrations jusqu'à `version` incluse : le schéma de la version du fichier.
fn migrator_up_to(version: i64) -> Migrator {
    Migrator {
        migrations: Cow::Owned(
            PROJECT_MIGRATOR
                .iter()
                .filter(|m| m.version <= version)
                .cloned()
                .collect(),
        ),
        ..Migrator::DEFAULT
    }
}

/// Valeur lue dans le XML, prête à être insérée.
#[derive(Debug, Clone, PartialEq)]
enum Value {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

/// Où en est la lecture de `project.xml`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Level {
    Document,
    Project,
    Table,
    Row,
    Column,
    Done,
}

struct DataReader<'a> {
    tables: &'a BTreeMap<String, Vec<String>>,
    /// Images extraites : nom dans l'archive → fichier en attente.
    assets: &'a BTreeMap<String, PathBuf>,
    schema_version: i64,
    level: Level,
    table: Option<String>,
    row: Vec<(String, Value)>,
    column: Option<(String, Option<String>)>,
    text: String,
}

impl DataReader<'_> {
    fn unexpected(&self, what: &str) -> AppError {
        damaged(format!("project.xml : {what} inattendu ({:?})", self.level))
    }

    fn start(&mut self, start: &BytesStart<'_>) -> AppResult<()> {
        let name = element_name(start)?;

        match (self.level, name.as_str()) {
            (Level::Document, "project") => {
                let version = attributes_of(start)?
                    .get("schemaVersion")
                    .and_then(|v| v.parse::<i64>().ok());
                if version != Some(self.schema_version) {
                    return Err(damaged("project.xml : version du schéma différente du manifeste"));
                }
                self.level = Level::Project;
            }
            (Level::Project, "table") => {
                let table = attributes_of(start)?
                    .remove("name")
                    .ok_or_else(|| damaged("project.xml : table sans nom"))?;
                if !self.tables.contains_key(&table) {
                    return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : table {table}")));
                }
                self.table = Some(table);
                self.level = Level::Table;
            }
            (Level::Table, "row") => {
                self.row.clear();
                self.level = Level::Row;
            }
            (Level::Row, column) => {
                let table = self.table.as_deref().unwrap_or_default();
                let known = self.tables.get(table).is_some_and(|cols| cols.iter().any(|c| c == column));
                if !known {
                    return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : colonne {table}.{column}")));
                }
                if self.row.iter().any(|(c, _)| c == column) {
                    return Err(damaged(format!("project.xml : colonne {column} en double")));
                }
                let kind = attributes_of(start)?.remove("type");
                self.column = Some((name, kind));
                self.text.clear();
                self.level = Level::Column;
            }
            _ => return Err(self.unexpected(&format!("élément <{name}>"))),
        }

        Ok(())
    }

    /// Fin d'élément. Retourne la ligne complète à insérer, s'il y en a une.
    fn end(&mut self) -> AppResult<Option<(String, Vec<(String, Value)>)>> {
        match self.level {
            Level::Column => {
                let (column, kind) = self.column.take().ok_or_else(|| self.unexpected("fin"))?;
                let value = self.value(&column, kind.as_deref())?;
                self.row.push((column, value));
                self.level = Level::Row;
                Ok(None)
            }
            Level::Row => {
                self.level = Level::Table;
                let table = self.table.clone().ok_or_else(|| self.unexpected("fin"))?;
                Ok(Some((table, std::mem::take(&mut self.row))))
            }
            Level::Table => {
                self.table = None;
                self.level = Level::Project;
                Ok(None)
            }
            Level::Project => {
                self.level = Level::Done;
                Ok(None)
            }
            Level::Document | Level::Done => Err(self.unexpected("fin")),
        }
    }

    fn push_text(&mut self, text: &str) -> AppResult<()> {
        if self.level == Level::Column {
            self.text.push_str(text);
            Ok(())
        } else if text.chars().all(char::is_whitespace) {
            Ok(())
        } else {
            Err(self.unexpected("texte"))
        }
    }

    fn value(&self, column: &str, kind: Option<&str>) -> AppResult<Value> {
        let text = self.text.as_str();
        let invalid = || damaged(format!("project.xml : valeur invalide pour {column}"));

        Ok(match kind {
            None => Value::Text(text.to_owned()),
            Some("null") if text.is_empty() => Value::Null,
            Some("integer") => Value::Integer(text.trim().parse().map_err(|_| invalid())?),
            Some("real") => Value::Real(text.trim().parse().map_err(|_| invalid())?),
            Some("text-base64") => Value::Text(
                String::from_utf8(b64().decode(text.trim()).map_err(|_| invalid())?).map_err(|_| invalid())?,
            ),
            Some("blob") => Value::Blob(b64().decode(text.trim()).map_err(|_| invalid())?),
            Some("asset") => {
                let path = self
                    .assets
                    .get(text.trim())
                    .ok_or_else(|| damaged(format!("FILE_MISSING : image {}", text.trim())))?;
                Value::Blob(std::fs::read(path).map_err(|e| io_error("Image en attente", e))?)
            }
            Some(_) => return Err(invalid()),
        })
    }
}

async fn insert_row(conn: &mut SqliteConnection, table: &str, row: Vec<(String, Value)>) -> AppResult<()> {
    if row.is_empty() {
        sqlx::query(&format!("INSERT INTO {} DEFAULT VALUES", quote_ident(table)))
            .execute(&mut *conn)
            .await
            .map_err(|e| damaged(format!("DB_INCONSISTENT : {table} : {e}")))?;
        return Ok(());
    }

    let columns = row.iter().map(|(c, _)| quote_ident(c)).collect::<Vec<_>>().join(", ");
    let marks = vec!["?"; row.len()].join(", ");
    let sql = format!("INSERT INTO {} ({columns}) VALUES ({marks})", quote_ident(table));

    let mut query = sqlx::query(&sql);
    for (_, value) in row {
        query = match value {
            Value::Null => query.bind(None::<String>),
            Value::Integer(v) => query.bind(v),
            Value::Real(v) => query.bind(v),
            Value::Text(v) => query.bind(v),
            Value::Blob(v) => query.bind(v),
        };
    }

    query
        .execute(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_INCONSISTENT : {table} : {e}")))?;

    Ok(())
}

/// Lit `project.xml` et insère ses lignes (base vidée au préalable).
async fn load_data(
    conn: &mut SqliteConnection,
    data_path: &Path,
    tables: &BTreeMap<String, Vec<String>>,
    assets: &BTreeMap<String, PathBuf>,
    schema_version: i64,
) -> AppResult<()> {
    let file = File::open(data_path).map_err(|e| io_error("project.xml en attente", e))?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    reader_config(&mut reader);

    let mut state = DataReader {
        tables,
        assets,
        schema_version,
        level: Level::Document,
        table: None,
        row: Vec::new(),
        column: None,
        text: String::new(),
    };
    let mut buf = Vec::new();

    loop {
        let pending = {
            let event = reader
                .read_event_into(&mut buf)
                .map_err(|e| damaged(format!("project.xml : XML invalide : {e}")))?;

            match event {
                Event::Decl(_) | Event::Comment(_) => None,
                Event::DocType(_) | Event::PI(_) => {
                    return Err(unsafe_archive("project.xml : DTD ou instruction refusée"));
                }
                Event::Start(start) => {
                    state.start(&start)?;
                    None
                }
                Event::End(_) => state.end()?,
                Event::Text(text) => {
                    state.push_text(&text.xml10_content())?;
                    None
                }
                Event::CData(data) => {
                    state.push_text(&data.xml10_content())?;
                    None
                }
                Event::GeneralRef(reference) => {
                    let text = resolve_reference(&reference)?;
                    state.push_text(&text)?;
                    None
                }
                Event::Empty(_) => unreachable!("expand_empty_elements"),
                Event::Eof => break,
            }
        };
        buf.clear();

        if let Some((table, row)) = pending {
            insert_row(conn, &table, row).await?;
        }
    }

    if state.level != Level::Done {
        return Err(damaged("project.xml : document incomplet"));
    }

    Ok(())
}

/// Reconstruit dans la zone d'attente la base décrite par `project.xml` :
/// schéma créé par les migrations de GANIS jusqu'à la version du fichier,
/// tables vidées, lignes insérées, puis intégrité et clés étrangères
/// contrôlées. Retourne les statistiques de l'aperçu.
async fn build_database(dir: &Path, manifest: &Manifest, assets: &BTreeMap<String, PathBuf>) -> AppResult<Counts> {
    let pool = open_plain(&dir.join(STAGED_DB)).await?;
    let result = build_database_inner(&pool, dir, manifest, assets).await;
    pool.close().await;
    result
}

async fn build_database_inner(
    pool: &SqlitePool,
    dir: &Path,
    manifest: &Manifest,
    assets: &BTreeMap<String, PathBuf>,
) -> AppResult<Counts> {
    run_migrations(pool, &migrator_up_to(manifest.schema_version)).await?;

    let mut tx = pool.begin().await?;
    let tables = user_tables(&mut tx).await?;

    // Les migrations peuvent créer des lignes par défaut : seules comptent
    // celles du fichier.
    for table in tables.keys() {
        sqlx::query(&format!("DELETE FROM {}", quote_ident(table)))
            .execute(&mut *tx)
            .await?;
    }

    load_data(&mut tx, &dir.join(DATA), &tables, assets, manifest.schema_version).await?;
    tx.commit().await?;

    let mut conn = pool.acquire().await?;

    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_CORRUPT : {e}")))?;
    if integrity != "ok" {
        return Err(damaged(format!("DB_CORRUPT : {integrity}")));
    }

    let broken: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| damaged(format!("DB_INCONSISTENT : {e}")))?;
    if !broken.is_empty() {
        return Err(damaged(format!("DB_INCONSISTENT : {} liens cassés", broken.len())));
    }

    Ok(counts(&mut conn).await)
}

// ----------------------------------------------------------------------------
// Contrôle final du schéma (après les migrations restantes)
// ----------------------------------------------------------------------------

/// Objets (type, nom) du schéma de référence : base neuve, toutes migrations.
async fn reference_schema() -> AppResult<BTreeSet<(String, String)>> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await?;
    run_migrations(&pool, &PROJECT_MIGRATOR).await?;
    let objects = schema_objects(&pool).await?;
    pool.close().await;
    Ok(objects)
}

async fn schema_objects(pool: &SqlitePool) -> AppResult<BTreeSet<(String, String)>> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().collect())
}

/// Vérifie que le schéma final est exactement celui de cette version.
async fn check_schema(pool: &SqlitePool) -> AppResult<()> {
    let reference = reference_schema().await?;

    for (kind, name) in schema_objects(pool).await? {
        if kind == "trigger" || kind == "view" || !reference.contains(&(kind.clone(), name.clone())) {
            return Err(unsafe_archive(format!("DB_SCHEMA_UNEXPECTED : {kind} {name}")));
        }
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Import : zone d'attente, aperçu, installation
// ----------------------------------------------------------------------------

/// Aperçu montré avant d'importer (étape 5).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub staging_id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub status: String,
    pub exported_at: String,
    pub created_with: String,
    pub counts: Counts,
    pub size_bytes: u64,
    /// L'utilisateur a déjà ce projet : il sera importé comme copie.
    pub already_owned: bool,
}

fn staging_root(data_dir: &Path) -> PathBuf {
    data_dir.join(STAGING_DIR)
}

/// Dossier de travail d'un export.
pub fn work_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(WORK_DIR).join(new_id())
}

fn staging_dir(data_dir: &Path, staging_id: &str) -> AppResult<PathBuf> {
    let id = uuid::Uuid::parse_str(staging_id)
        .map_err(|_| ganix_error("ganix.stagingMissing", "Cet import n'est plus disponible.", "identifiant invalide"))?;
    Ok(staging_root(data_dir).join(id.hyphenated().to_string()))
}

/// Supprime les zones d'attente et dossiers de travail laissés par un arrêt
/// brutal (§24.5). Appelé au démarrage.
pub fn clean_leftovers(data_dir: &Path) {
    clean_interrupted_replacements(&data_dir.join(project_storage::PROJECTS_DIR));

    for dir in [staging_root(data_dir), data_dir.join(WORK_DIR)] {
        match std::fs::remove_dir_all(&dir) {
            Ok(()) => tracing::info!("Zone d'attente orpheline supprimée"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => tracing::warn!(error = %e, "Zone d'attente non supprimée"),
        }
    }
}

/// Étapes 1 à 9 : contrôle le fichier et l'extrait dans une zone d'attente
/// propre à l'utilisateur. Rien n'est encore ajouté à son compte.
pub async fn stage_import(
    data_dir: &Path,
    app_db: &SqlitePool,
    owner_id: &str,
    source: &Path,
) -> AppResult<ImportPreview> {
    let staging_id = new_id();
    let dir = staging_dir(data_dir, &staging_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| io_error("Zone d'attente", e))?;

    let result = stage_import_inner(&dir, app_db, owner_id, source, &staging_id).await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&dir);
    }

    result
}

/// Étapes 2 à 11, sans rien rattacher au compte : contrôle de l'archive,
/// extraction, images, reconstruction de la base dans `dir`.
async fn stage_files(dir: &Path, source: &Path) -> AppResult<(Manifest, Counts)> {
    let mut archive = open_archive(source)?;
    let index = read_index(&mut archive)?;

    // 6-7. Extraction avec plafond de taille, puis empreinte.
    let data_path = dir.join(DATA);
    extract_entry(&mut archive, DATA, &data_path, &index.checksums.files[DATA])?;

    // 8. Images : empreinte (= nom) et type réel d'après les premiers octets.
    let assets_dir = dir.join(STAGED_ASSETS);
    std::fs::create_dir_all(&assets_dir).map_err(|e| io_error("Zone d'attente", e))?;
    let mut assets = BTreeMap::new();

    for (name, hash) in &index.checksums.files {
        let Some((_, extension)) = parse_asset_name(name) else {
            continue;
        };

        let path = assets_dir.join(format!("{hash}.{extension}"));
        extract_entry(&mut archive, name, &path, hash)?;

        let mut head = [0u8; 16];
        let read = File::open(&path)
            .and_then(|mut f| f.read(&mut head))
            .map_err(|e| io_error("Image en attente", e))?;
        if image_extension(&head[..read]) != Some(extension) {
            return Err(unsafe_archive(format!("ASSET_TYPE_INVALID : {name}")));
        }

        assets.insert(name.clone(), path);
    }

    // 9-11. Base reconstruite par GANIS à partir des données XML.
    let counts = build_database(dir, &index.manifest, &assets).await?;

    // Les fichiers extraits ne servent plus : seule la base reconstruite reste.
    let _ = std::fs::remove_file(&data_path);
    let _ = std::fs::remove_dir_all(&assets_dir);

    Ok((index.manifest, counts))
}

async fn stage_import_inner(
    dir: &Path,
    app_db: &SqlitePool,
    owner_id: &str,
    source: &Path,
    staging_id: &str,
) -> AppResult<ImportPreview> {
    let size_bytes = std::fs::metadata(source).map_err(unreadable)?.len();
    let (manifest, counts) = stage_files(dir, source).await?;

    // Zone d'attente rattachée à l'utilisateur (personne d'autre ne peut la confirmer).
    std::fs::write(dir.join("owner"), owner_id).map_err(|e| io_error("Zone d'attente", e))?;
    std::fs::write(dir.join(STAGED_MANIFEST), serde_json::to_vec(&manifest)?)
        .map_err(|e| io_error("Zone d'attente", e))?;

    let already_owned = project_service::find_stored(app_db, &manifest.project.id, owner_id)
        .await?
        .is_some();

    let project = &manifest.project;

    Ok(ImportPreview {
        staging_id: staging_id.to_owned(),
        name: project.name.clone(),
        description: project.description.clone(),
        kind: ProjectType::from_str(&project.kind).as_str().to_owned(),
        status: ProjectStatus::from_str(&project.status).as_str().to_owned(),
        exported_at: manifest.export.exported_at.clone(),
        created_with: manifest.created_with.clone(),
        counts,
        size_bytes,
        already_owned,
    })
}

/// Extrait une entrée de l'archive (taille plafonnée à celle annoncée) et
/// vérifie son empreinte.
fn extract_entry(
    archive: &mut zip::ZipArchive<BufReader<File>>,
    name: &str,
    target: &Path,
    expected: &str,
) -> AppResult<()> {
    let entry = archive.by_name(name).map_err(|e| damaged(format!("EXTRACT_FAILED : {name} : {e}")))?;
    let declared = entry.size();
    let mut out = BufWriter::new(File::create(target).map_err(|e| io_error("EXTRACT_FAILED", e))?);
    let copied = std::io::copy(&mut entry.take(declared.saturating_add(1)), &mut out)
        .map_err(|e| io_error("EXTRACT_FAILED", e))?;
    out.flush().map_err(|e| io_error("EXTRACT_FAILED", e))?;
    drop(out);

    if copied != declared {
        return Err(damaged(format!("EXTRACT_FAILED : taille inattendue : {name}")));
    }
    if sha256_file(target)? != expected {
        return Err(damaged(format!("CHECKSUM_MISMATCH : {name}")));
    }

    Ok(())
}

/// Abandonne un import (aucune trace).
pub fn cancel_import(data_dir: &Path, staging_id: &str) -> AppResult<()> {
    let dir = staging_dir(data_dir, staging_id)?;
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_error("Suppression de la zone d'attente", e)),
    }
}

/// Choix de l'utilisateur quand il possède déjà le projet du fichier
/// (§24.3). Sans conflit, l'import est direct quel que soit le choix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    /// Nouveau projet, nom suffixé « (importé) » (par défaut).
    #[default]
    Copy,
    /// Le projet existant est remplacé, après une sauvegarde automatique en
    /// `.ganix`.
    Replace,
}

/// Résultat d'un import.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub project: Project,
    /// Remplacement : nom du fichier de sauvegarde de l'ancien projet
    /// (dans le dossier des sauvegardes de GANIS).
    pub backup_file: Option<String>,
}

/// Dossier des sauvegardes automatiques (remplacement à l'import).
const BACKUP_DIR: &str = "sauvegardes";
/// Suffixes des dossiers de projet pendant un remplacement.
const INCOMING_SUFFIX: &str = ".import";
const REPLACED_SUFFIX: &str = ".replaced";

pub fn backup_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKUP_DIR)
}

fn sibling(dir: &Path, suffix: &str) -> PathBuf {
    let mut name = dir.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    dir.with_file_name(name)
}

/// Remet en ordre les dossiers de projet laissés par un remplacement
/// interrompu : l'ancien dossier est restauré si le nouveau n'a pas été mis
/// en place, et les copies inachevées sont supprimées.
fn clean_interrupted_replacements(projects_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(projects_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.ends_with(INCOMING_SUFFIX) {
            let _ = std::fs::remove_dir_all(&path);
        } else if let Some(id) = name.strip_suffix(REPLACED_SUFFIX) {
            let current = projects_dir.join(id);
            if current.exists() {
                let _ = std::fs::remove_dir_all(&path);
            } else if std::fs::rename(&path, &current).is_ok() {
                tracing::warn!("Remplacement interrompu : ancien projet restauré");
            }
        }
    }
}

/// Étapes 10 à 14 : installe le projet en attente pour l'utilisateur.
///
/// Conflits (§24.3) :
/// - identifiant libre : import direct, identifiant du fichier gardé ;
/// - projet déjà chez l'utilisateur, `Copy` : nouvel identifiant, nom
///   suffixé « (importé) » ;
/// - projet déjà chez l'utilisateur, `Replace` : sauvegarde `.ganix` de
///   l'ancien, puis ses données sont remplacées (même identifiant) ;
/// - identifiant pris par un autre compte : copie avec un nouvel
///   identifiant (les projets des autres comptes restent invisibles).
///
/// La base reçue est rechiffrée avec la clé du projet, mise à jour par les
/// migrations et contrôlée une dernière fois. En cas d'échec, tout est
/// annulé.
pub async fn confirm_import(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    staging_id: &str,
    mode: ImportMode,
) -> AppResult<ImportOutcome> {
    let dir = staging_dir(&state.data_dir, staging_id)?;
    let missing = || ganix_error("ganix.stagingMissing", "Cet import n'est plus disponible.", "zone d'attente absente");

    let owner = std::fs::read_to_string(dir.join("owner")).map_err(|_| missing())?;
    if owner != owner_id {
        return Err(missing());
    }

    let manifest: Manifest = serde_json::from_slice(&std::fs::read(dir.join(STAGED_MANIFEST)).map_err(|_| missing())?)
        .map_err(|_| missing())?;

    // 12. Conflits d'identifiant.
    let info = &manifest.project;
    let id_valid = uuid::Uuid::parse_str(&info.id).is_ok();
    let taken = !id_valid || project_service::id_exists(&state.app_db, &info.id).await?;
    let owned = id_valid && project_service::find_stored(&state.app_db, &info.id, owner_id).await?.is_some();

    let outcome = if owned && mode == ImportMode::Replace {
        replace_project(state, owner_id, account_key, &dir, &manifest).await?
    } else {
        ImportOutcome {
            project: import_as_new(state, owner_id, account_key, &dir, &manifest, taken, owned).await?,
            backup_file: None,
        }
    };

    // 14. Nettoyage et journal (sans chemin ni contenu).
    let _ = std::fs::remove_dir_all(&dir);
    tracing::info!(
        schema = manifest.schema_version,
        replaced = outcome.backup_file.is_some(),
        "Projet importé depuis un .ganix"
    );

    Ok(outcome)
}

/// Nouveau projet pour l'utilisateur, avec une nouvelle clé.
async fn import_as_new(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    dir: &Path,
    manifest: &Manifest,
    taken: bool,
    owned: bool,
) -> AppResult<Project> {
    let info = &manifest.project;

    let name = if owned {
        let max = project_service::MAX_PROJECT_NAME_CHARS - project_service::IMPORT_SUFFIX.chars().count();
        format!("{}{}", info.name.trim().chars().take(max).collect::<String>(), project_service::IMPORT_SUFFIX)
    } else {
        info.name.chars().take(project_service::MAX_PROJECT_NAME_CHARS).collect()
    };

    let (project, project_key) = project_service::create_imported_project(
        &state.app_db,
        owner_id,
        account_key,
        (!taken).then_some(info.id.as_str()),
        &name,
        &info.description,
        ProjectType::from_str(&info.kind),
        ProjectStatus::from_str(&info.status),
    )
    .await?;

    // 10, 11, 13. Rechiffrement, migrations, contrôle final, mise en place.
    let target_dir = project_storage::project_dir(state, &project.id)?;

    let installed = async {
        let pool = prepare_database(&dir.join(STAGED_DB), &target_dir, &project_key).await?;
        project_storage::mark_db_ready(state, &project.id).await?;
        state.project_pools.lock().await.insert(project.id.clone(), pool);
        AppResult::Ok(())
    }
    .await;

    if let Err(error) = installed {
        let _ = project_service::delete_project(&state.app_db, &project.id, owner_id).await;
        project_storage::delete_storage(state, &project.id).await;
        return Err(error);
    }

    Ok(project)
}

/// Remplace les données d'un projet de l'utilisateur par celles du fichier.
///
/// 1. sauvegarde `.ganix` de l'ancien projet (obligatoire) ;
/// 2. base reçue rechiffrée avec la clé du projet existant dans un dossier
///    voisin, migrée et contrôlée ;
/// 3. échange des dossiers, puis mise à jour du nom, de la description, du
///    type et du statut. En cas d'échec, l'ancien dossier est remis.
async fn replace_project(
    state: &AppState,
    owner_id: &str,
    account_key: &SecretKey,
    staged: &Path,
    manifest: &Manifest,
) -> AppResult<ImportOutcome> {
    let info = &manifest.project;

    let existing = project_service::find_by_id_for_user(&state.app_db, &info.id, owner_id, account_key)
        .await?
        .ok_or_else(|| AppError::not_found("Projet non trouvé.").with_key("project.notFound"))?;

    // 1. Sauvegarde de l'ancien projet.
    let backups = backup_dir(&state.data_dir);
    std::fs::create_dir_all(&backups).map_err(|e| io_error("Dossier des sauvegardes", e))?;

    let stem = suggested_file_name(&existing.name);
    let stem = stem.trim_end_matches(".ganix");
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let backup_name = format!("{stem} - avant import {stamp}.ganix");

    let pool = project_storage::pool_for_user(state, &existing.id, owner_id).await?;
    write_ganix(&pool, &existing, &backups.join(&backup_name), &work_dir(&state.data_dir)).await?;

    // 2. Nouvelle base, à côté de l'ancienne.
    let wrapped = existing
        .wrapped_key
        .as_deref()
        .ok_or_else(|| AppError::internal("Projet sans clé"))?;
    let project_key = project_service::unwrap_project_key(account_key, &existing.id, wrapped)?;

    let current = project_storage::project_dir(state, &existing.id)?;
    let incoming = sibling(&current, INCOMING_SUFFIX);
    let replaced = sibling(&current, REPLACED_SUFFIX);
    let _ = std::fs::remove_dir_all(&incoming);
    let _ = std::fs::remove_dir_all(&replaced);

    match prepare_database(&staged.join(STAGED_DB), &incoming, &project_key).await {
        Ok(new_pool) => new_pool.close().await,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&incoming);
            return Err(error);
        }
    }

    // 3. Échange, verrou tenu : aucune ouverture du projet entre-temps.
    let mut pools = state.project_pools.lock().await;
    if let Some(old_pool) = pools.remove(&existing.id) {
        old_pool.close().await;
    }

    let install_failed = |e: std::io::Error| io_error("INSTALL_FAILED", e);

    if let Err(e) = std::fs::rename(&current, &replaced) {
        let _ = std::fs::remove_dir_all(&incoming);
        return Err(install_failed(e));
    }

    if let Err(e) = std::fs::rename(&incoming, &current) {
        let _ = std::fs::rename(&replaced, &current);
        let _ = std::fs::remove_dir_all(&incoming);
        return Err(install_failed(e));
    }

    let updated = project_service::update_project(
        &state.app_db,
        &existing.id,
        owner_id,
        account_key,
        Some(&info.name.chars().take(project_service::MAX_PROJECT_NAME_CHARS).collect::<String>()),
        Some(&info.description),
        Some(ProjectType::from_str(&info.kind)),
        Some(ProjectStatus::from_str(&info.status)),
        None,
        None,
    )
    .await;

    let project = match updated {
        Ok(project) => project,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&current);
            let _ = std::fs::rename(&replaced, &current);
            return Err(error);
        }
    };

    drop(pools);

    if let Err(e) = std::fs::remove_dir_all(&replaced) {
        tracing::warn!(error = %e, "Ancien dossier du projet non supprimé");
    }

    Ok(ImportOutcome {
        project,
        backup_file: Some(backup_name),
    })
}

/// Copie chiffrée de la base reçue dans `target_dir`, mise à jour par les
/// migrations puis contrôle strict du schéma final. Retourne la base ouverte.
async fn prepare_database(
    staged_db: &Path,
    target_dir: &Path,
    project_key: &SecretKey,
) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(target_dir).map_err(|e| io_error("INSTALL_FAILED", e))?;

    // Ouverte en écriture : ATTACH hérite des droits de la connexion et doit
    // créer la copie. La base en attente est à nous et sera supprimée.
    let plain = open_plain(staged_db).await?;
    let exported = export_encrypted(&plain, &target_dir.join(DB_FILE), project_key).await;
    plain.close().await;
    exported?;

    let pool = init_project_db(target_dir, project_key).await.map_err(|e| {
        ganix_error(
            "ganix.migrationFailed",
            "Ce projet n'a pas pu être mis à jour pour cette version de GANIS.",
            format!("MIGRATION_FAILED : {e}"),
        )
    })?;

    if let Err(error) = check_schema(&pool).await {
        pool.close().await;
        return Err(error);
    }

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::project_db::init_project_db;

    /// Plus petite image PNG valide (1×1).
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
    ];

    /// Texte piégé : caractères spéciaux XML, retours à la ligne Windows,
    /// caractère de contrôle, espaces de début et de fin.
    const TRICKY: &str = "  <b>Aldric</b> & « Mira » \"q\" 'a'\r\nligne 2\u{1}\tfin  ";

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ganis-ganix-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn project(name: &str) -> Project {
        Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_owned(),
            description: "Une saga & des « guillemets »".to_owned(),
            project_type: ProjectType::Novel,
            status: ProjectStatus::InProgress,
            is_favorite: false,
            is_archived: false,
            created_at: now_utc(),
            updated_at: now_utc(),
            last_opened_at: None,
            name_sealed: None,
            description_sealed: None,
            wrapped_key: None,
        }
    }

    /// Base de projet chiffrée : deux personnages (dont un au texte piégé),
    /// un portrait PNG, deux images de galerie identiques, un synopsis.
    async fn encrypted_project(dir: &Path) -> SqlitePool {
        let pool = init_project_db(dir, &SecretKey::generate()).await.unwrap();

        for (id, first, last) in [("c1", "Aldric", "VENN"), ("c2", TRICKY, "")] {
            sqlx::query(
                "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
                 VALUES (?, ?, ?, 'main', 'alive', '{\"origin\":\"Valona\"}', 'x', 'x')",
            )
            .bind(id)
            .bind(first)
            .bind(last)
            .execute(&pool)
            .await
            .unwrap();
        }

        sqlx::query("INSERT INTO character_portraits (character_id, mime, data, updated_at) VALUES ('c1', 'image/png', ?, 'x')")
            .bind(PNG)
            .execute(&pool)
            .await
            .unwrap();

        for (id, position) in [("i1", 0), ("i2", 1)] {
            sqlx::query(
                "INSERT INTO character_images (id, character_id, mime, data, position, created_at) \
                 VALUES (?, 'c1', 'image/png', ?, ?, 'x')",
            )
            .bind(id)
            .bind(PNG)
            .bind(position)
            .execute(&pool)
            .await
            .unwrap();
        }

        sqlx::query("UPDATE synopsis SET content = ? WHERE id = 'default'")
            .bind("Il était une fois…\n\nFin.")
            .execute(&pool)
            .await
            .unwrap();

        pool
    }

    /// Toutes les lignes de toutes les tables, sous une forme comparable.
    async fn dump(pool: &SqlitePool) -> BTreeMap<String, Vec<String>> {
        let mut conn = pool.acquire().await.unwrap();
        let tables = user_tables(&mut conn).await.unwrap();
        let mut out = BTreeMap::new();

        for (table, columns) in tables {
            let select = columns.iter().map(|c| format!("quote({})", quote_ident(c))).collect::<Vec<_>>().join(" || '|' || ");
            let mut rows: Vec<String> = sqlx::query_scalar(&format!("SELECT {select} FROM {}", quote_ident(&table)))
                .fetch_all(&mut *conn)
                .await
                .unwrap();
            rows.sort();
            out.insert(table, rows);
        }

        out
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        for (name, data) in entries {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }

    fn entries(path: &Path) -> Vec<(String, Vec<u8>)> {
        let mut archive = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
        (0..archive.len())
            .map(|i| {
                let mut entry = archive.by_index(i).unwrap();
                let mut data = Vec::new();
                entry.read_to_end(&mut data).unwrap();
                (entry.name().to_owned(), data)
            })
            .collect()
    }

    fn entry(path: &Path, name: &str) -> Vec<u8> {
        entries(path).into_iter().find(|(n, _)| n == name).unwrap().1
    }

    /// Archive refaite avec un `project.xml` modifié (empreintes à jour).
    fn with_data(good: &Path, target: &Path, data: &[u8]) {
        let mut files = entries(good);
        let checksums = String::from_utf8(entry(good, CHECKSUMS)).unwrap().replace(
            &sha256_hex(&entry(good, DATA)),
            &sha256_hex(data),
        );
        for (name, content) in files.iter_mut() {
            if name == DATA {
                *content = data.to_vec();
            } else if name == CHECKSUMS {
                *content = checksums.as_bytes().to_vec();
            }
        }
        let refs: Vec<(&str, &[u8])> = files.iter().map(|(n, d)| (n.as_str(), d.as_slice())).collect();
        write_zip(target, &refs);
    }

    async fn stage(path: &Path) -> AppResult<(Manifest, Counts)> {
        let dir = temp_dir("stage");
        let result = stage_files(&dir, path).await;
        std::fs::remove_dir_all(dir).unwrap();
        result
    }

    fn key<T>(result: AppResult<T>) -> String {
        match result {
            Err(e) => format!("{e:?}"),
            Ok(_) => "ok".to_owned(),
        }
    }

    #[test]
    fn helpers() {
        assert!(version_le("0.1.0", "0.1.0"));
        assert!(version_le("0.1", "0.2.0"));
        assert!(!version_le("1.0.0", "0.9.9"));
        assert_eq!(suggested_file_name("Les Royaumes : tome 1"), "Les Royaumes _ tome 1.ganix");
        assert_eq!(suggested_file_name("  ...  "), "projet.ganix");

        let hash = sha256_hex(PNG);
        let name = asset_entry_name(&hash, "png");
        assert!(allowed_name(&name));
        assert!(allowed_name("project.xml"));
        assert!(!allowed_name("project.sqlite"));
        assert!(!allowed_name("assets/00/abc.png"));
        assert!(!allowed_name(&name.replace(".png", ".exe")));
        assert!(!allowed_name("autre.txt"));

        assert!(xml_safe("Bonjour\n\tà tous & <vous>"));
        assert!(!xml_safe("a\r\nb"));
        assert!(!xml_safe("a\u{1}b"));
    }

    #[tokio::test]
    async fn export_is_xml_only_and_rebuilds_the_same_data() {
        let dir = temp_dir("roundtrip");
        let source = encrypted_project(&dir.join("source")).await;
        let target = dir.join("Mon projet.ganix");

        write_ganix(&source, &project("Mon projet"), &target, &dir.join("work")).await.unwrap();
        assert!(target.exists());
        assert!(!part_path(&target).exists());
        assert!(!dir.join("work").exists());

        // Que du XML et des images ; aucune base de données.
        let names: Vec<String> = entries(&target).into_iter().map(|(n, _)| n).collect();
        let image = asset_entry_name(&sha256_hex(PNG), "png");
        assert_eq!(names, vec![MANIFEST.to_owned(), CHECKSUMS.to_owned(), DATA.to_owned(), image.clone()]);
        for (_, data) in entries(&target) {
            assert!(!data.starts_with(b"SQLite format 3"));
        }

        // XML lisible.
        let xml = String::from_utf8(entry(&target, DATA)).unwrap();
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<table name=\"characters\">"));
        assert!(xml.contains("<first_name>Aldric</first_name>"));
        assert!(xml.contains(&format!("<data type=\"asset\">{image}</data>")));
        assert!(xml.contains("<first_name type=\"text-base64\">"));
        assert!(!xml.contains("_sqlx_migrations"));

        let manifest_text = String::from_utf8(entry(&target, MANIFEST)).unwrap();
        assert!(manifest_text.contains("<name>Mon projet</name>"));
        assert!(!manifest_text.contains("owner") && !manifest_text.contains("wrapped"));

        let manifest = verify_archive(&target).unwrap();
        assert_eq!(manifest.project.name, "Mon projet");
        assert_eq!(manifest.project.description, "Une saga & des « guillemets »");
        assert_eq!(manifest.schema_version, current_schema_version());
        assert_eq!(manifest.content.counts.characters, 2);
        assert_eq!(manifest.content.assets.count, 1);
        assert!(!manifest.encryption.enabled);

        // Import : la base reconstruite contient exactement les mêmes lignes.
        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        let (_, counts) = stage_files(&staging, &target).await.unwrap();
        assert_eq!(counts.characters, 2);

        let rebuilt = open_plain(&staging.join(STAGED_DB)).await.unwrap();
        assert_eq!(dump(&rebuilt).await, dump(&source).await);
        let tricky: String = sqlx::query_scalar("SELECT first_name FROM characters WHERE id = 'c2'")
            .fetch_one(&rebuilt)
            .await
            .unwrap();
        assert_eq!(tricky, TRICKY);
        rebuilt.close().await;

        // Les fichiers extraits ont disparu ; seule la base reconstruite reste.
        assert!(!staging.join(DATA).exists());
        assert!(!staging.join(STAGED_ASSETS).exists());

        source.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn tampered_or_unsafe_archives_are_refused() {
        let dir = temp_dir("unsafe");
        let source = encrypted_project(&dir.join("source")).await;
        let good = dir.join("bon.ganix");
        write_ganix(&source, &project("P"), &good, &dir.join("work")).await.unwrap();
        source.close().await;

        let manifest = entry(&good, MANIFEST);
        let checksums = entry(&good, CHECKSUMS);
        let data = entry(&good, DATA);
        let image_name = asset_entry_name(&sha256_hex(PNG), "png");

        // Données modifiées sans mettre à jour l'empreinte.
        let mut altered = data.clone();
        let last = altered.len() - 2;
        altered[last] ^= 0x01;
        let path = dir.join("altere.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &altered), (&image_name, PNG)]);
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Chemin dangereux, fichier non autorisé, ancienne base SQLite.
        for (name, extra) in [("assets/../../x", &b"x"[..]), ("virus.exe", b"x"), ("project.sqlite", b"SQLite format 3\0")] {
            let path = dir.join("intrus.ganix");
            write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &data), (&image_name, PNG), (name, extra)]);
            assert!(key(verify_archive(&path)).contains("ganix.unsafe"), "{name}");
        }

        // Fichier manquant.
        let path = dir.join("manque.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, &checksums), (DATA, &data)]);
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Pas de manifeste / pas un ZIP.
        let path = dir.join("sans.ganix");
        write_zip(&path, &[(DATA, &data)]);
        assert!(key(verify_archive(&path)).contains("ganix.notGanix"));
        let path = dir.join("texte.ganix");
        std::fs::write(&path, b"pas une archive").unwrap();
        assert!(key(verify_archive(&path)).contains("ganix.damaged"));

        // Version trop récente.
        let newer = String::from_utf8(manifest.clone()).unwrap().replace("formatVersion=\"1\"", "formatVersion=\"99\"");
        let path = dir.join("recent.ganix");
        write_zip(&path, &[(MANIFEST, newer.as_bytes()), (CHECKSUMS, &checksums), (DATA, &data), (&image_name, PNG)]);
        assert!(key(verify_archive(&path)).contains("ganix.tooNew"));

        // Image dont le contenu n'est pas une image (empreinte cohérente).
        let fake = b"MZ pas une image";
        let fake_name = asset_entry_name(&sha256_hex(fake), "png");
        let fake_data = String::from_utf8(data.clone()).unwrap().replace(&image_name, &fake_name);
        let fake_checksums = String::from_utf8(checksums.clone())
            .unwrap()
            .replace(&image_name, &fake_name)
            .replace(&sha256_hex(PNG), &sha256_hex(fake))
            .replace(&sha256_hex(&data), &sha256_hex(fake_data.as_bytes()));
        let path = dir.join("image.ganix");
        write_zip(&path, &[(MANIFEST, &manifest), (CHECKSUMS, fake_checksums.as_bytes()), (DATA, fake_data.as_bytes()), (&fake_name, fake)]);
        let result = key(stage(&path).await);
        assert!(result.contains("ganix.unsafe"), "{result}");

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn file_from_an_older_schema_is_migrated() {
        let dir = temp_dir("old");
        let older = current_schema_version() - 1;

        // Projet resté à la version précédente du schéma.
        let source = open_plain(&dir.join("ancien.db")).await.unwrap();
        run_migrations(&source, &migrator_up_to(older)).await.unwrap();
        sqlx::query(
            "INSERT INTO characters (id, first_name, last_name, role, status, fields, created_at, updated_at) \
             VALUES ('c1', 'Aldric', 'VENN', 'main', 'alive', '{}', 'x', 'x')",
        )
        .execute(&source)
        .await
        .unwrap();

        let file = dir.join("ancien.ganix");
        write_ganix(&source, &project("Ancien"), &file, &dir.join("work")).await.unwrap();
        source.close().await;
        assert_eq!(verify_archive(&file).unwrap().schema_version, older);

        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        let (_, counts) = stage_files(&staging, &file).await.unwrap();
        assert_eq!(counts.characters, 1);

        // Installation : chiffrement, migrations restantes, schéma final strict.
        let key = SecretKey::generate();
        let pool = prepare_database(&staging.join(STAGED_DB), &dir.join("installe"), &key).await.unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert_eq!(schema_version_of(&mut conn).await.unwrap(), current_schema_version());
        drop(conn);
        pool.close().await;

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn xml_cannot_change_the_schema_or_break_links() {
        let dir = temp_dir("xml");
        let source = encrypted_project(&dir.join("source")).await;
        let good = dir.join("bon.ganix");
        write_ganix(&source, &project("P"), &good, &dir.join("work")).await.unwrap();
        source.close().await;

        let xml = String::from_utf8(entry(&good, DATA)).unwrap();
        let cases = [
            // Table inconnue.
            (xml.replace("<table name=\"characters\">", "<table name=\"piege\">"), "ganix.unsafe"),
            // Colonne inconnue.
            (xml.replace("<first_name>Aldric</first_name>", "<pirate>Aldric</pirate>"), "ganix.unsafe"),
            // Entité déclarée (DTD) : refusée.
            (
                xml.replacen("<project ", "<!DOCTYPE project [<!ENTITY x \"boum\">]><project ", 1),
                "ganix.unsafe",
            ),
            // Portrait d'un personnage inexistant : lien cassé.
            (xml.replace("<character_id>c1</character_id>", "<character_id>fantome</character_id>"), "ganix.damaged"),
            // Valeur numérique invalide.
            (xml.replace("<position type=\"integer\">1</position>", "<position type=\"integer\">un</position>"), "ganix.damaged"),
            // Document tronqué.
            (xml[..xml.len() / 2].to_owned(), "ganix.damaged"),
        ];

        for (i, (data, expected)) in cases.iter().enumerate() {
            assert_ne!(data, &xml, "cas {i} : remplacement sans effet");
            let path = dir.join(format!("cas{i}.ganix"));
            with_data(&good, &path, data.as_bytes());
            let result = key(stage(&path).await);
            assert!(result.contains(expected), "cas {i} : {result}");
        }

        std::fs::remove_dir_all(dir).unwrap();
    }
}
