//! Objets, faune et flore d'un projet (base du projet).
//!
//! # Deux modules, un seul moteur
//!
//! Les **objets** (`items` : armes, véhicules, vêtements, téléphones…) et la
//! **faune et flore** (`species` : animaux, plantes) fonctionnent comme les
//! lieux (`location_service`) : un type rangé dans une catégorie, une fiche
//! en trois couches de champs (communs, de la catégorie, du type) gardée en
//! JSON, une image principale, une galerie, des types ajoutés par l'auteur,
//! une liste de statuts personnalisable et un niveau de détail.
//!
//! Ce fichier les gère tous les deux ; seuls les noms de tables et le
//! catalogue changent (voir [`Module`]). Les catalogues sont lus à la fois
//! par l'interface et par Rust :
//! `src/lib/itemCatalog.json` et `src/lib/speciesCatalog.json`.
//!
//! # Activation
//!
//! Les deux modules sont **désactivés par défaut**. L'auteur les active dans
//! Paramètres du projet et choisit les catégories qu'il veut utiliser
//! (`*_settings.enabled`, `*_settings.categories`). Désactiver un module ne
//! supprime rien : il est seulement masqué.
//!
//! # Hiérarchie
//!
//! `parent_id` : objet qui contient celui-ci (un coffre, un vaisseau) ;
//! pour la faune et la flore, espèce à laquelle appartient un animal ou une
//! plante précis. Pas de boucle ; supprimer un élément fait remonter ce
//! qu'il contenait d'un niveau.
//!
//! # Animal personnage
//!
//! Un animal (ou une plante) **précis** (`nature = 'individual'`) peut aussi
//! être un personnage : `species.character_id` désigne sa fiche de
//! personnage (relations, scènes…). Sans personnage, c'est un animal tout
//! court. Voir [`set_character`] et [`create_character`].

use crate::error::{AppError, AppResult};
use crate::services::character_service::{self, decode_image, CharacterInput, DetailLevel, Portrait};
use crate::services::location_service::{CustomType, CustomTypeInput};
use crate::services::trash_service::Snapshot;
use crate::services::world_link_service;
use crate::utils::{new_id, now_utc};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{BTreeMap, HashSet};
use std::sync::OnceLock;

const MAX_NAME_CHARS: usize = 200;
const MAX_CHOICE_CHARS: usize = 60;
const MAX_LIST_VALUES: usize = 50;
const MAX_CUSTOM_TYPES: usize = 50;
pub const MAX_GALLERY_IMAGES: i64 = 30;
const MAX_CAPTION_CHARS: usize = 200;
const MAX_TAGS: usize = 30;
const MAX_TAG_CHARS: usize = 50;
const MAX_DEPTH: usize = 1_000;
const CUSTOM_PREFIX: &str = "custom-";

/// Listes personnalisables.
pub const LISTS: [&str; 1] = ["status"];

// ----------------------------------------------------------------------------
// Modules
// ----------------------------------------------------------------------------

/// Module concerné : objets ou faune et flore.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Module {
    Item,
    Species,
}

/// Noms des tables et colonnes d'un module (constantes : jamais saisies).
struct Spec {
    table: &'static str,
    settings: &'static str,
    portraits: &'static str,
    images: &'static str,
    /// Colonne qui désigne l'élément dans les tables d'images.
    fk: &'static str,
}

const ITEM_SPEC: Spec = Spec {
    table: "items",
    settings: "item_settings",
    portraits: "item_portraits",
    images: "item_images",
    fk: "item_id",
};

const SPECIES_SPEC: Spec = Spec {
    table: "species",
    settings: "species_settings",
    portraits: "species_portraits",
    images: "species_images",
    fk: "species_id",
};

impl Module {
    fn spec(self) -> &'static Spec {
        match self {
            Module::Item => &ITEM_SPEC,
            Module::Species => &SPECIES_SPEC,
        }
    }

    /// Nom de la sorte d'élément (corbeille, historique, liens).
    pub fn kind(self) -> &'static str {
        match self {
            Module::Item => "item",
            Module::Species => "species",
        }
    }

    /// Table des éléments.
    pub fn table(self) -> &'static str {
        self.spec().table
    }

    pub fn catalog(self) -> &'static Catalog {
        match self {
            Module::Item => {
                static CATALOG: OnceLock<Catalog> = OnceLock::new();
                CATALOG.get_or_init(|| {
                    serde_json::from_str(include_str!("../../../src/lib/itemCatalog.json"))
                        .expect("src/lib/itemCatalog.json invalide (voir le test catalogs_are_consistent)")
                })
            }
            Module::Species => {
                static CATALOG: OnceLock<Catalog> = OnceLock::new();
                CATALOG.get_or_init(|| {
                    serde_json::from_str(include_str!("../../../src/lib/speciesCatalog.json"))
                        .expect("src/lib/speciesCatalog.json invalide (voir le test catalogs_are_consistent)")
                })
            }
        }
    }

    /// Vrai si les éléments ont une nature (espèce / individu).
    fn has_nature(self) -> bool {
        !self.catalog().natures.is_empty()
    }

    pub const ALL: [Module; 2] = [Module::Item, Module::Species];
}

// ----------------------------------------------------------------------------
// Catalogue
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Text,
    LongText,
    Tags,
    Choice,
    /// Élément du découpage du récit (identifiant).
    Reference,
    /// Palette : tableau JSON de « #rrggbb » (cadre de l'image).
    Colors,
}

#[derive(Debug, Deserialize)]
pub struct TypeDef {
    pub id: String,
    pub category: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NatureDef {
    pub id: String,
    pub default_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDef {
    pub key: String,
    pub kind: FieldKind,
    pub max_length: usize,
    /// Affichage seulement (vérifié par `catalogs_are_consistent`).
    #[serde(default)]
    #[cfg_attr(not(test), allow(dead_code))]
    pub categories: Vec<String>,
    #[serde(default)]
    #[cfg_attr(not(test), allow(dead_code))]
    pub types: Vec<String>,
    #[serde(default)]
    #[cfg_attr(not(test), allow(dead_code))]
    pub natures: Vec<String>,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub categories: Vec<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub statuses: Vec<String>,
    pub default_status: String,
    #[serde(default)]
    pub natures: Vec<NatureDef>,
    pub types: Vec<TypeDef>,
    pub fields: Vec<FieldDef>,
}

impl Catalog {
    fn field(&self, key: &str) -> Option<&FieldDef> {
        self.fields.iter().find(|field| field.key == key)
    }

    fn builtin_type(&self, id: &str) -> Option<&TypeDef> {
        self.types.iter().find(|item| item.id == id)
    }

    fn has_category(&self, id: &str) -> bool {
        self.categories.iter().any(|category| category == id)
    }

    fn nature(&self, id: &str) -> Option<&NatureDef> {
        self.natures.iter().find(|nature| nature.id == id)
    }
}

// ----------------------------------------------------------------------------
// Types échangés avec l'interface
// ----------------------------------------------------------------------------

/// Objet ou espèce, tel qu'envoyé à l'interface (sans les images).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    /// Faune et flore : `species` ou `individual` (objets : `None`).
    pub nature: Option<String>,
    pub parent_id: Option<String>,
    /// Faune et flore : fiche de personnage de cet animal (`None` : aucune).
    pub character_id: Option<String>,
    pub status: String,
    pub fields: BTreeMap<String, String>,
    pub portrait_updated_at: Option<String>,
    pub gallery_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Contenu d'une fiche (création ou modification).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEntryInput {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub nature: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
}

/// Réglages d'un module pour le projet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldSettings {
    /// Module affiché dans la barre de gauche.
    pub enabled: bool,
    /// Catégories choisies par l'auteur (ordre du catalogue).
    pub categories: Vec<String>,
    pub detail_level: Option<DetailLevel>,
    pub custom_types: Vec<CustomType>,
    pub lists: BTreeMap<String, Vec<String>>,
}

#[derive(sqlx::FromRow)]
struct EntryRow {
    id: String,
    name: String,
    #[sqlx(rename = "type")]
    kind: String,
    nature: Option<String>,
    parent_id: Option<String>,
    character_id: Option<String>,
    status: String,
    fields: String,
    portrait_updated_at: Option<String>,
    gallery_count: i64,
    created_at: String,
    updated_at: String,
}

impl EntryRow {
    fn into_entry(self) -> WorldEntry {
        WorldEntry {
            id: self.id,
            name: self.name,
            kind: self.kind,
            nature: self.nature,
            parent_id: self.parent_id,
            character_id: self.character_id,
            status: self.status,
            fields: serde_json::from_str(&self.fields).unwrap_or_default(),
            portrait_updated_at: self.portrait_updated_at,
            gallery_count: self.gallery_count,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

// ----------------------------------------------------------------------------
// Erreurs
// ----------------------------------------------------------------------------

fn not_found() -> AppError {
    AppError::not_found("Élément introuvable.").with_key("world.notFound")
}

fn image_not_found() -> AppError {
    AppError::not_found("Image introuvable.").with_key("world.imageNotFound")
}

fn too_long(max: usize) -> AppError {
    AppError::validation(format!("Un champ dépasse {max} caractères."))
        .with_key("world.fieldTooLong")
        .with_param("max", max)
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

struct CleanInput {
    name: String,
    kind: String,
    nature: Option<String>,
    parent_id: Option<String>,
    status: String,
    fields: BTreeMap<String, String>,
}

async fn exists(pool: &SqlitePool, sql: &str, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar(sql).bind(id).fetch_optional(pool).await?;
    Ok(found.is_some())
}

async fn entry_exists(pool: &SqlitePool, module: Module, id: &str) -> AppResult<bool> {
    exists(pool, &format!("SELECT id FROM {} WHERE id = ?", module.table()), id).await
}

/// Vrai si `ancestor` est `id` lui-même ou un de ses parents.
async fn is_ancestor_or_self(pool: &SqlitePool, module: Module, ancestor: &str, id: &str) -> AppResult<bool> {
    let sql = format!("SELECT parent_id FROM {} WHERE id = ?", module.table());
    let mut current = Some(id.to_owned());

    for _ in 0..MAX_DEPTH {
        let Some(node) = current else {
            return Ok(false);
        };
        if node == ancestor {
            return Ok(true);
        }
        current = sqlx::query_scalar::<_, Option<String>>(&sql)
            .bind(&node)
            .fetch_optional(pool)
            .await?
            .flatten();
    }

    Ok(true)
}

/// Catégorie d'un type, par défaut ou ajouté par l'auteur.
fn category_of<'a>(module: Module, kind: &str, settings: &'a WorldSettings) -> Option<&'a str> {
    if let Some(def) = module.catalog().builtin_type(kind) {
        return Some(def.category.as_str());
    }
    settings
        .custom_types
        .iter()
        .find(|item| item.id == kind)
        .map(|item| item.category.as_str())
}

async fn clean_value(pool: &SqlitePool, def: &FieldDef, raw: &str) -> AppResult<Option<String>> {
    let value = raw.trim();

    if value.is_empty() {
        return Ok(None);
    }

    match def.kind {
        FieldKind::Text | FieldKind::LongText => {
            if value.chars().count() > def.max_length {
                return Err(too_long(def.max_length));
            }
            Ok(Some(value.to_owned()))
        }
        FieldKind::Tags => {
            let tags: Vec<String> = serde_json::from_str(value).map_err(|_| {
                AppError::validation("Liste d'étiquettes illisible.").with_key("world.invalidValue")
            })?;
            let mut cleaned: Vec<String> = Vec::new();

            for tag in tags {
                let tag = tag.trim();
                if tag.is_empty() {
                    continue;
                }
                if tag.chars().count() > MAX_TAG_CHARS {
                    return Err(too_long(MAX_TAG_CHARS));
                }
                if !cleaned.iter().any(|item| item.to_lowercase() == tag.to_lowercase()) {
                    cleaned.push(tag.to_owned());
                }
            }

            if cleaned.len() > MAX_TAGS {
                return Err(AppError::validation("Trop d'étiquettes.")
                    .with_key("world.tooManyTags")
                    .with_param("max", MAX_TAGS));
            }

            Ok((!cleaned.is_empty()).then(|| serde_json::to_string(&cleaned)).transpose()?)
        }
        FieldKind::Choice => {
            if def.options.iter().any(|option| option == value) {
                Ok(Some(value.to_owned()))
            } else {
                Err(AppError::validation("Valeur inconnue.").with_key("world.invalidValue"))
            }
        }
        FieldKind::Reference => {
            let found = exists(pool, "SELECT id FROM structure_nodes WHERE id = ?", value).await?;
            Ok(found.then(|| value.to_owned()))
        }
        FieldKind::Colors => {
            let colors = character_service::clean_palette(value)
                .ok_or_else(|| AppError::validation("Palette illisible.").with_key("world.invalidValue"))?;
            Ok((!colors.is_empty()).then(|| serde_json::to_string(&colors)).transpose()?)
        }
    }
}

async fn clean_input(
    pool: &SqlitePool,
    module: Module,
    input: &WorldEntryInput,
    self_id: Option<&str>,
) -> AppResult<CleanInput> {
    let catalog = module.catalog();
    let name = input.name.trim();

    if name.is_empty() {
        return Err(AppError::validation("Le nom est requis.").with_key("world.nameRequired"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation("Le nom est trop long.")
            .with_key("world.nameTooLong")
            .with_param("max", MAX_NAME_CHARS));
    }

    let settings = get_settings(pool, module).await?;

    if category_of(module, &input.kind, &settings).is_none() {
        return Err(AppError::validation("Type inconnu.").with_key("world.invalidType"));
    }

    // Nature (faune et flore) : espèce par défaut.
    let nature = if module.has_nature() {
        let requested = input.nature.as_deref().map(str::trim).filter(|value| !value.is_empty());
        let def = match requested {
            None => &catalog.natures[0],
            Some(value) => catalog
                .nature(value)
                .ok_or_else(|| AppError::validation("Nature inconnue.").with_key("world.invalidNature"))?,
        };
        Some(def.id.clone())
    } else {
        None
    };

    let default_status = nature
        .as_deref()
        .and_then(|id| catalog.nature(id))
        .map(|def| def.default_status.as_str())
        .unwrap_or(catalog.default_status.as_str());

    let status = match input.status.trim() {
        "" => default_status,
        value => value,
    };
    if status.chars().count() > MAX_CHOICE_CHARS {
        return Err(too_long(MAX_CHOICE_CHARS));
    }

    let parent_id = match input.parent_id.as_deref().map(str::trim).filter(|id| !id.is_empty()) {
        None => None,
        Some(parent) => {
            if !entry_exists(pool, module, parent).await? {
                return Err(AppError::not_found("L'élément parent est introuvable.")
                    .with_key("world.parentNotFound"));
            }

            // Un animal précis ne contient rien : seule une espèce peut en
            // regrouper d'autres.
            if module.has_nature() {
                let parent_nature: String =
                    sqlx::query_scalar(&format!("SELECT nature FROM {} WHERE id = ?", module.table()))
                        .bind(parent)
                        .fetch_one(pool)
                        .await?;
                if parent_nature != "species" {
                    return Err(AppError::validation("Un animal ou une plante précis ne peut rien contenir.")
                        .with_key("world.parentNotSpecies"));
                }
            }

            if let Some(id) = self_id {
                if is_ancestor_or_self(pool, module, id, parent).await? {
                    return Err(AppError::validation(
                        "Un élément ne peut pas être placé dans lui-même ni dans un élément qu'il contient.",
                    )
                    .with_key("world.parentCycle"));
                }
            }

            Some(parent.to_owned())
        }
    };

    let mut fields = BTreeMap::new();

    for (key, raw) in &input.fields {
        let def = catalog.field(key).ok_or_else(|| {
            AppError::validation(format!("Champ de fiche inconnu : {key}.")).with_key("world.unknownField")
        })?;

        if let Some(value) = clean_value(pool, def, raw).await? {
            fields.insert(def.key.clone(), value);
        }
    }

    Ok(CleanInput {
        name: name.to_owned(),
        kind: input.kind.clone(),
        nature,
        parent_id,
        status: status.to_owned(),
        fields,
    })
}

// ----------------------------------------------------------------------------
// Réglages
// ----------------------------------------------------------------------------

/// Réglages d'un module.
pub async fn get_settings(pool: &SqlitePool, module: Module) -> AppResult<WorldSettings> {
    let sql = format!(
        "SELECT enabled, categories, detail_level, custom_types, lists FROM {} WHERE id = 'default'",
        module.spec().settings
    );
    let row: Option<(i64, String, Option<String>, String, String)> =
        sqlx::query_as(&sql).fetch_optional(pool).await?;

    let (enabled, categories, level, custom_types, lists) =
        row.unwrap_or_else(|| (0, "[]".to_owned(), None, "[]".to_owned(), "{}".to_owned()));

    // Catégories connues seulement, dans l'ordre du catalogue.
    let chosen: Vec<String> = serde_json::from_str(&categories).unwrap_or_default();
    let categories = module
        .catalog()
        .categories
        .iter()
        .filter(|category| chosen.contains(category))
        .cloned()
        .collect();

    Ok(WorldSettings {
        enabled: enabled != 0,
        categories,
        detail_level: level.as_deref().and_then(DetailLevel::parse),
        custom_types: serde_json::from_str(&custom_types).unwrap_or_default(),
        lists: serde_json::from_str(&lists).unwrap_or_default(),
    })
}

/// Enregistre une colonne des réglages (la ligne est créée au besoin).
async fn save_setting(pool: &SqlitePool, module: Module, column: &'static str, value: &str) -> AppResult<()> {
    let table = module.spec().settings;
    sqlx::query(&format!(
        "INSERT INTO {table} (id, updated_at) VALUES ('default', ?) ON CONFLICT (id) DO NOTHING"
    ))
    .bind(now_utc())
    .execute(pool)
    .await?;

    sqlx::query(&format!("UPDATE {table} SET {column} = ?, updated_at = ? WHERE id = 'default'"))
        .bind(value)
        .bind(now_utc())
        .execute(pool)
        .await?;

    Ok(())
}

/// Active ou désactive un module. À la première activation, toutes les
/// catégories sont proposées (l'auteur décoche celles qu'il ne veut pas).
pub async fn set_enabled(pool: &SqlitePool, module: Module, enabled: bool) -> AppResult<WorldSettings> {
    let settings = get_settings(pool, module).await?;

    if enabled && settings.categories.is_empty() {
        save_setting(pool, module, "categories", &serde_json::to_string(&module.catalog().categories)?).await?;
    }

    let table = module.spec().settings;
    sqlx::query(&format!(
        "INSERT INTO {table} (id, updated_at) VALUES ('default', ?) ON CONFLICT (id) DO NOTHING"
    ))
    .bind(now_utc())
    .execute(pool)
    .await?;
    sqlx::query(&format!("UPDATE {table} SET enabled = ?, updated_at = ? WHERE id = 'default'"))
        .bind(i64::from(enabled))
        .bind(now_utc())
        .execute(pool)
        .await?;

    get_settings(pool, module).await
}

/// Choisit les catégories utilisées (au moins une). Les éléments déjà créés
/// dans une catégorie retirée sont gardés et restent visibles.
pub async fn set_categories(pool: &SqlitePool, module: Module, categories: &[String]) -> AppResult<WorldSettings> {
    let catalog = module.catalog();

    for category in categories {
        if !catalog.has_category(category) {
            return Err(AppError::validation("Catégorie inconnue.").with_key("world.invalidCategory"));
        }
    }

    let chosen: Vec<&String> = catalog.categories.iter().filter(|c| categories.contains(c)).collect();

    if chosen.is_empty() {
        return Err(AppError::validation("Choisissez au moins une catégorie.").with_key("world.noCategory"));
    }

    save_setting(pool, module, "categories", &serde_json::to_string(&chosen)?).await?;
    get_settings(pool, module).await
}

/// Niveau de détail de toutes les fiches du module.
pub async fn set_detail_level(pool: &SqlitePool, module: Module, level: &str) -> AppResult<WorldSettings> {
    let level = DetailLevel::parse(level)
        .ok_or_else(|| AppError::validation("Niveau de détail inconnu.").with_key("world.invalidLevel"))?;

    save_setting(pool, module, "detail_level", level.as_str()).await?;
    get_settings(pool, module).await
}

/// Remplace les types ajoutés par l'auteur. Un type encore utilisé ne peut
/// pas être retiré.
pub async fn set_custom_types(
    pool: &SqlitePool,
    module: Module,
    inputs: &[CustomTypeInput],
) -> AppResult<WorldSettings> {
    let settings = get_settings(pool, module).await?;
    let known: HashSet<&str> = settings.custom_types.iter().map(|item| item.id.as_str()).collect();

    if inputs.len() > MAX_CUSTOM_TYPES {
        return Err(AppError::validation("Trop de types personnalisés.")
            .with_key("world.tooManyTypes")
            .with_param("max", MAX_CUSTOM_TYPES));
    }

    let mut cleaned: Vec<CustomType> = Vec::with_capacity(inputs.len());

    for input in inputs {
        let name = input.name.trim();

        if name.is_empty() {
            return Err(AppError::validation("Le nom du type est requis.").with_key("world.typeNameRequired"));
        }
        if name.chars().count() > MAX_CHOICE_CHARS {
            return Err(too_long(MAX_CHOICE_CHARS));
        }
        if !module.catalog().has_category(&input.category) {
            return Err(AppError::validation("Catégorie inconnue.").with_key("world.invalidCategory"));
        }
        if cleaned.iter().any(|item| item.name.to_lowercase() == name.to_lowercase()) {
            return Err(AppError::validation("Deux types portent le même nom.")
                .with_key("world.typeDuplicate")
                .with_param("name", name.to_owned()));
        }

        let id = match input.id.as_deref() {
            Some(id) if known.contains(id) => id.to_owned(),
            _ => format!("{CUSTOM_PREFIX}{}", new_id()),
        };

        cleaned.push(CustomType { id, name: name.to_owned(), category: input.category.clone() });
    }

    let used_sql = format!("SELECT COUNT(*) FROM {} WHERE type = ?", module.table());

    for removed in settings.custom_types.iter().filter(|old| !cleaned.iter().any(|item| item.id == old.id)) {
        let used: i64 = sqlx::query_scalar(&used_sql).bind(&removed.id).fetch_one(pool).await?;

        if used > 0 {
            return Err(AppError::validation("Ce type est encore utilisé.")
                .with_key("world.typeInUse")
                .with_param("name", removed.name.clone())
                .with_param("count", used));
        }
    }

    save_setting(pool, module, "custom_types", &serde_json::to_string(&cleaned)?).await?;
    get_settings(pool, module).await
}

/// Remplace une liste personnalisable. `None` : valeurs par défaut.
pub async fn set_list(
    pool: &SqlitePool,
    module: Module,
    list: &str,
    values: Option<&[String]>,
) -> AppResult<WorldSettings> {
    if !LISTS.contains(&list) {
        return Err(AppError::validation("Liste inconnue.").with_key("world.invalidList"));
    }

    let mut lists = get_settings(pool, module).await?.lists;

    match values {
        None => {
            lists.remove(list);
        }
        Some(values) => {
            let mut cleaned: Vec<String> = Vec::new();

            for value in values {
                let value = value.trim();
                if value.is_empty() {
                    continue;
                }
                if value.chars().count() > MAX_CHOICE_CHARS {
                    return Err(too_long(MAX_CHOICE_CHARS));
                }
                if !cleaned.iter().any(|item| item.to_lowercase() == value.to_lowercase()) {
                    cleaned.push(value.to_owned());
                }
            }

            if cleaned.len() > MAX_LIST_VALUES {
                return Err(AppError::validation("La liste contient trop de valeurs.")
                    .with_key("world.listTooLong")
                    .with_param("max", MAX_LIST_VALUES));
            }

            lists.insert(list.to_owned(), cleaned);
        }
    }

    save_setting(pool, module, "lists", &serde_json::to_string(&lists)?).await?;
    get_settings(pool, module).await
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

fn select_sql(module: Module) -> String {
    let spec = module.spec();
    let (nature, character) = if module.has_nature() {
        ("e.nature", "e.character_id")
    } else {
        ("NULL", "NULL")
    };

    format!(
        "SELECT e.id, e.name, e.type, {nature} AS nature, e.parent_id, {character} AS character_id, \
                e.status, e.fields, p.updated_at AS portrait_updated_at, \
                (SELECT COUNT(*) FROM {images} i WHERE i.{fk} = e.id) AS gallery_count, \
                e.created_at, e.updated_at \
         FROM {table} e LEFT JOIN {portraits} p ON p.{fk} = e.id",
        table = spec.table,
        images = spec.images,
        portraits = spec.portraits,
        fk = spec.fk,
    )
}

/// Tous les éléments du module, par nom.
pub async fn list_entries(pool: &SqlitePool, module: Module) -> AppResult<Vec<WorldEntry>> {
    let sql = format!("{} ORDER BY e.name COLLATE NOCASE, e.created_at", select_sql(module));

    Ok(sqlx::query_as::<_, EntryRow>(&sql)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(EntryRow::into_entry)
        .collect())
}

/// Un élément.
pub async fn get_entry(pool: &SqlitePool, module: Module, id: &str) -> AppResult<WorldEntry> {
    let sql = format!("{} WHERE e.id = ?", select_sql(module));

    sqlx::query_as::<_, EntryRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(EntryRow::into_entry)
        .ok_or_else(not_found)
}

// ----------------------------------------------------------------------------
// Écriture
// ----------------------------------------------------------------------------

/// Crée un élément.
pub async fn create_entry(pool: &SqlitePool, module: Module, input: &WorldEntryInput) -> AppResult<WorldEntry> {
    let clean = clean_input(pool, module, input, None).await?;
    let id = new_id();
    let now = now_utc();

    if module.has_nature() {
        sqlx::query(&format!(
            "INSERT INTO {} (id, name, type, nature, parent_id, status, fields, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            module.table()
        ))
        .bind(&id)
        .bind(&clean.name)
        .bind(&clean.kind)
        .bind(&clean.nature)
        .bind(&clean.parent_id)
        .bind(&clean.status)
        .bind(serde_json::to_string(&clean.fields)?)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(&format!(
            "INSERT INTO {} (id, name, type, parent_id, status, fields, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            module.table()
        ))
        .bind(&id)
        .bind(&clean.name)
        .bind(&clean.kind)
        .bind(&clean.parent_id)
        .bind(&clean.status)
        .bind(serde_json::to_string(&clean.fields)?)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;
    }

    get_entry(pool, module, &id).await
}

/// Remplace la fiche d'un élément.
pub async fn update_entry(
    pool: &SqlitePool,
    module: Module,
    id: &str,
    input: &WorldEntryInput,
) -> AppResult<WorldEntry> {
    let current = get_entry(pool, module, id).await?;
    let clean = clean_input(pool, module, input, Some(id)).await?;

    if module.has_nature() {
        // Une espèce ne peut pas être un personnage, et elle peut regrouper
        // des individus ; un animal précis, l'inverse.
        if clean.nature.as_deref() == Some("species") && current.character_id.is_some() {
            return Err(AppError::validation(
                "Cet animal est aussi un personnage : retirez d'abord ce lien pour en faire une espèce.",
            )
            .with_key("world.unlinkCharacterFirst"));
        }

        if clean.nature.as_deref() == Some("individual") {
            let members: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM species WHERE parent_id = ?")
                .bind(id)
                .fetch_one(pool)
                .await?;
            if members > 0 {
                return Err(AppError::validation(
                    "D'autres fiches appartiennent à cette espèce : elle ne peut pas devenir un individu.",
                )
                .with_key("world.speciesHasMembers")
                .with_param("count", members));
            }
        }

        sqlx::query(
            "UPDATE species SET name = ?, type = ?, nature = ?, parent_id = ?, status = ?, fields = ?, updated_at = ? \
             WHERE id = ?",
        )
        .bind(&clean.name)
        .bind(&clean.kind)
        .bind(&clean.nature)
        .bind(&clean.parent_id)
        .bind(&clean.status)
        .bind(serde_json::to_string(&clean.fields)?)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(&format!(
            "UPDATE {} SET name = ?, type = ?, parent_id = ?, status = ?, fields = ?, updated_at = ? WHERE id = ?",
            module.table()
        ))
        .bind(&clean.name)
        .bind(&clean.kind)
        .bind(&clean.parent_id)
        .bind(&clean.status)
        .bind(serde_json::to_string(&clean.fields)?)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    }

    get_entry(pool, module, id).await
}

/// Supprime un élément ; il va dans la corbeille avec ses images et ses
/// liens (renvoie l'identifiant de l'entrée). Ce qu'il contenait remonte
/// d'un niveau.
pub async fn delete_entry(pool: &SqlitePool, module: Module, id: &str) -> AppResult<String> {
    let table = module.table();
    let mut tx = pool.begin().await?;

    let row: Option<(Option<String>, String)> =
        sqlx::query_as(&format!("SELECT parent_id, name FROM {table} WHERE id = ?"))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;

    let Some((parent, name)) = row else {
        return Err(not_found());
    };

    let mut snapshot = Snapshot::new();

    let children: Vec<String> = sqlx::query_scalar(&format!("SELECT id FROM {table} WHERE parent_id = ?"))
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
    snapshot.restore_column(table, &children, "parent_id", Some(id.to_owned()), parent.clone());

    sqlx::query(&format!("UPDATE {table} SET parent_id = ?, updated_at = ? WHERE parent_id = ?"))
        .bind(&parent)
        .bind(now_utc())
        .bind(id)
        .execute(&mut *tx)
        .await?;

    // L'élément d'abord : à la restauration, il revient avant ses liens.
    snapshot.capture(&mut tx, table, "id", id).await?;
    world_link_service::detach(&mut tx, &mut snapshot, id).await?;

    sqlx::query(&format!("DELETE FROM {table} WHERE id = ?"))
        .bind(id)
        .execute(&mut *tx)
        .await?;

    let trash_id = snapshot.store(&mut tx, module.kind(), id, &name).await?;
    tx.commit().await?;

    Ok(trash_id)
}

async fn touch(pool: &SqlitePool, module: Module, id: &str) -> AppResult<()> {
    sqlx::query(&format!("UPDATE {} SET updated_at = ? WHERE id = ?", module.table()))
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Animal personnage (faune et flore)
// ----------------------------------------------------------------------------

fn species_only(module: Module) -> AppResult<()> {
    if module == Module::Species {
        Ok(())
    } else {
        Err(AppError::validation("Réservé à la faune et à la flore.").with_key("world.speciesOnly"))
    }
}

/// Fait de cet animal (ou de cette plante) précis un personnage existant,
/// ou retire ce lien (`None` : redevient un animal tout court ; la fiche
/// de personnage n'est pas supprimée).
pub async fn set_character(
    pool: &SqlitePool,
    module: Module,
    id: &str,
    character_id: Option<&str>,
) -> AppResult<WorldEntry> {
    species_only(module)?;
    let entry = get_entry(pool, module, id).await?;

    let character_id = character_id.map(str::trim).filter(|value| !value.is_empty());

    if let Some(character) = character_id {
        if entry.nature.as_deref() != Some("individual") {
            return Err(AppError::validation(
                "Seul un animal ou une plante précis peut être un personnage, pas une espèce entière.",
            )
            .with_key("world.characterNeedsIndividual"));
        }

        if !exists(pool, "SELECT id FROM characters WHERE id = ?", character).await? {
            return Err(AppError::not_found("Personnage introuvable.").with_key("character.notFound"));
        }

        let taken: Option<String> =
            sqlx::query_scalar("SELECT name FROM species WHERE character_id = ? AND id <> ?")
                .bind(character)
                .bind(id)
                .fetch_optional(pool)
                .await?;
        if let Some(other) = taken {
            return Err(AppError::conflict("Ce personnage est déjà associé à un autre animal.")
                .with_key("world.characterTaken")
                .with_param("name", other));
        }
    }

    sqlx::query("UPDATE species SET character_id = ?, updated_at = ? WHERE id = ?")
        .bind(character_id)
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;

    get_entry(pool, module, id).await
}

/// Crée la fiche de personnage d'un animal précis (même nom, même
/// description) et l'y associe.
pub async fn create_character(
    pool: &SqlitePool,
    module: Module,
    id: &str,
) -> AppResult<(WorldEntry, character_service::Character)> {
    species_only(module)?;
    let entry = get_entry(pool, module, id).await?;

    if entry.nature.as_deref() != Some("individual") {
        return Err(AppError::validation(
            "Seul un animal ou une plante précis peut être un personnage, pas une espèce entière.",
        )
        .with_key("world.characterNeedsIndividual"));
    }
    if entry.character_id.is_some() {
        return Err(AppError::conflict("Cet animal a déjà une fiche de personnage.")
            .with_key("world.alreadyCharacter"));
    }

    let mut fields = BTreeMap::new();
    if let Some(description) = entry.fields.get("description") {
        fields.insert("description".to_owned(), description.clone());
    }

    let character = character_service::create_character(
        pool,
        &CharacterInput {
            first_name: entry.name.clone(),
            last_name: String::new(),
            role: "secondary".to_owned(),
            status: if entry.status == "dead" { "dead".to_owned() } else { "alive".to_owned() },
            fields,
        },
    )
    .await?;

    match set_character(pool, module, id, Some(&character.id)).await {
        Ok(entry) => Ok((entry, character)),
        Err(error) => {
            // Le lien a échoué : la fiche créée pour lui n'a pas de raison d'exister.
            let _ = sqlx::query("DELETE FROM characters WHERE id = ?").bind(&character.id).execute(pool).await;
            Err(error)
        }
    }
}

// ----------------------------------------------------------------------------
// Image principale
// ----------------------------------------------------------------------------

pub async fn get_portrait(pool: &SqlitePool, module: Module, id: &str) -> AppResult<Option<Portrait>> {
    let spec = module.spec();
    let row: Option<(String, Vec<u8>, String)> = sqlx::query_as(&format!(
        "SELECT mime, data, updated_at FROM {} WHERE {} = ?",
        spec.portraits, spec.fk
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(mime, data, updated_at)| Portrait { mime, data: BASE64.encode(data), updated_at }))
}

pub async fn set_portrait(pool: &SqlitePool, module: Module, id: &str, data: &str) -> AppResult<WorldEntry> {
    let (bytes, mime) = decode_image(data)?;
    let spec = module.spec();

    if !entry_exists(pool, module, id).await? {
        return Err(not_found());
    }

    sqlx::query(&format!(
        "INSERT INTO {portraits} ({fk}, mime, data, updated_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT ({fk}) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at",
        portraits = spec.portraits,
        fk = spec.fk,
    ))
    .bind(id)
    .bind(mime)
    .bind(&bytes)
    .bind(now_utc())
    .execute(pool)
    .await?;

    touch(pool, module, id).await?;
    get_entry(pool, module, id).await
}

pub async fn remove_portrait(pool: &SqlitePool, module: Module, id: &str) -> AppResult<WorldEntry> {
    let entry = get_entry(pool, module, id).await?;
    if entry.portrait_updated_at.is_none() {
        return Ok(entry);
    }

    let spec = module.spec();
    sqlx::query(&format!("DELETE FROM {} WHERE {} = ?", spec.portraits, spec.fk))
        .bind(id)
        .execute(pool)
        .await?;

    touch(pool, module, id).await?;
    get_entry(pool, module, id).await
}

// ----------------------------------------------------------------------------
// Galerie
// ----------------------------------------------------------------------------

/// Image de la galerie, sans son contenu.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorldImage {
    pub id: String,
    pub caption: Option<String>,
    pub created_at: String,
}

pub async fn list_gallery(pool: &SqlitePool, module: Module, id: &str) -> AppResult<Vec<WorldImage>> {
    if !entry_exists(pool, module, id).await? {
        return Err(not_found());
    }
    let spec = module.spec();

    Ok(sqlx::query_as::<_, WorldImage>(&format!(
        "SELECT id, caption, created_at FROM {} WHERE {} = ? ORDER BY position, created_at",
        spec.images, spec.fk
    ))
    .bind(id)
    .fetch_all(pool)
    .await?)
}

pub async fn get_gallery_image(pool: &SqlitePool, module: Module, image_id: &str) -> AppResult<Portrait> {
    let row: Option<(String, Vec<u8>, String)> = sqlx::query_as(&format!(
        "SELECT mime, data, created_at FROM {} WHERE id = ?",
        module.spec().images
    ))
    .bind(image_id)
    .fetch_optional(pool)
    .await?;

    row.map(|(mime, data, updated_at)| Portrait { mime, data: BASE64.encode(data), updated_at })
        .ok_or_else(image_not_found)
}

fn clean_caption(caption: Option<&str>) -> AppResult<Option<String>> {
    let caption = caption.map(str::trim).filter(|value| !value.is_empty());
    if caption.is_some_and(|value| value.chars().count() > MAX_CAPTION_CHARS) {
        return Err(too_long(MAX_CAPTION_CHARS));
    }
    Ok(caption.map(str::to_owned))
}

pub async fn add_gallery_image(
    pool: &SqlitePool,
    module: Module,
    id: &str,
    data: &str,
    caption: Option<&str>,
) -> AppResult<WorldImage> {
    let (bytes, mime) = decode_image(data)?;
    let caption = clean_caption(caption)?;
    let spec = module.spec();

    if !entry_exists(pool, module, id).await? {
        return Err(not_found());
    }

    let image_id = new_id();
    let now = now_utc();

    // Comptage et ajout dans la même requête : la limite tient même avec
    // deux ajouts simultanés.
    let result = sqlx::query(&format!(
        "INSERT INTO {images} (id, {fk}, mime, data, caption, position, created_at) \
         SELECT ?, ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ? \
         FROM {images} WHERE {fk} = ? HAVING COUNT(*) < ?",
        images = spec.images,
        fk = spec.fk,
    ))
    .bind(&image_id)
    .bind(id)
    .bind(mime)
    .bind(&bytes)
    .bind(&caption)
    .bind(&now)
    .bind(id)
    .bind(MAX_GALLERY_IMAGES)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::validation("La galerie est pleine.")
            .with_key("world.galleryFull")
            .with_param("max", MAX_GALLERY_IMAGES));
    }

    touch(pool, module, id).await?;
    Ok(WorldImage { id: image_id, caption, created_at: now })
}

pub async fn set_gallery_caption(
    pool: &SqlitePool,
    module: Module,
    image_id: &str,
    caption: Option<&str>,
) -> AppResult<()> {
    let caption = clean_caption(caption)?;
    let result = sqlx::query(&format!("UPDATE {} SET caption = ? WHERE id = ?", module.spec().images))
        .bind(&caption)
        .bind(image_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(image_not_found());
    }
    Ok(())
}

pub async fn delete_gallery_image(pool: &SqlitePool, module: Module, image_id: &str) -> AppResult<()> {
    let spec = module.spec();
    let owner: Option<String> =
        sqlx::query_scalar(&format!("SELECT {} FROM {} WHERE id = ?", spec.fk, spec.images))
            .bind(image_id)
            .fetch_optional(pool)
            .await?;

    let Some(owner) = owner else {
        return Err(image_not_found());
    };

    sqlx::query(&format!("DELETE FROM {} WHERE id = ?", spec.images))
        .bind(image_id)
        .execute(pool)
        .await?;

    touch(pool, module, &owner).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::{structure_service, trash_service};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    fn input(name: &str, kind: &str) -> WorldEntryInput {
        WorldEntryInput {
            name: name.to_owned(),
            kind: kind.to_owned(),
            nature: None,
            parent_id: None,
            status: String::new(),
            fields: BTreeMap::new(),
        }
    }

    fn individual(name: &str, kind: &str, parent: Option<&str>) -> WorldEntryInput {
        WorldEntryInput {
            nature: Some("individual".to_owned()),
            parent_id: parent.map(str::to_owned),
            ..input(name, kind)
        }
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 0];

    #[test]
    fn catalogs_are_consistent() {
        for module in Module::ALL {
            let catalog = module.catalog();
            let name = module.kind();

            let mut types = HashSet::new();
            for item in &catalog.types {
                assert!(types.insert(item.id.as_str()), "{name} : type en double {}", item.id);
                assert!(catalog.has_category(&item.category), "{name} : catégorie {}", item.category);
                assert!(!item.id.starts_with(CUSTOM_PREFIX));
            }

            // Chaque catégorie a au moins un type.
            for category in &catalog.categories {
                assert!(catalog.types.iter().any(|t| &t.category == category), "{name} : {category} vide");
            }

            let mut keys = HashSet::new();
            for field in &catalog.fields {
                assert!(keys.insert(field.key.as_str()), "{name} : champ en double {}", field.key);
                assert!(field.max_length > 0);
                for category in &field.categories {
                    assert!(catalog.has_category(category), "{} : catégorie {category}", field.key);
                }
                for kind in &field.types {
                    assert!(types.contains(kind.as_str()), "{} : type {kind}", field.key);
                }
                for nature in &field.natures {
                    assert!(catalog.nature(nature).is_some(), "{} : nature {nature}", field.key);
                }
                assert_eq!(field.kind == FieldKind::Choice, !field.options.is_empty(), "{}", field.key);
            }

            assert!(catalog.statuses.contains(&catalog.default_status), "{name} : statut par défaut");
            for nature in &catalog.natures {
                assert!(catalog.statuses.contains(&nature.default_status), "{name} : {}", nature.id);
            }
        }

        assert!(Module::Species.has_nature());
        assert!(!Module::Item.has_nature());
    }

    #[tokio::test]
    async fn modules_are_disabled_until_enabled_with_all_categories() {
        let pool = pool().await;

        for module in Module::ALL {
            let settings = get_settings(&pool, module).await.unwrap();
            assert!(!settings.enabled);
            assert!(settings.categories.is_empty());

            let settings = set_enabled(&pool, module, true).await.unwrap();
            assert!(settings.enabled);
            assert_eq!(settings.categories, module.catalog().categories);

            // Choix gardé ; ordre du catalogue ; au moins une catégorie.
            let last = module.catalog().categories.last().unwrap().clone();
            let first = module.catalog().categories[0].clone();
            let settings = set_categories(&pool, module, &[last.clone(), first.clone()]).await.unwrap();
            assert_eq!(settings.categories, [first, last.clone()]);
            assert!(set_categories(&pool, module, &[]).await.is_err());
            assert!(set_categories(&pool, module, &["inconnue".to_owned()]).await.is_err());

            // Désactivé puis réactivé : le choix des catégories reste.
            assert!(!set_enabled(&pool, module, false).await.unwrap().enabled);
            let settings = set_enabled(&pool, module, true).await.unwrap();
            assert_eq!(settings.categories.len(), 2);

            let settings = set_detail_level(&pool, module, "basic").await.unwrap();
            assert_eq!(settings.detail_level, Some(DetailLevel::Basic));
            assert!(settings.enabled);
        }
    }

    #[tokio::test]
    async fn items_are_created_updated_and_deleted() {
        let pool = pool().await;
        let m = Module::Item;

        let car = create_entry(&pool, m, &input("  La Coccinelle ", "car")).await.unwrap();
        assert_eq!(car.name, "La Coccinelle");
        assert_eq!(car.status, "intact");
        assert_eq!(car.nature, None);
        assert_eq!(car.character_id, None);

        let mut changed = input("La Coccinelle", "car");
        changed.status = "stolen".to_owned();
        changed.fields.insert("speed".to_owned(), "120 km/h".to_owned());
        changed.fields.insert("rarity".to_owned(), "unique".to_owned());
        changed.fields.insert("registration".to_owned(), " 53-KZ-31 ".to_owned());
        let saved = update_entry(&pool, m, &car.id, &changed).await.unwrap();
        assert_eq!(saved.status, "stolen");
        assert_eq!(saved.fields["registration"], "53-KZ-31");

        // Champ inconnu, valeur hors liste, type inconnu, nom vide : refusés.
        let mut bad = input("X", "car");
        bad.fields.insert("inconnu".to_owned(), "x".to_owned());
        assert!(create_entry(&pool, m, &bad).await.is_err());
        let mut bad = input("X", "car");
        bad.fields.insert("rarity".to_owned(), "banale".to_owned());
        assert!(create_entry(&pool, m, &bad).await.is_err());
        assert!(create_entry(&pool, m, &input("X", "licorne")).await.is_err());
        assert!(create_entry(&pool, m, &input("  ", "car")).await.is_err());

        // Un coffre contient une clé ; pas de boucle ; le coffre supprimé,
        // la clé remonte, puis revient avec la corbeille.
        let chest = create_entry(&pool, m, &input("Coffre", "container")).await.unwrap();
        let key = create_entry(&pool, m, &WorldEntryInput { parent_id: Some(chest.id.clone()), ..input("Clé", "key") })
            .await
            .unwrap();
        assert!(update_entry(&pool, m, &chest.id, &WorldEntryInput { parent_id: Some(key.id.clone()), ..input("Coffre", "container") })
            .await
            .is_err());

        let trash = delete_entry(&pool, m, &chest.id).await.unwrap();
        assert_eq!(get_entry(&pool, m, &key.id).await.unwrap().parent_id, None);
        trash_service::restore(&pool, &trash).await.unwrap();
        assert_eq!(get_entry(&pool, m, &key.id).await.unwrap().parent_id.as_deref(), Some(chest.id.as_str()));

        let names: Vec<String> = list_entries(&pool, m).await.unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Clé", "Coffre", "La Coccinelle"]);
    }

    #[tokio::test]
    async fn species_natures_and_hierarchy() {
        let pool = pool().await;
        let m = Module::Species;

        let horse = create_entry(&pool, m, &input("Cheval des steppes", "mammal")).await.unwrap();
        assert_eq!(horse.nature.as_deref(), Some("species"));
        assert_eq!(horse.status, "common");

        let eclair = create_entry(&pool, m, &individual("Éclair", "mammal", Some(&horse.id))).await.unwrap();
        assert_eq!(eclair.nature.as_deref(), Some("individual"));
        assert_eq!(eclair.status, "alive");
        assert_eq!(eclair.parent_id.as_deref(), Some(horse.id.as_str()));

        // Un individu ne regroupe rien ; une espèce avec des membres ne
        // devient pas un individu ; nature inconnue refusée.
        assert!(create_entry(&pool, m, &individual("Poulain", "mammal", Some(&eclair.id))).await.is_err());
        assert!(update_entry(&pool, m, &horse.id, &individual("Cheval des steppes", "mammal", None)).await.is_err());
        let mut bad = input("X", "mammal");
        bad.nature = Some("robot".to_owned());
        assert!(create_entry(&pool, m, &bad).await.is_err());

        let rose = create_entry(&pool, m, &input("Rose de lune", "magicPlant")).await.unwrap();
        let mut update = input("Rose de lune", "magicPlant");
        update.fields.insert("toxicity".to_owned(), "deadly".to_owned());
        update.fields.insert("uses".to_owned(), r#"["poison"," Poison ","remède"]"#.to_owned());
        let rose = update_entry(&pool, m, &rose.id, &update).await.unwrap();
        assert_eq!(rose.fields["uses"], r#"["poison","remède"]"#);
    }

    #[tokio::test]
    async fn an_animal_can_be_a_character() {
        let pool = pool().await;
        let m = Module::Species;

        let wolves = create_entry(&pool, m, &input("Loups gris", "mammal")).await.unwrap();
        let mut croc = individual("Croc-Blanc", "mammal", Some(&wolves.id));
        croc.fields.insert("description".to_owned(), "Un loup à demi chien.".to_owned());
        let croc = create_entry(&pool, m, &croc).await.unwrap();

        // Une espèce entière ne peut pas être un personnage.
        assert!(create_character(&pool, m, &wolves.id).await.is_err());
        // Les objets ne sont pas concernés.
        assert!(set_character(&pool, Module::Item, &croc.id, None).await.is_err());

        let (linked, character) = create_character(&pool, m, &croc.id).await.unwrap();
        assert_eq!(linked.character_id.as_deref(), Some(character.id.as_str()));
        assert_eq!(character.first_name, "Croc-Blanc");
        assert_eq!(character.fields["description"], "Un loup à demi chien.");
        assert!(create_character(&pool, m, &croc.id).await.is_err());

        // Le même personnage ne peut pas être deux animaux.
        let other = create_entry(&pool, m, &individual("Kiche", "mammal", None)).await.unwrap();
        assert!(set_character(&pool, m, &other.id, Some(&character.id)).await.is_err());

        // Lié : ne peut pas redevenir une espèce.
        assert!(update_entry(&pool, m, &croc.id, &input("Croc-Blanc", "mammal")).await.is_err());

        // Personnage supprimé : redevient un animal tout court ; la
        // corbeille rétablit le lien.
        let trash = character_service::delete_character(&pool, &character.id).await.unwrap();
        assert_eq!(get_entry(&pool, m, &croc.id).await.unwrap().character_id, None);
        trash_service::restore(&pool, &trash).await.unwrap();
        assert_eq!(get_entry(&pool, m, &croc.id).await.unwrap().character_id.as_deref(), Some(character.id.as_str()));

        // Lien retiré : la fiche de personnage reste.
        assert_eq!(set_character(&pool, m, &croc.id, None).await.unwrap().character_id, None);
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM characters").fetch_one(&pool).await.unwrap();
        assert_eq!(left, 1);
        // Puis associé à nouveau à un personnage existant.
        assert!(set_character(&pool, m, &croc.id, Some(&character.id)).await.unwrap().character_id.is_some());
    }

    #[tokio::test]
    async fn custom_types_lists_and_references() {
        let pool = pool().await;
        let m = Module::Item;

        let settings = set_custom_types(
            &pool,
            m,
            &[CustomTypeInput { id: None, name: " Hoverboard ".to_owned(), category: "vehicle".to_owned() }],
        )
        .await
        .unwrap();
        let board = settings.custom_types[0].clone();
        assert!(board.id.starts_with(CUSTOM_PREFIX));

        create_entry(&pool, m, &input("Planche de Marty", &board.id)).await.unwrap();
        assert!(set_custom_types(&pool, m, &[]).await.is_err());
        assert!(set_custom_types(
            &pool,
            m,
            &[CustomTypeInput { id: None, name: "X".to_owned(), category: "flora".to_owned() }]
        )
        .await
        .is_err());

        let settings = set_list(&pool, m, "status", Some(&["Neuf".to_owned(), " Rouillé ".to_owned()])).await.unwrap();
        assert_eq!(settings.lists["status"], ["Neuf", "Rouillé"]);
        assert!(set_list(&pool, m, "genre", None).await.is_err());

        let node = structure_service::create_node(&pool, crate::models::project::ProjectType::Novel, None, 0, "Chapitre 1", None)
            .await
            .unwrap();
        let mut sword = input("Excalibur", "sword");
        sword.fields.insert("firstAppearance".to_owned(), node.id.clone());
        let saved = create_entry(&pool, m, &sword).await.unwrap();
        assert_eq!(saved.fields["firstAppearance"], node.id);
        sword.fields.insert("firstAppearance".to_owned(), "absent".to_owned());
        let saved = update_entry(&pool, m, &saved.id, &sword).await.unwrap();
        assert!(!saved.fields.contains_key("firstAppearance"));
    }

    #[tokio::test]
    async fn portrait_and_gallery() {
        let pool = pool().await;

        for module in Module::ALL {
            let kind = if module == Module::Item { "phone" } else { "tree" };
            let entry = create_entry(&pool, module, &input("Élément", kind)).await.unwrap();
            let png = BASE64.encode(PNG);

            assert!(set_portrait(&pool, module, &entry.id, &png).await.unwrap().portrait_updated_at.is_some());
            assert_eq!(get_portrait(&pool, module, &entry.id).await.unwrap().unwrap().mime, "image/png");
            assert!(remove_portrait(&pool, module, &entry.id).await.unwrap().portrait_updated_at.is_none());

            let image = add_gallery_image(&pool, module, &entry.id, &png, Some(" Vue ")).await.unwrap();
            assert_eq!(image.caption.as_deref(), Some("Vue"));
            set_gallery_caption(&pool, module, &image.id, Some("Plan")).await.unwrap();
            assert_eq!(list_gallery(&pool, module, &entry.id).await.unwrap()[0].caption.as_deref(), Some("Plan"));
            assert_eq!(get_entry(&pool, module, &entry.id).await.unwrap().gallery_count, 1);

            for _ in 1..MAX_GALLERY_IMAGES {
                add_gallery_image(&pool, module, &entry.id, &png, None).await.unwrap();
            }
            assert!(add_gallery_image(&pool, module, &entry.id, &png, None).await.is_err());

            delete_gallery_image(&pool, module, &image.id).await.unwrap();
            assert!(get_gallery_image(&pool, module, &image.id).await.is_err());

            // Supprimé : les images partent avec lui, et reviennent avec la corbeille.
            let trash = delete_entry(&pool, module, &entry.id).await.unwrap();
            let left: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", module.spec().images))
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(left, 0);
            trash_service::restore(&pool, &trash).await.unwrap();
            assert_eq!(get_entry(&pool, module, &entry.id).await.unwrap().gallery_count, MAX_GALLERY_IMAGES - 1);
        }
    }

    #[tokio::test]
    async fn color_palette_frames_the_image() {
        let pool = pool().await;

        for module in Module::ALL {
            let kind = if module == Module::Item { "hat" } else { "flower" };
            let mut entry = input("Avec palette", kind);
            entry.fields.insert("colorPalette".to_owned(), r##"[" #AA3366 ","#00ff00"]"##.to_owned());
            let saved = create_entry(&pool, module, &entry).await.unwrap();
            assert_eq!(saved.fields["colorPalette"], r##"["#aa3366","#00ff00"]"##);

            entry.fields.insert("colorPalette".to_owned(), r#"["rouge"]"#.to_owned());
            assert!(create_entry(&pool, module, &entry).await.is_err());

            entry.fields.insert("colorPalette".to_owned(), "[]".to_owned());
            assert!(!create_entry(&pool, module, &entry).await.unwrap().fields.contains_key("colorPalette"));
        }
    }
}
