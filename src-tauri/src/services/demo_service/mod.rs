//! Projets d'exemple : un roman et un manga complets, créés à la demande.
//!
//! # Données et code séparés
//!
//! Le contenu des exemples n'est pas écrit ici : il est dans
//! `src-tauri/demo/<exemple>/` (fiche du projet en JSON, textes en fichiers
//! balisés, scénario du manga), intégré à l'application à la compilation.
//! Le format est décrit dans `src-tauri/demo/README.md`.
//!
//! # Même chemin que l'utilisateur
//!
//! Un exemple est construit par les **services de l'application**, dans
//! l'ordre où un auteur le ferait : projet, synopsis, réglages, découpage,
//! lieux, personnages, relations, textes, documents, notes, trame. Chaque
//! valeur passe donc par les mêmes contrôles que dans l'interface ; une
//! donnée invalide fait échouer la construction (et les tests).
//!
//! # Sûreté
//!
//! - Rien n'est créé au démarrage : seulement quand on le demande (`npm run seed:roman` /
//!   `seed:manga`).
//! - Un exemple n'est créé qu'une fois par espace (public sans connexion,
//!   privé d'un compte) : `projects.demo_id` le reconnaît. Le redemander
//!   rend le projet existant ; rien n'est jamais remplacé ni écrasé.
//! - En cas d'échec, tout ce qui a été créé est retiré.
//! - Une fois créé, c'est un projet ordinaire : il se modifie, se duplique,
//!   s'exporte et se supprime comme les autres. Pour repartir de zéro :
//!   le mettre à la corbeille, puis recréer l'exemple.
//! - La construction ne compte pas dans le calendrier de travail de
//!   l'auteur.

pub mod images;
mod markup;
mod script;

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType};
use crate::services::character_location_service::{self as character_places, CharacterLocationInput};
use crate::services::character_service::{self as characters, CharacterInput};
use crate::services::document_service as documents;
use crate::services::history_service as history;
use crate::services::location_service::{self as locations, CustomTypeInput, LocationInput};
use crate::services::manga_service::{self as manga, ChapterFields, MangaSettings, PageScriptInput, PanelCharacter, PanelInput, TextInput};
use crate::services::note_service::{self as notes, NoteUpdate, StickyUpdate};
use crate::services::novel_service::{self as novel, EditorialUpdate, NovelFields};
use crate::services::relation_service::{self as relations, GraphPosition, RelationInput};
use crate::services::structure_link_service as node_links;
use crate::services::structure_service::{self as structure, LevelInput, StructureNode};
use crate::services::world_link_service::{self as world_links, WorldLinkInput};
use crate::services::world_service::{self as world, Module, WorldEntryInput};
use crate::services::{plot_service, project_service, project_storage, synopsis_service, system_note_service};
use crate::state::{AppState, Viewer};

use self::images::ImageSpec;

// ----------------------------------------------------------------------------
// Exemples intégrés
// ----------------------------------------------------------------------------

/// Un exemple : sa fiche (JSON) et ses fichiers de texte.
struct Source {
    id: &'static str,
    data: &'static str,
    texts: &'static [(&'static str, &'static str)],
}

const SOURCES: [Source; 2] = [
    Source {
        id: "roman",
        data: include_str!("../../../demo/roman/projet.json"),
        texts: &[
            ("manuscrit.md", include_str!("../../../demo/roman/manuscrit.md")),
            ("notes.md", include_str!("../../../demo/roman/notes.md")),
            ("documents.md", include_str!("../../../demo/roman/documents.md")),
        ],
    },
    Source {
        id: "manga",
        data: include_str!("../../../demo/manga/projet.json"),
        texts: &[
            ("scenario.md", include_str!("../../../demo/manga/scenario.md")),
            ("notes.md", include_str!("../../../demo/manga/notes.md")),
            ("documents.md", include_str!("../../../demo/manga/documents.md")),
        ],
    },
];

/// Identifiants des exemples, dans l'ordre d'affichage.
pub fn ids() -> Vec<&'static str> {
    SOURCES.iter().map(|s| s.id).collect()
}

fn source(id: &str) -> AppResult<&'static Source> {
    SOURCES
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::not_found("Projet d'exemple inconnu.").with_key("demo.unknown"))
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::internal(format!("Données d'exemple : {}", message.into()))
}

// ----------------------------------------------------------------------------
// Format des données (voir demo/README.md)
// ----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Data {
    format: u32,
    project: ProjectDef,
    card: CardDef,
    synopsis: Option<SynopsisDef>,
    #[serde(default)]
    character_settings: Option<ListSettingsDef>,
    #[serde(default)]
    location_settings: Option<ListSettingsDef>,
    #[serde(default)]
    world: BTreeMap<String, ListSettingsDef>,
    #[serde(default)]
    manga_settings: Option<MangaSettings>,
    structure: StructureDef,
    #[serde(default)]
    locations: Vec<Value>,
    #[serde(default)]
    characters: Vec<Value>,
    #[serde(default)]
    items: Vec<Value>,
    #[serde(default)]
    species: Vec<Value>,
    #[serde(default)]
    relations: Vec<Value>,
    #[serde(default)]
    graph: Vec<Value>,
    #[serde(default)]
    character_locations: Vec<Value>,
    #[serde(default)]
    world_links: Vec<Value>,
    #[serde(default)]
    node_links: Vec<NodeLinksDef>,
    #[serde(default)]
    manuscript: Option<ManuscriptDef>,
    #[serde(default)]
    editorial: Option<EditorialDef>,
    #[serde(default)]
    documents: Vec<DocumentDef>,
    #[serde(default)]
    notes: NotesDef,
    #[serde(default)]
    plot: Option<Value>,
    #[serde(default)]
    versions: Vec<VersionDef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectDef {
    name: String,
    description: String,
    #[serde(rename = "type")]
    project_type: ProjectType,
    status: ProjectStatus,
}

/// Présentation de l'exemple (commande `list_demo_projects`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CardDef {
    pitch: String,
    highlights: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SynopsisDef {
    /// Section du texte (`synopsis`).
    text: String,
    #[serde(default)]
    genres: Vec<String>,
    #[serde(default)]
    subgenres: Vec<String>,
    #[serde(default)]
    tones: Vec<String>,
}

/// Réglages d'un module à fiches : niveau de détail, types ajoutés,
/// listes personnalisées, activation et catégories (objets, faune).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListSettingsDef {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    categories: Option<Vec<String>>,
    #[serde(default)]
    detail_level: Option<String>,
    #[serde(default)]
    custom_types: Vec<CustomTypeDef>,
    #[serde(default)]
    lists: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CustomTypeDef {
    key: String,
    name: String,
    category: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StructureDef {
    #[serde(default)]
    levels: Option<Vec<LevelInput>>,
    #[serde(default = "yes")]
    auto_numbering: bool,
    nodes: Vec<NodeDef>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NodeDef {
    key: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    summary: String,
    /// Faux : hors numérotation (prologue, épilogue).
    #[serde(default)]
    numbered: Option<bool>,
    #[serde(default)]
    novel: Option<NovelFields>,
    #[serde(default)]
    manga: Option<ChapterFields>,
    #[serde(default)]
    children: Vec<NodeDef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NodeLinksDef {
    node: String,
    #[serde(default)]
    characters: BTreeMap<String, String>,
    #[serde(default)]
    locations: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManuscriptDef {
    #[serde(default)]
    goal: Option<i64>,
    #[serde(default)]
    daily_goal: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EditorialDef {
    pitch: String,
    /// Sections du texte.
    summary_short: String,
    summary_long: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DocumentDef {
    /// Élément du découpage où le document est rangé.
    node: String,
    /// Nom du fichier (son extension décide du format : .docx, .md, .txt, .png).
    name: String,
    /// Section du texte (documents texte et Word).
    #[serde(default)]
    text: Option<String>,
    /// Version précédente du texte (gardée dans les versions du document).
    #[serde(default)]
    earlier: Option<String>,
    #[serde(default)]
    image: Option<ImageSpec>,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NotesDef {
    #[serde(default)]
    folders: Vec<FolderDef>,
    #[serde(default)]
    notes: Vec<NoteDef>,
    #[serde(default)]
    stickies: Vec<StickyDef>,
    #[serde(default)]
    system_notes: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FolderDef {
    key: String,
    name: String,
    #[serde(default)]
    parent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NoteDef {
    key: String,
    title: String,
    #[serde(default)]
    folder: Option<String>,
    #[serde(default)]
    pinned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StickyDef {
    text: String,
    color: String,
    x: f64,
    y: f64,
}

/// Version nommée : l'état présent reçoit un nom, puis (facultatif) le
/// texte de l'élément est remplacé par une section plus récente.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VersionDef {
    kind: String,
    item: String,
    name: String,
    #[serde(default)]
    then: Option<String>,
}

// ----------------------------------------------------------------------------
// Lecture d'un exemple
// ----------------------------------------------------------------------------

/// Exemple prêt à construire : fiche, sections de texte, scénario.
struct Parsed {
    data: Data,
    texts: BTreeMap<String, String>,
    pages: Vec<script::PageDef>,
}

fn parse(source: &Source) -> AppResult<Parsed> {
    let data: Data = serde_json::from_str(source.data).map_err(|e| invalid(format!("{}/projet.json : {e}", source.id)))?;
    if data.format != 1 {
        return Err(invalid(format!("{} : format {} non pris en charge", source.id, data.format)));
    }
    let mut texts = BTreeMap::new();
    let mut pages = Vec::new();
    for (name, content) in source.texts {
        if *name == "scenario.md" {
            pages = script::parse(content)?;
            continue;
        }
        for (key, body) in markup::sections(content)? {
            if texts.insert(key.clone(), body).is_some() {
                return Err(invalid(format!("{} : section « {key} » en double", source.id)));
            }
        }
    }
    Ok(Parsed { data, texts, pages })
}

// ----------------------------------------------------------------------------
// Présentation
// ----------------------------------------------------------------------------

/// Exemple et projet déjà créé (commande `list_demo_projects`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoSummary {
    pub id: String,
    pub project_type: ProjectType,
    pub name: String,
    pub pitch: String,
    pub highlights: Vec<String>,
    /// Langue du contenu (l'interface le signale s'il diffère de la sienne).
    pub language: String,
    /// Projet déjà créé dans l'espace du visiteur.
    pub project_id: Option<String>,
}

/// Résultat d'une demande de création.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoOutcome {
    pub project: Project,
    /// Faux : l'exemple existait déjà, il est seulement rendu.
    pub created: bool,
}

/// Exemples disponibles, et projet déjà créé pour chacun.
pub async fn list(app_db: &SqlitePool, viewer: &Viewer) -> AppResult<Vec<DemoSummary>> {
    let mut out = Vec::with_capacity(SOURCES.len());
    for source in &SOURCES {
        let parsed: Data = serde_json::from_str(source.data).map_err(|e| invalid(format!("{} : {e}", source.id)))?;
        out.push(DemoSummary {
            id: source.id.to_owned(),
            project_type: parsed.project.project_type,
            name: parsed.project.name,
            pitch: parsed.card.pitch,
            highlights: parsed.card.highlights,
            language: "fr".to_owned(),
            project_id: project_service::find_demo_for_viewer(app_db, source.id, viewer).await?,
        });
    }
    Ok(out)
}

/// Une seule construction à la fois (deux clics rapides ne font pas deux
/// projets).
static CREATING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Crée l'exemple dans l'espace du visiteur, ou rend celui qui existe.
pub async fn create(state: &AppState, viewer: &Viewer, demo_id: &str) -> AppResult<DemoOutcome> {
    create_from(state, viewer, source(demo_id)?).await
}

async fn create_from(state: &AppState, viewer: &Viewer, source: &Source) -> AppResult<DemoOutcome> {
    let demo_id = source.id;
    let parsed = parse(source)?;

    let _guard = CREATING.lock().await;

    if let Some(id) = project_service::find_demo_for_viewer(&state.app_db, demo_id, viewer).await? {
        let project = project_service::find_for_viewer(&state.app_db, &id, viewer)
            .await?
            .ok_or_else(|| AppError::internal("Projet d'exemple introuvable"))?;
        return Ok(DemoOutcome { project, created: false });
    }

    let def = &parsed.data.project;
    let (project, key) = match viewer {
        Viewer::Account { user_id, key } => {
            project_service::create_project(&state.app_db, user_id, key, &def.name, &def.description, def.project_type).await?
        }
        Viewer::Guest => project_service::create_public_project(&state.app_db, &def.name, &def.description, def.project_type).await?,
    };

    let built = async {
        project_storage::create_storage(state, &project.id, &key).await?;
        let pool = project_storage::pool_for_viewer(state, &project.id, viewer).await?;
        Builder::new(&pool, def.project_type, &parsed).run().await?;
        project_service::set_demo_id(&state.app_db, &project.id, demo_id).await?;
        project_service::update_for_viewer(&state.app_db, &project.id, viewer, None, None, None, Some(def.status), None, None).await
    }
    .await;

    match built {
        Ok(project) => {
            tracing::info!(demo = demo_id, project = %project.id, "Projet d'exemple créé");
            Ok(DemoOutcome { project, created: true })
        }
        Err(error) => {
            tracing::error!(demo = demo_id, %error, detail = error.detail().unwrap_or_default(), "Projet d'exemple : échec, création annulée");
            project_storage::delete_storage(state, &project.id).await;
            let _ = project_service::delete_for_viewer(&state.app_db, &project.id, viewer).await;
            Err(error)
        }
    }
}

// ----------------------------------------------------------------------------
// Construction
// ----------------------------------------------------------------------------

/// Identifiants créés, par sorte et par clé (`char:jeanne` → identifiant).
#[derive(Default)]
struct Registry {
    ids: HashMap<String, String>,
}

impl Registry {
    fn add(&mut self, kind: &str, key: &str, id: &str) -> AppResult<()> {
        if self.ids.insert(format!("{kind}:{key}"), id.to_owned()).is_some() {
            return Err(invalid(format!("clé en double : {kind}:{key}")));
        }
        Ok(())
    }

    fn get(&self, kind: &str, key: &str) -> AppResult<String> {
        self.ids.get(&format!("{kind}:{key}")).cloned().ok_or_else(|| invalid(format!("référence inconnue : @{kind}:{key}")))
    }

    fn has(&self, kind: &str, key: &str) -> bool {
        self.ids.contains_key(&format!("{kind}:{key}"))
    }

    /// Remplace, dans une valeur JSON, chaque chaîne `@sorte:clé` par
    /// l'identifiant correspondant.
    fn resolve(&self, value: &Value) -> AppResult<Value> {
        Ok(match value {
            Value::String(text) => match reference(text) {
                Some((kind, key)) => Value::String(self.get(kind, key)?),
                None => value.clone(),
            },
            Value::Array(items) => Value::Array(items.iter().map(|v| self.resolve(v)).collect::<AppResult<_>>()?),
            Value::Object(map) => {
                let mut out = serde_json::Map::with_capacity(map.len());
                for (k, v) in map {
                    out.insert(k.clone(), self.resolve(v)?);
                }
                Value::Object(out)
            }
            _ => value.clone(),
        })
    }

    fn resolve_as<T: serde::de::DeserializeOwned>(&self, value: &Value, what: &str) -> AppResult<T> {
        serde_json::from_value(self.resolve(value)?).map_err(|e| invalid(format!("{what} : {e}")))
    }

    /// Clé ou référence `@sorte:clé` → identifiant.
    fn id(&self, kind: &str, value: &str) -> AppResult<String> {
        match reference(value) {
            Some((k, key)) => self.get(k, key),
            None => self.get(kind, value),
        }
    }
}

/// `@sorte:clé` → (sorte, clé).
fn reference(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix('@')?;
    let (kind, key) = rest.split_once(':')?;
    (!kind.is_empty() && kind.chars().all(|c| c.is_ascii_lowercase()) && !key.is_empty()).then_some((kind, key))
}

/// Fiche décrite dans les données : sa clé, ses images, et le reste pour le
/// service.
struct Entry {
    key: String,
    portrait: Option<ImageSpec>,
    gallery: Vec<(ImageSpec, Option<String>)>,
    body: Value,
}

fn entry(value: &Value, what: &str) -> AppResult<Entry> {
    let mut body = value.clone();
    let map = body.as_object_mut().ok_or_else(|| invalid(format!("{what} : objet attendu")))?;
    let key = map
        .remove("key")
        .and_then(|k| k.as_str().map(str::to_owned))
        .ok_or_else(|| invalid(format!("{what} : clé manquante")))?;
    let portrait = map
        .remove("portrait")
        .map(serde_json::from_value::<ImageSpec>)
        .transpose()
        .map_err(|e| invalid(format!("{what} {key} : portrait : {e}")))?;
    let mut gallery = Vec::new();
    if let Some(items) = map.remove("gallery") {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Item {
            image: ImageSpec,
            #[serde(default)]
            caption: Option<String>,
        }
        let items: Vec<Item> = serde_json::from_value(items).map_err(|e| invalid(format!("{what} {key} : galerie : {e}")))?;
        gallery = items.into_iter().map(|i| (i.image, i.caption)).collect();
    }
    // Champs « étiquettes » et « couleurs » : listes dans les données,
    // texte JSON pour le service (comme les envoie l'interface).
    if let Some(fields) = map.get_mut("fields").and_then(Value::as_object_mut) {
        for value in fields.values_mut() {
            if value.is_array() {
                *value = Value::String(value.to_string());
            }
        }
    }
    // Une clé mal orthographiée serait ignorée sans bruit par le service
    // (`parent` au lieu de `parentId`…) : on la refuse ici.
    let allowed: &[&str] = match what {
        "lieu" => &["name", "type", "parentId", "status", "fields"],
        "personnage" => &["firstName", "lastName", "role", "status", "fields"],
        _ => &["name", "type", "nature", "parentId", "status", "fields"],
    };
    if let Some(unknown) = map.keys().find(|k| !allowed.contains(&k.as_str())) {
        return Err(invalid(format!("{what} {key} : champ inconnu « {unknown} »")));
    }
    Ok(Entry { key, portrait, gallery, body })
}

struct Builder<'a> {
    pool: &'a SqlitePool,
    project_type: ProjectType,
    parsed: &'a Parsed,
    refs: Registry,
    /// Nœuds créés (clé → nœud), pour les libellés.
    nodes: HashMap<String, StructureNode>,
    /// Sections de texte utilisées (toutes doivent l'être).
    used: std::sync::Mutex<std::collections::HashSet<String>>,
}

impl<'a> Builder<'a> {
    fn new(pool: &'a SqlitePool, project_type: ProjectType, parsed: &'a Parsed) -> Self {
        Self { pool, project_type, parsed, refs: Registry::default(), nodes: HashMap::new(), used: Default::default() }
    }

    fn text(&self, key: &str) -> AppResult<&'a str> {
        self.used.lock().unwrap_or_else(|e| e.into_inner()).insert(key.to_owned());
        self.parsed.texts.get(key).map(String::as_str).ok_or_else(|| invalid(format!("section introuvable : « {key} »")))
    }

    fn html(&self, key: &str) -> AppResult<String> {
        let text = self.text(key)?;
        markup::to_html(text, &|kind, k| self.refs.get(kind, k))
    }

    async fn run(mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        let pool = self.pool;

        // Synopsis
        if let Some(synopsis) = &data.synopsis {
            let html = self.html(&synopsis.text)?;
            synopsis_service::update_synopsis(pool, &html, &synopsis.genres, &synopsis.subgenres, &synopsis.tones).await?;
        }

        self.settings().await?;
        self.structure().await?;
        self.places_and_people().await?;
        self.world_entries().await?;
        self.links().await?;
        self.texts().await?;
        self.manuscript().await?;
        self.documents().await?;
        self.notes().await?;
        self.plot().await?;
        self.versions().await?;

        // Toutes les sections de texte ont servi : rien d'oublié.
        let unused = {
            let used = self.used.lock().unwrap_or_else(|e| e.into_inner());
            self.parsed.texts.keys().find(|k| !used.contains(*k)).cloned()
        };
        if let Some(unused) = unused {
            return Err(invalid(format!("section jamais utilisée : « {unused} »")));
        }

        // La construction n'est pas une séance de travail de l'auteur.
        sqlx::query("DELETE FROM work_days").execute(pool).await?;
        sqlx::query("DELETE FROM activity").execute(pool).await?;
        Ok(())
    }

    // ---------------------------------------------------------------- Réglages

    async fn settings(&mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        let pool = self.pool;

        if let Some(s) = &data.character_settings {
            if let Some(level) = &s.detail_level {
                characters::set_detail_level(pool, level).await?;
            }
            for (list, values) in &s.lists {
                characters::set_list(pool, list, Some(values)).await?;
            }
            if !s.custom_types.is_empty() || s.enabled.is_some() || s.categories.is_some() {
                return Err(invalid("personnages : types, activation et catégories ne s'appliquent pas"));
            }
        }

        if let Some(s) = &data.location_settings {
            if let Some(level) = &s.detail_level {
                locations::set_detail_level(pool, level).await?;
            }
            if !s.custom_types.is_empty() {
                let inputs: Vec<CustomTypeInput> =
                    s.custom_types.iter().map(|t| CustomTypeInput { id: None, name: t.name.clone(), category: t.category.clone() }).collect();
                let saved = locations::set_custom_types(pool, &inputs).await?;
                for t in &s.custom_types {
                    let found = saved.custom_types.iter().find(|c| c.name == t.name).ok_or_else(|| invalid(format!("type de lieu non créé : {}", t.name)))?;
                    self.refs.add("ltype", &t.key, &found.id)?;
                }
            }
            for (list, values) in &s.lists {
                locations::set_list(pool, list, Some(values)).await?;
            }
        }

        for (name, s) in &data.world {
            let module = world_module(name)?;
            let kind = if module == Module::Item { "itype" } else { "stype" };
            if let Some(enabled) = s.enabled {
                world::set_enabled(pool, module, enabled).await?;
            }
            if let Some(categories) = &s.categories {
                world::set_categories(pool, module, categories).await?;
            }
            if let Some(level) = &s.detail_level {
                world::set_detail_level(pool, module, level).await?;
            }
            if !s.custom_types.is_empty() {
                let inputs: Vec<CustomTypeInput> =
                    s.custom_types.iter().map(|t| CustomTypeInput { id: None, name: t.name.clone(), category: t.category.clone() }).collect();
                let saved = world::set_custom_types(pool, module, &inputs).await?;
                for t in &s.custom_types {
                    let found = saved.custom_types.iter().find(|c| c.name == t.name).ok_or_else(|| invalid(format!("type non créé : {}", t.name)))?;
                    self.refs.add(kind, &t.key, &found.id)?;
                }
            }
            for (list, values) in &s.lists {
                world::set_list(pool, module, list, Some(values)).await?;
            }
        }

        if let Some(settings) = &data.manga_settings {
            manga::set_settings(pool, settings).await?;
        }
        Ok(())
    }

    // --------------------------------------------------------------- Découpage

    async fn structure(&mut self) -> AppResult<()> {
        let def = &self.parsed.data.structure;
        let pool = self.pool;
        if let Some(levels) = &def.levels {
            structure::set_levels(pool, self.project_type, levels).await?;
        }
        structure::set_auto_numbering(pool, self.project_type, def.auto_numbering).await?;

        // Parcours en profondeur, dans l'ordre du plan.
        let mut stack: Vec<(&NodeDef, Option<String>, i64)> = def.nodes.iter().rev().map(|n| (n, None, 0)).collect();
        while let Some((node, parent, level)) = stack.pop() {
            let created = structure::create_node(pool, self.project_type, parent.as_deref(), level, &node.title, None).await?;
            let updated = structure::update_node(
                pool,
                &created.id,
                None,
                (!node.summary.is_empty()).then_some(node.summary.as_str()),
                node.numbered,
                None,
            )
            .await?;
            if let Some(fields) = &node.novel {
                novel::set_fields(pool, &created.id, fields.clone()).await?;
            }
            if let Some(fields) = &node.manga {
                manga::set_chapter_fields(pool, &created.id, fields).await?;
            }
            self.refs.add("node", &node.key, &created.id)?;
            self.nodes.insert(node.key.clone(), updated);
            for child in node.children.iter().rev() {
                stack.push((child, Some(created.id.clone()), level + 1));
            }
        }

        // Pages du scénario : ajoutées à leur chapitre, dans l'ordre.
        for page in &self.parsed.pages {
            let chapter = self.nodes.get(&page.chapter).cloned().ok_or_else(|| invalid(format!("page {} : chapitre inconnu « {} »", page.key, page.chapter)))?;
            let created = structure::create_node(pool, self.project_type, Some(&chapter.id), chapter.level + 1, "", None).await?;
            let updated = if page.summary.is_empty() {
                created.clone()
            } else {
                structure::update_node(pool, &created.id, None, Some(&page.summary), None, None).await?
            };
            self.refs.add("node", &page.key, &created.id)?;
            self.nodes.insert(page.key.clone(), updated);
        }
        Ok(())
    }

    // ------------------------------------------------------ Lieux, personnages

    async fn places_and_people(&mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        let pool = self.pool;

        // Les lieux d'abord ; un champ qui désigne un personnage (souverain…)
        // est complété une fois les personnages créés.
        let mut deferred: Vec<(String, LocationInput, BTreeMap<String, String>)> = Vec::new();
        for value in &data.locations {
            let mut e = entry(value, "lieu")?;
            let mut later = BTreeMap::new();
            if let Some(fields) = e.body.get_mut("fields").and_then(Value::as_object_mut) {
                let keys: Vec<String> =
                    fields.iter().filter(|(_, v)| v.as_str().is_some_and(|s| s.starts_with("@char:"))).map(|(k, _)| k.clone()).collect();
                for k in keys {
                    if let Some(Value::String(v)) = fields.remove(&k) {
                        later.insert(k, v);
                    }
                }
            }
            let input: LocationInput = self.refs.resolve_as(&e.body, &format!("lieu {}", e.key))?;
            let created = locations::create_location(pool, &input).await?;
            self.refs.add("loc", &e.key, &created.id)?;
            if let Some(portrait) = &e.portrait {
                locations::set_portrait(pool, &created.id, &portrait.base64()?).await?;
            }
            for (image, caption) in std::mem::take(&mut e.gallery) {
                locations::add_gallery_image(pool, &created.id, &image.base64()?, caption.as_deref()).await?;
            }
            if !later.is_empty() {
                deferred.push((created.id, input, later));
            }
        }

        for value in &data.characters {
            let e = entry(value, "personnage")?;
            let input: CharacterInput = self.refs.resolve_as(&e.body, &format!("personnage {}", e.key))?;
            let created = characters::create_character(pool, &input).await?;
            self.refs.add("char", &e.key, &created.id)?;
            if let Some(portrait) = &e.portrait {
                characters::set_portrait(pool, &created.id, &portrait.base64()?).await?;
            }
            for (image, caption) in &e.gallery {
                if caption.is_some() {
                    return Err(invalid(format!("personnage {} : la galerie des personnages n'a pas de légende", e.key)));
                }
                characters::add_gallery_image(pool, &created.id, &image.base64()?).await?;
            }
        }

        for (id, mut input, later) in deferred {
            for (field, reference) in later {
                input.fields.insert(field, self.refs.id("char", &reference)?);
            }
            locations::update_location(pool, &id, &input).await?;
        }
        Ok(())
    }

    // ----------------------------------------------------- Objets, faune, flore

    async fn world_entries(&mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        for (module, list, kind) in [(Module::Item, &data.items, "item"), (Module::Species, &data.species, "species")] {
            for value in list {
                let e = entry(value, kind)?;
                let input: WorldEntryInput = self.refs.resolve_as(&e.body, &format!("{kind} {}", e.key))?;
                let created = world::create_entry(self.pool, module, &input).await?;
                self.refs.add(kind, &e.key, &created.id)?;
                if let Some(portrait) = &e.portrait {
                    world::set_portrait(self.pool, module, &created.id, &portrait.base64()?).await?;
                }
                for (image, caption) in &e.gallery {
                    world::add_gallery_image(self.pool, module, &created.id, &image.base64()?, caption.as_deref()).await?;
                }
            }
        }
        Ok(())
    }

    // ------------------------------------------------------------------ Liens

    async fn links(&mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        let pool = self.pool;

        for value in &data.relations {
            let input: RelationInput = self.refs.resolve_as(value, "relation")?;
            relations::create_relation(pool, &input).await?;
        }
        if !data.graph.is_empty() {
            let positions: Vec<GraphPosition> = data.graph.iter().map(|v| self.refs.resolve_as(v, "graphe")).collect::<AppResult<_>>()?;
            relations::save_positions(pool, &positions).await?;
        }
        for value in &data.character_locations {
            let input: CharacterLocationInput = self.refs.resolve_as(value, "lien personnage-lieu")?;
            character_places::create_link(pool, &input).await?;
        }
        for value in &data.world_links {
            let input: WorldLinkInput = self.refs.resolve_as(value, "lien de l'univers")?;
            world_links::create_link(pool, &input).await?;
        }

        // Personnages et lieux des éléments du découpage.
        for def in &data.node_links {
            let node = self.refs.id("node", &def.node)?;
            for (character, role) in &def.characters {
                node_links::link_character(pool, &node, &self.refs.id("char", character)?, role).await?;
            }
            for (location, role) in &def.locations {
                node_links::link_location(pool, &node, &self.refs.id("loc", location)?, role).await?;
            }
        }
        Ok(())
    }

    // ----------------------------------------------------------- Textes, scénario

    async fn texts(&mut self) -> AppResult<()> {
        let pool = self.pool;

        // Texte des scènes : section `scène:<clé du nœud>`.
        let scene_keys: Vec<&String> = self.parsed.texts.keys().filter(|k| k.starts_with("scène:")).collect();
        for key in scene_keys {
            let node_key = &key["scène:".len()..];
            let id = self.refs.get("node", node_key)?;
            let html = self.html(key)?;
            // Pas compté dans les mots écrits aujourd'hui (comme un import).
            novel::write_content(pool, &id, &html, false).await?;
        }

        // Scénario du manga.
        for page in &self.parsed.pages {
            let node = self.refs.get("node", &page.key)?;
            let mut panels = Vec::with_capacity(page.panels.len());
            let mut cast: Vec<String> = Vec::new();
            let mut places: Vec<String> = Vec::new();
            for p in &page.panels {
                let location_id = p.location.as_deref().map(|l| self.refs.id("loc", l)).transpose()?;
                let mut characters = Vec::new();
                for (key, state) in &p.cast {
                    let id = self.refs.id("char", key)?;
                    if !cast.contains(&id) {
                        cast.push(id.clone());
                    }
                    characters.push(PanelCharacter { character_id: id, state: state.clone() });
                }
                let mut texts = Vec::new();
                for t in &p.texts {
                    let character_id = t.speaker.as_deref().map(|s| self.refs.id("char", s)).transpose()?;
                    if let Some(id) = &character_id {
                        if !cast.contains(id) {
                            cast.push(id.clone());
                        }
                    }
                    texts.push(TextInput { id: None, kind: t.kind.to_owned(), character_id, content: t.content.clone() });
                }
                if let Some(l) = &location_id {
                    if !places.contains(l) {
                        places.push(l.clone());
                    }
                }
                panels.push(PanelInput {
                    id: None,
                    action: p.action.clone(),
                    framing: p.framing.clone(),
                    setting: p.setting.clone(),
                    artist_notes: p.artist_notes.clone(),
                    rhythm: p.rhythm.clone(),
                    location_id,
                    moment: p.moment.clone(),
                    continuity: p.continuity.clone(),
                    characters,
                    texts,
                });
            }
            let input = PageScriptInput { rhythm: page.rhythm.clone(), page_turn: page.page_turn, panels, page_label: page.key.clone() };
            manga::save_page_script(pool, &node, &input).await?;

            let pov = page.pov.as_deref().map(|p| self.refs.id("char", p)).transpose()?;
            for id in &cast {
                let role = if pov.as_deref() == Some(id.as_str()) { "pov" } else { "present" };
                node_links::link_character(pool, &node, id, role).await?;
            }
            for id in &places {
                node_links::link_location(pool, &node, id, "setting").await?;
            }
        }
        Ok(())
    }

    async fn manuscript(&mut self) -> AppResult<()> {
        let data = &self.parsed.data;
        if let Some(m) = &data.manuscript {
            if m.goal.is_some() {
                novel::set_manuscript_goal(self.pool, m.goal).await?;
            }
            if m.daily_goal.is_some() {
                novel::set_daily_goal(self.pool, m.daily_goal).await?;
            }
        }
        if let Some(e) = &data.editorial {
            novel::update_editorial(
                self.pool,
                EditorialUpdate {
                    pitch: Some(e.pitch.clone()),
                    summary_short: Some(self.text(&e.summary_short)?.to_owned()),
                    summary_long: Some(self.text(&e.summary_long)?.to_owned()),
                },
            )
            .await?;
        }
        Ok(())
    }

    // -------------------------------------------------------------- Documents

    fn document_bytes(&self, name: &str, section: &str) -> AppResult<Vec<u8>> {
        let text = self.text(section)?;
        if name.to_lowercase().ends_with(".docx") {
            images::docx(&markup::plain_paragraphs(text)?)
        } else {
            Ok(format!("{text}\n").into_bytes())
        }
    }

    async fn documents(&mut self) -> AppResult<()> {
        let pool = self.pool;
        for def in &self.parsed.data.documents {
            let node = self.refs.id("node", &def.node)?;
            let bytes = match (&def.image, &def.text) {
                (Some(image), None) => image.png()?,
                (None, Some(section)) => self.document_bytes(&def.name, def.earlier.as_deref().unwrap_or(section))?,
                _ => return Err(invalid(format!("document {} : une image ou un texte", def.name))),
            };
            let created = documents::add(pool, &node, &def.name, &bytes).await?;
            if let (Some(_), Some(section)) = (&def.earlier, &def.text) {
                // La version précédente reste dans l'historique du document.
                let bytes = self.document_bytes(&def.name, section)?;
                documents::replace_content(pool, &created.id, &bytes, None).await?;
            }
            if let Some(note) = &def.note {
                documents::set_note(pool, &created.id, note).await?;
            }
        }
        Ok(())
    }

    // ------------------------------------------------------------------ Notes

    async fn notes(&mut self) -> AppResult<()> {
        let def = &self.parsed.data.notes;
        let pool = self.pool;

        for folder in &def.folders {
            let parent = folder.parent.as_deref().map(|p| self.refs.id("folder", p)).transpose()?;
            let created = notes::create_folder(pool, parent.as_deref(), &folder.name).await?;
            self.refs.add("folder", &folder.key, &created.id)?;
        }
        // Les notes peuvent se citer entre elles : toutes sont créées avant
        // d'être remplies.
        let mut created_notes = Vec::new();
        for note in &def.notes {
            let folder = note.folder.as_deref().map(|f| self.refs.id("folder", f)).transpose()?;
            let created = notes::create_note(pool, folder.as_deref(), &note.title).await?;
            self.refs.add("note", &note.key, &created.id)?;
            created_notes.push((note, created.id));
        }
        for (note, id) in created_notes {
            let text = self.text(&format!("note:{}", note.key))?;
            let doc = markup::to_note(text, &|kind, k| self.refs.get(kind, k))?;
            notes::update_note(pool, &id, &NoteUpdate { title: None, content: Some(doc.content), excerpt: Some(doc.excerpt), pinned: Some(note.pinned) }).await?;
        }
        for sticky in &def.stickies {
            let created = notes::create_sticky(pool, &sticky.color, sticky.x, sticky.y).await?;
            notes::update_sticky(pool, &created.id, &StickyUpdate { text: Some(sticky.text.clone()), color: None, x: None, y: None, width: None, height: None, z: None })
                .await?;
        }
        if def.system_notes {
            system_note_service::set_enabled(pool, self.project_type, true, "fr").await?;
        }
        Ok(())
    }

    // ------------------------------------------------------------------ Trame

    async fn plot(&mut self) -> AppResult<()> {
        if let Some(plot) = &self.parsed.data.plot {
            let resolved = self.refs.resolve(plot)?;
            let text = resolved.to_string();
            plot_service::validate(&text)?;
            plot_service::save(self.pool, &text).await?;
        }
        Ok(())
    }

    // --------------------------------------------------------------- Versions

    async fn versions(&mut self) -> AppResult<()> {
        for v in &self.parsed.data.versions {
            let item = if v.item == "default" { v.item.clone() } else { self.refs.id("node", &v.item)? };
            history::create_named_version(self.pool, &v.kind, &item, &v.name).await?;
            if let Some(section) = &v.then {
                let html = self.html(section)?;
                match v.kind.as_str() {
                    "structureNode" => {
                        novel::write_content(self.pool, &item, &html, false).await?;
                    }
                    "synopsis" => {
                        let current = synopsis_service::get_synopsis(self.pool).await?;
                        synopsis_service::update_synopsis(self.pool, &html, &current.genres, &current.subgenres, &current.tone).await?;
                    }
                    _ => return Err(invalid(format!("version « {} » : seuls le texte d'une scène et le synopsis peuvent être réécrits", v.name))),
                }
            }
        }
        Ok(())
    }
}

fn world_module(name: &str) -> AppResult<Module> {
    match name {
        "item" => Ok(Module::Item),
        "species" => Ok(Module::Species),
        other => Err(invalid(format!("module inconnu : {other}"))),
    }
}

#[cfg(test)]
mod tests;
