//! Lieux d'un projet (base du projet).
//!
//! # Catégories, types et champs
//!
//! Un lieu a un **type** (Ville, Royaume, Forêt…), rangé dans une des six
//! **catégories** (agglomérations, territoires politiques, régions
//! géographiques, lieux construits, espaces naturels, lieux particuliers).
//! L'auteur peut ajouter ses propres types, chacun dans une catégorie
//! (`location_settings.custom_types`).
//!
//! La fiche empile trois couches de champs :
//! - les champs **communs** à tous les lieux ;
//! - ceux de la **catégorie** du type ;
//! - ceux propres au **type**.
//!
//! Tous sont enregistrés dans le JSON `fields`. Changer de type n'efface
//! rien : les champs qui ne s'appliquent plus sont gardés, simplement
//! masqués par l'interface.
//!
//! Le catalogue (catégories, types, statuts, champs) est un seul fichier,
//! `src/lib/locationCatalog.json`, lu à la fois par l'interface et par Rust
//! (inclus à la compilation) : les deux ne peuvent pas diverger.
//!
//! # Hiérarchie
//!
//! `parent_id` : le lieu qui contient celui-ci (un château dans un royaume,
//! une grotte dans une montagne). Aucun ordre n'est imposé entre les types,
//! mais un lieu ne peut pas se contenir lui-même, même indirectement.
//! Supprimer un lieu fait remonter ses lieux contenus d'un niveau.

use crate::error::{AppError, AppResult};
use crate::services::character_service::{decode_image, Portrait};
use crate::utils::{new_id, now_utc};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{BTreeMap, HashSet};
use std::sync::OnceLock;

/// Longueur maximale du nom d'un lieu.
const MAX_NAME_CHARS: usize = 200;

/// Longueur maximale d'une valeur de liste (statut) ou d'un nom de type.
const MAX_CHOICE_CHARS: usize = 60;

/// Nombre maximal de valeurs dans une liste personnalisée.
const MAX_LIST_VALUES: usize = 50;

/// Nombre maximal de types ajoutés par l'auteur.
const MAX_CUSTOM_TYPES: usize = 50;

/// Nombre maximal d'images dans la galerie d'un lieu.
pub const MAX_GALLERY_IMAGES: i64 = 30;

/// Longueur maximale d'une légende d'image.
const MAX_CAPTION_CHARS: usize = 200;

const MAX_TAGS: usize = 30;
const MAX_TAG_CHARS: usize = 50;

/// Profondeur maximale parcourue en remontant les parents (garde-fou si la
/// base contenait déjà une boucle).
const MAX_DEPTH: usize = 1_000;

/// Préfixe des identifiants de types ajoutés par l'auteur.
const CUSTOM_PREFIX: &str = "custom-";

/// Listes personnalisables.
pub const LISTS: [&str; 1] = ["status"];

/// Statut par défaut d'un nouveau lieu.
const DEFAULT_STATUS: &str = "existing";

// ----------------------------------------------------------------------------
// Catalogue
// ----------------------------------------------------------------------------

/// Nature d'un champ (et donc sa validation).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    /// Une ligne.
    Text,
    /// Texte long.
    LongText,
    /// Étiquettes : tableau JSON de textes.
    Tags,
    /// Une valeur parmi `options` (codes traduits par l'interface).
    Choice,
    /// Élément du découpage du récit (identifiant).
    Reference,
    /// Autre lieu du projet (identifiant).
    Location,
    /// Personnage du projet (identifiant).
    Character,
}

#[derive(Debug, Deserialize)]
pub struct TypeDef {
    pub id: String,
    pub category: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDef {
    pub key: String,
    pub kind: FieldKind,
    pub max_length: usize,
    /// Catégories qui proposent ce champ (vide avec `types` vide : commun).
    /// Sert à l'interface (affichage) ; vérifié par `catalog_is_consistent`.
    #[serde(default)]
    #[cfg_attr(not(test), allow(dead_code))]
    pub categories: Vec<String>,
    /// Types qui proposent ce champ (affichage, comme `categories`).
    #[serde(default)]
    #[cfg_attr(not(test), allow(dead_code))]
    pub types: Vec<String>,
    /// Valeurs possibles d'un champ « choice ».
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct Catalog {
    pub categories: Vec<String>,
    /// Statuts par défaut (affichage) ; vérifié par `catalog_is_consistent`.
    #[cfg_attr(not(test), allow(dead_code))]
    pub statuses: Vec<String>,
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
}

/// Clés des champs de lieu qui désignent un personnage (« Dirigeant »…).
pub fn character_field_keys() -> impl Iterator<Item = &'static str> {
    catalog()
        .fields
        .iter()
        .filter(|field| field.kind == FieldKind::Character)
        .map(|field| field.key.as_str())
}

/// Catalogue partagé avec l'interface, lu une fois.
pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();

    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/lib/locationCatalog.json"))
            .expect("src/lib/locationCatalog.json invalide (voir le test catalog_is_consistent)")
    })
}

// ----------------------------------------------------------------------------
// Types échangés avec l'interface
// ----------------------------------------------------------------------------

/// Lieu, tel qu'envoyé à l'interface (sans les images elles-mêmes).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub parent_id: Option<String>,
    pub status: String,
    /// Champs remplis (les champs vides ne sont pas stockés).
    pub fields: BTreeMap<String, String>,
    /// Date de l'image principale (`None` : pas d'image).
    pub portrait_updated_at: Option<String>,
    /// Nombre d'images de la galerie.
    pub gallery_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Contenu d'une fiche (création ou modification).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationInput {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
}

/// Type ajouté par l'auteur.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CustomType {
    pub id: String,
    pub name: String,
    pub category: String,
}

/// Type ajouté ou modifié depuis les paramètres (`id` absent : nouveau).
#[derive(Debug, Clone, Deserialize)]
pub struct CustomTypeInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub category: String,
}

/// Réglages des lieux du projet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationSettings {
    pub custom_types: Vec<CustomType>,
    /// Listes personnalisées. Une liste absente : valeurs par défaut.
    pub lists: BTreeMap<String, Vec<String>>,
}

#[derive(sqlx::FromRow)]
struct LocationRow {
    id: String,
    name: String,
    #[sqlx(rename = "type")]
    kind: String,
    parent_id: Option<String>,
    status: String,
    fields: String,
    portrait_updated_at: Option<String>,
    gallery_count: i64,
    created_at: String,
    updated_at: String,
}

impl LocationRow {
    fn into_location(self) -> Location {
        Location {
            id: self.id,
            name: self.name,
            kind: self.kind,
            parent_id: self.parent_id,
            status: self.status,
            // Valeur illisible : la fiche s'affiche quand même.
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
    AppError::not_found("Lieu introuvable.").with_key("location.notFound")
}

fn image_not_found() -> AppError {
    AppError::not_found("Image introuvable.").with_key("location.imageNotFound")
}

fn too_long(max: usize) -> AppError {
    AppError::validation(format!("Un champ dépasse {max} caractères."))
        .with_key("location.fieldTooLong")
        .with_param("max", max)
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

struct CleanInput {
    name: String,
    kind: String,
    parent_id: Option<String>,
    status: String,
    fields: BTreeMap<String, String>,
}

async fn exists(pool: &SqlitePool, sql: &str, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar(sql).bind(id).fetch_optional(pool).await?;
    Ok(found.is_some())
}

async fn location_exists(pool: &SqlitePool, id: &str) -> AppResult<bool> {
    exists(pool, "SELECT id FROM locations WHERE id = ?", id).await
}

/// Vrai si `ancestor` est `id` lui-même ou un de ses parents.
async fn is_ancestor_or_self(pool: &SqlitePool, ancestor: &str, id: &str) -> AppResult<bool> {
    let mut current = Some(id.to_owned());

    for _ in 0..MAX_DEPTH {
        let Some(node) = current else {
            return Ok(false);
        };

        if node == ancestor {
            return Ok(true);
        }

        current = sqlx::query_scalar::<_, Option<String>>("SELECT parent_id FROM locations WHERE id = ?")
            .bind(&node)
            .fetch_optional(pool)
            .await?
            .flatten();
    }

    // Chaîne anormalement longue : refusée par prudence.
    Ok(true)
}

/// Catégorie d'un type, par défaut ou ajouté par l'auteur.
fn category_of<'a>(kind: &str, settings: &'a LocationSettings) -> Option<&'a str> {
    if let Some(def) = catalog().builtin_type(kind) {
        return Some(def.category.as_str());
    }

    settings
        .custom_types
        .iter()
        .find(|item| item.id == kind)
        .map(|item| item.category.as_str())
}

/// Vérifie et nettoie une valeur de champ (`None` : champ vide ou référence
/// vers un élément qui n'existe plus, simplement retiré).
async fn clean_value(
    pool: &SqlitePool,
    def: &FieldDef,
    raw: &str,
    self_id: Option<&str>,
) -> AppResult<Option<String>> {
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
                AppError::validation("Liste d'étiquettes illisible.").with_key("location.invalidValue")
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
                    .with_key("location.tooManyTags")
                    .with_param("max", MAX_TAGS));
            }

            Ok((!cleaned.is_empty()).then(|| serde_json::to_string(&cleaned)).transpose()?)
        }
        FieldKind::Choice => {
            if def.options.iter().any(|option| option == value) {
                Ok(Some(value.to_owned()))
            } else {
                Err(AppError::validation("Valeur inconnue.").with_key("location.invalidValue"))
            }
        }
        FieldKind::Reference => {
            let found = exists(pool, "SELECT id FROM structure_nodes WHERE id = ?", value).await?;
            Ok(found.then(|| value.to_owned()))
        }
        FieldKind::Location => {
            if Some(value) == self_id {
                return Ok(None);
            }
            Ok(location_exists(pool, value).await?.then(|| value.to_owned()))
        }
        FieldKind::Character => {
            let found = exists(pool, "SELECT id FROM characters WHERE id = ?", value).await?;
            Ok(found.then(|| value.to_owned()))
        }
    }
}

/// Vérifie une fiche. `self_id` : lieu modifié (`None` à la création).
async fn clean_input(
    pool: &SqlitePool,
    input: &LocationInput,
    self_id: Option<&str>,
) -> AppResult<CleanInput> {
    let name = input.name.trim();

    if name.is_empty() {
        return Err(AppError::validation("Le nom du lieu est requis.").with_key("location.nameRequired"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation("Le nom du lieu est trop long.")
            .with_key("location.nameTooLong")
            .with_param("max", MAX_NAME_CHARS));
    }

    let settings = get_settings(pool).await?;

    if category_of(&input.kind, &settings).is_none() {
        return Err(AppError::validation("Type de lieu inconnu.").with_key("location.invalidType"));
    }

    let status = match input.status.trim() {
        "" => DEFAULT_STATUS,
        value => value,
    };

    if status.chars().count() > MAX_CHOICE_CHARS {
        return Err(too_long(MAX_CHOICE_CHARS));
    }

    let parent_id = match input.parent_id.as_deref().map(str::trim).filter(|id| !id.is_empty()) {
        None => None,
        Some(parent) => {
            if !location_exists(pool, parent).await? {
                return Err(AppError::not_found("Le lieu parent est introuvable.")
                    .with_key("location.parentNotFound"));
            }

            if let Some(id) = self_id {
                if is_ancestor_or_self(pool, id, parent).await? {
                    return Err(AppError::validation(
                        "Un lieu ne peut pas être placé dans lui-même ni dans un lieu qu'il contient.",
                    )
                    .with_key("location.parentCycle"));
                }
            }

            Some(parent.to_owned())
        }
    };

    let mut fields = BTreeMap::new();

    for (key, raw) in &input.fields {
        let def = catalog().field(key).ok_or_else(|| {
            AppError::validation(format!("Champ de fiche inconnu : {key}."))
                .with_key("location.unknownField")
        })?;

        if let Some(value) = clean_value(pool, def, raw, self_id).await? {
            fields.insert(def.key.clone(), value);
        }
    }

    Ok(CleanInput {
        name: name.to_owned(),
        kind: input.kind.clone(),
        parent_id,
        status: status.to_owned(),
        fields,
    })
}

// ----------------------------------------------------------------------------
// Réglages
// ----------------------------------------------------------------------------

/// Réglages des lieux du projet.
pub async fn get_settings(pool: &SqlitePool) -> AppResult<LocationSettings> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT custom_types, lists FROM location_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?;

    let (custom_types, lists) = row.unwrap_or_else(|| ("[]".to_owned(), "{}".to_owned()));

    Ok(LocationSettings {
        custom_types: serde_json::from_str(&custom_types).unwrap_or_default(),
        lists: serde_json::from_str(&lists).unwrap_or_default(),
    })
}

async fn save_settings(pool: &SqlitePool, settings: &LocationSettings) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO location_settings (id, custom_types, lists, updated_at) VALUES ('default', ?, ?, ?) \
         ON CONFLICT (id) DO UPDATE SET custom_types = excluded.custom_types, \
         lists = excluded.lists, updated_at = excluded.updated_at",
    )
    .bind(serde_json::to_string(&settings.custom_types)?)
    .bind(serde_json::to_string(&settings.lists)?)
    .bind(now_utc())
    .execute(pool)
    .await?;

    Ok(())
}

/// Remplace les types ajoutés par l'auteur.
///
/// Un type encore utilisé par un lieu ne peut pas être retiré (ses lieux
/// perdraient leur catégorie) : il faut d'abord changer leur type.
pub async fn set_custom_types(
    pool: &SqlitePool,
    inputs: &[CustomTypeInput],
) -> AppResult<LocationSettings> {
    let mut settings = get_settings(pool).await?;
    let known: HashSet<&str> = settings.custom_types.iter().map(|item| item.id.as_str()).collect();

    if inputs.len() > MAX_CUSTOM_TYPES {
        return Err(AppError::validation("Trop de types personnalisés.")
            .with_key("location.tooManyTypes")
            .with_param("max", MAX_CUSTOM_TYPES));
    }

    let mut cleaned: Vec<CustomType> = Vec::with_capacity(inputs.len());

    for input in inputs {
        let name = input.name.trim();

        if name.is_empty() {
            return Err(AppError::validation("Le nom du type est requis.")
                .with_key("location.typeNameRequired"));
        }
        if name.chars().count() > MAX_CHOICE_CHARS {
            return Err(too_long(MAX_CHOICE_CHARS));
        }
        if !catalog().has_category(&input.category) {
            return Err(AppError::validation("Catégorie inconnue.").with_key("location.invalidCategory"));
        }
        if cleaned.iter().any(|item| item.name.to_lowercase() == name.to_lowercase()) {
            return Err(AppError::validation("Deux types portent le même nom.")
                .with_key("location.typeDuplicate")
                .with_param("name", name.to_owned()));
        }

        // Un identifiant inconnu (inventé par l'interface) est remplacé.
        let id = match input.id.as_deref() {
            Some(id) if known.contains(id) => id.to_owned(),
            _ => format!("{CUSTOM_PREFIX}{}", new_id()),
        };

        cleaned.push(CustomType {
            id,
            name: name.to_owned(),
            category: input.category.clone(),
        });
    }

    for removed in settings
        .custom_types
        .iter()
        .filter(|old| !cleaned.iter().any(|item| item.id == old.id))
    {
        let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations WHERE type = ?")
            .bind(&removed.id)
            .fetch_one(pool)
            .await?;

        if used > 0 {
            return Err(AppError::validation("Ce type est encore utilisé par des lieux.")
                .with_key("location.typeInUse")
                .with_param("name", removed.name.clone())
                .with_param("count", used));
        }
    }

    settings.custom_types = cleaned;
    save_settings(pool, &settings).await?;

    Ok(settings)
}

/// Remplace une liste personnalisable. `None` : retour aux valeurs par défaut.
pub async fn set_list(
    pool: &SqlitePool,
    list: &str,
    values: Option<&[String]>,
) -> AppResult<LocationSettings> {
    if !LISTS.contains(&list) {
        return Err(AppError::validation("Liste inconnue.").with_key("location.invalidList"));
    }

    let mut settings = get_settings(pool).await?;

    match values {
        None => {
            settings.lists.remove(list);
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
                    .with_key("location.listTooLong")
                    .with_param("max", MAX_LIST_VALUES));
            }

            settings.lists.insert(list.to_owned(), cleaned);
        }
    }

    save_settings(pool, &settings).await?;

    Ok(settings)
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

const SELECT_LOCATION: &str = r#"
    SELECT l.id, l.name, l.type, l.parent_id, l.status, l.fields,
           p.updated_at AS portrait_updated_at,
           (SELECT COUNT(*) FROM location_images i WHERE i.location_id = l.id) AS gallery_count,
           l.created_at, l.updated_at
    FROM locations l
    LEFT JOIN location_portraits p ON p.location_id = l.id
"#;

/// Tous les lieux du projet, par nom.
pub async fn list_locations(pool: &SqlitePool) -> AppResult<Vec<Location>> {
    let sql = format!("{SELECT_LOCATION} ORDER BY l.name COLLATE NOCASE, l.created_at");

    Ok(sqlx::query_as::<_, LocationRow>(&sql)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(LocationRow::into_location)
        .collect())
}

/// Un lieu.
pub async fn get_location(pool: &SqlitePool, id: &str) -> AppResult<Location> {
    let sql = format!("{SELECT_LOCATION} WHERE l.id = ?");

    sqlx::query_as::<_, LocationRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(LocationRow::into_location)
        .ok_or_else(not_found)
}

// ----------------------------------------------------------------------------
// Écriture
// ----------------------------------------------------------------------------

/// Crée un lieu.
pub async fn create_location(pool: &SqlitePool, input: &LocationInput) -> AppResult<Location> {
    let clean = clean_input(pool, input, None).await?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO locations (id, name, type, parent_id, status, fields, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
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

    get_location(pool, &id).await
}

/// Remplace la fiche d'un lieu.
pub async fn update_location(
    pool: &SqlitePool,
    id: &str,
    input: &LocationInput,
) -> AppResult<Location> {
    if !location_exists(pool, id).await? {
        return Err(not_found());
    }

    let clean = clean_input(pool, input, Some(id)).await?;

    sqlx::query(
        r#"
        UPDATE locations
        SET name = ?, type = ?, parent_id = ?, status = ?, fields = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&clean.name)
    .bind(&clean.kind)
    .bind(&clean.parent_id)
    .bind(&clean.status)
    .bind(serde_json::to_string(&clean.fields)?)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;

    get_location(pool, id).await
}

/// Supprime un lieu. Ses lieux contenus remontent d'un niveau (ils sont
/// rattachés au parent du lieu supprimé).
pub async fn delete_location(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let parent: Option<Option<String>> =
        sqlx::query_scalar("SELECT parent_id FROM locations WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;

    let Some(parent) = parent else {
        return Err(not_found());
    };

    sqlx::query("UPDATE locations SET parent_id = ?, updated_at = ? WHERE parent_id = ?")
        .bind(&parent)
        .bind(now_utc())
        .bind(id)
        .execute(&mut *tx)
        .await?;

    // « Origine » des personnages : le lieu disparaît, son nom reste (texte).
    let name: String = sqlx::query_scalar("SELECT name FROM locations WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    for key in crate::services::character_service::place_field_keys() {
        let path = format!("$.{key}");

        sqlx::query("UPDATE characters SET fields = json_set(fields, ?, ?) WHERE json_extract(fields, ?) = ?")
            .bind(&path)
            .bind(&name)
            .bind(&path)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query("DELETE FROM locations WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

async fn touch(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("UPDATE locations SET updated_at = ? WHERE id = ?")
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Image principale
// ----------------------------------------------------------------------------

/// Image principale d'un lieu (`None` : il n'en a pas).
pub async fn get_portrait(pool: &SqlitePool, id: &str) -> AppResult<Option<Portrait>> {
    let row: Option<(String, Vec<u8>, String)> = sqlx::query_as(
        "SELECT mime, data, updated_at FROM location_portraits WHERE location_id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(mime, data, updated_at)| Portrait {
        mime,
        data: BASE64.encode(data),
        updated_at,
    }))
}

/// Remplace l'image principale. `data` : image encodée en base64.
pub async fn set_portrait(pool: &SqlitePool, id: &str, data: &str) -> AppResult<Location> {
    let (bytes, mime) = decode_image(data)?;

    if !location_exists(pool, id).await? {
        return Err(not_found());
    }

    sqlx::query(
        r#"
        INSERT INTO location_portraits (location_id, mime, data, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (location_id) DO UPDATE
        SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at
        "#,
    )
    .bind(id)
    .bind(mime)
    .bind(&bytes)
    .bind(now_utc())
    .execute(pool)
    .await?;

    touch(pool, id).await?;
    get_location(pool, id).await
}

/// Retire l'image principale.
pub async fn remove_portrait(pool: &SqlitePool, id: &str) -> AppResult<Location> {
    let location = get_location(pool, id).await?;

    if location.portrait_updated_at.is_none() {
        return Ok(location);
    }

    sqlx::query("DELETE FROM location_portraits WHERE location_id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    touch(pool, id).await?;
    get_location(pool, id).await
}

// ----------------------------------------------------------------------------
// Galerie (cartes, plans, références)
// ----------------------------------------------------------------------------

/// Image de la galerie d'un lieu, sans son contenu.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LocationImage {
    pub id: String,
    pub caption: Option<String>,
    pub created_at: String,
}

/// Images de la galerie d'un lieu (sans leur contenu), dans l'ordre.
pub async fn list_gallery(pool: &SqlitePool, location_id: &str) -> AppResult<Vec<LocationImage>> {
    if !location_exists(pool, location_id).await? {
        return Err(not_found());
    }

    Ok(sqlx::query_as::<_, LocationImage>(
        "SELECT id, caption, created_at FROM location_images \
         WHERE location_id = ? ORDER BY position, created_at",
    )
    .bind(location_id)
    .fetch_all(pool)
    .await?)
}

/// Contenu d'une image de la galerie.
pub async fn get_gallery_image(pool: &SqlitePool, image_id: &str) -> AppResult<Portrait> {
    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT mime, data, created_at FROM location_images WHERE id = ?")
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

/// Ajoute une image à la fin de la galerie.
pub async fn add_gallery_image(
    pool: &SqlitePool,
    location_id: &str,
    data: &str,
    caption: Option<&str>,
) -> AppResult<LocationImage> {
    let (bytes, mime) = decode_image(data)?;
    let caption = clean_caption(caption)?;

    if !location_exists(pool, location_id).await? {
        return Err(not_found());
    }

    let id = new_id();
    let now = now_utc();

    // Comptage et ajout dans la même requête : la limite ne peut pas être
    // dépassée par deux ajouts simultanés.
    let result = sqlx::query(
        r#"
        INSERT INTO location_images (id, location_id, mime, data, caption, position, created_at)
        SELECT ?, ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?
        FROM location_images WHERE location_id = ?
        HAVING COUNT(*) < ?
        "#,
    )
    .bind(&id)
    .bind(location_id)
    .bind(mime)
    .bind(&bytes)
    .bind(&caption)
    .bind(&now)
    .bind(location_id)
    .bind(MAX_GALLERY_IMAGES)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::validation("La galerie est pleine.")
            .with_key("location.galleryFull")
            .with_param("max", MAX_GALLERY_IMAGES));
    }

    touch(pool, location_id).await?;

    Ok(LocationImage { id, caption, created_at: now })
}

/// Change la légende d'une image.
pub async fn set_gallery_caption(
    pool: &SqlitePool,
    image_id: &str,
    caption: Option<&str>,
) -> AppResult<()> {
    let caption = clean_caption(caption)?;

    let result = sqlx::query("UPDATE location_images SET caption = ? WHERE id = ?")
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
    let location_id: Option<String> =
        sqlx::query_scalar("SELECT location_id FROM location_images WHERE id = ?")
            .bind(image_id)
            .fetch_optional(pool)
            .await?;

    let Some(location_id) = location_id else {
        return Err(image_not_found());
    };

    sqlx::query("DELETE FROM location_images WHERE id = ?")
        .bind(image_id)
        .execute(pool)
        .await?;

    touch(pool, &location_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use crate::services::{character_service, structure_service};
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

    fn input(name: &str, kind: &str, parent: Option<&str>) -> LocationInput {
        LocationInput {
            name: name.to_owned(),
            kind: kind.to_owned(),
            parent_id: parent.map(str::to_owned),
            status: String::new(),
            fields: BTreeMap::new(),
        }
    }

    async fn create(pool: &SqlitePool, name: &str, kind: &str, parent: Option<&str>) -> Location {
        create_location(pool, &input(name, kind, parent)).await.unwrap()
    }

    const PNG: &[u8] = &[
        0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 0,
    ];

    #[test]
    fn catalog_is_consistent() {
        let catalog = catalog();

        assert_eq!(catalog.categories.len(), 6);

        let mut types = HashSet::new();
        for item in &catalog.types {
            assert!(types.insert(item.id.as_str()), "type en double : {}", item.id);
            assert!(catalog.has_category(&item.category), "catégorie inconnue : {}", item.category);
            assert!(!item.id.starts_with(CUSTOM_PREFIX));
        }

        let mut keys = HashSet::new();
        for field in &catalog.fields {
            assert!(keys.insert(field.key.as_str()), "champ en double : {}", field.key);
            assert!(field.max_length > 0);

            for category in &field.categories {
                assert!(catalog.has_category(category), "{} : catégorie {category}", field.key);
            }
            for kind in &field.types {
                assert!(types.contains(kind.as_str()), "{} : type {kind}", field.key);
            }

            assert_eq!(field.kind == FieldKind::Choice, !field.options.is_empty(), "{}", field.key);
        }

        assert!(catalog.statuses.iter().any(|status| status == DEFAULT_STATUS));
    }

    #[tokio::test]
    async fn locations_are_created_updated_listed_and_deleted() {
        let pool = pool().await;

        let city = create(&pool, "  Valona ", "city", None).await;
        assert_eq!(city.name, "Valona");
        assert_eq!(city.status, "existing");
        assert_eq!(city.kind, "city");

        let mut changed = input("Valona", "ruins", None);
        changed.status = "destroyed".to_owned();
        changed.fields.insert("population".to_owned(), "20 000".to_owned());
        changed.fields.insert("formerly".to_owned(), " La cité blanche ".to_owned());
        changed.fields.insert("notes".to_owned(), "   ".to_owned());

        let ruins = update_location(&pool, &city.id, &changed).await.unwrap();
        assert_eq!(ruins.kind, "ruins");
        // Champ d'une autre catégorie : gardé (changer de type n'efface rien).
        assert_eq!(ruins.fields.get("population").map(String::as_str), Some("20 000"));
        assert_eq!(ruins.fields.get("formerly").map(String::as_str), Some("La cité blanche"));
        assert!(!ruins.fields.contains_key("notes"));

        create(&pool, "Aube", "village", None).await;
        let names: Vec<String> = list_locations(&pool).await.unwrap().into_iter().map(|l| l.name).collect();
        assert_eq!(names, ["Aube", "Valona"]);

        delete_location(&pool, &city.id).await.unwrap();
        assert!(delete_location(&pool, &city.id).await.is_err());
        assert!(update_location(&pool, &city.id, &changed).await.is_err());
    }

    #[tokio::test]
    async fn input_is_validated() {
        let pool = pool().await;

        assert!(create_location(&pool, &input("  ", "city", None)).await.is_err());
        assert!(create_location(&pool, &input(&"a".repeat(201), "city", None)).await.is_err());
        assert!(create_location(&pool, &input("X", "spaceship", None)).await.is_err());
        assert!(create_location(&pool, &input("X", "city", Some("absent"))).await.is_err());

        let mut bad = input("X", "castle", None);
        bad.fields.insert("inconnu".to_owned(), "x".to_owned());
        assert!(create_location(&pool, &bad).await.is_err());

        let mut bad = input("X", "castle", None);
        bad.fields.insert("condition".to_owned(), "brûlé".to_owned());
        assert!(create_location(&pool, &bad).await.is_err());

        let mut ok = input("X", "castle", None);
        ok.fields.insert("condition".to_owned(), "damaged".to_owned());
        ok.fields.insert("languages".to_owned(), r#"[" elfique ","Elfique","nain"]"#.to_owned());
        let castle = create_location(&pool, &ok).await.unwrap();
        assert_eq!(castle.fields["languages"], r#"["elfique","nain"]"#);
    }

    #[tokio::test]
    async fn hierarchy_refuses_cycles_and_lifts_children_on_delete() {
        let pool = pool().await;

        let continent = create(&pool, "Ardanie", "continent", None).await;
        let kingdom = create(&pool, "Valmor", "kingdom", Some(&continent.id)).await;
        let city = create(&pool, "Valona", "capital", Some(&kingdom.id)).await;

        // Le continent ne peut pas aller dans sa propre ville, ni en lui-même.
        let mut moved = input("Ardanie", "continent", Some(&city.id));
        assert!(update_location(&pool, &continent.id, &moved).await.is_err());
        moved.parent_id = Some(continent.id.clone());
        assert!(update_location(&pool, &continent.id, &moved).await.is_err());

        // Le royaume supprimé : la ville remonte dans le continent.
        delete_location(&pool, &kingdom.id).await.unwrap();
        let city = get_location(&pool, &city.id).await.unwrap();
        assert_eq!(city.parent_id.as_deref(), Some(continent.id.as_str()));
    }

    #[tokio::test]
    async fn references_to_missing_elements_are_dropped() {
        let pool = pool().await;

        let kingdom = create(&pool, "Valmor", "kingdom", None).await;
        let capital = create(&pool, "Valona", "capital", Some(&kingdom.id)).await;
        let king = character_service::create_character(
            &pool,
            &character_service::CharacterInput {
                first_name: "Aldric".to_owned(),
                last_name: String::new(),
                role: "main".to_owned(),
                status: "alive".to_owned(),
                fields: BTreeMap::new(),
            },
        )
        .await
        .unwrap();
        let node = structure_service::create_node(&pool, None, 0, "Chapitre 1")
            .await
            .unwrap();

        let mut update = input("Valmor", "kingdom", None);
        update.fields.insert("capital".to_owned(), capital.id.clone());
        update.fields.insert("ruler".to_owned(), king.id.clone());
        update.fields.insert("firstAppearance".to_owned(), node.id.clone());
        let saved = update_location(&pool, &kingdom.id, &update).await.unwrap();
        assert_eq!(saved.fields["capital"], capital.id);
        assert_eq!(saved.fields["ruler"], king.id);
        assert_eq!(saved.fields["firstAppearance"], node.id);

        update.fields.insert("capital".to_owned(), "absent".to_owned());
        update.fields.insert("ruler".to_owned(), "absent".to_owned());
        update.fields.insert("overlord".to_owned(), kingdom.id.clone());
        let saved = update_location(&pool, &kingdom.id, &update).await.unwrap();
        assert!(!saved.fields.contains_key("capital"));
        assert!(!saved.fields.contains_key("ruler"));
        // Un lieu ne peut pas être son propre suzerain.
        assert!(!saved.fields.contains_key("overlord"));
    }

    #[tokio::test]
    async fn custom_types_and_status_list() {
        let pool = pool().await;

        let settings = set_custom_types(
            &pool,
            &[CustomTypeInput { id: Some("inventé".to_owned()), name: " Tour de mage ".to_owned(), category: "built".to_owned() }],
        )
        .await
        .unwrap();
        let tower_type = settings.custom_types[0].clone();
        assert!(tower_type.id.starts_with(CUSTOM_PREFIX));
        assert_eq!(tower_type.name, "Tour de mage");

        let tower = create(&pool, "Tour d'Orvel", &tower_type.id, None).await;
        assert_eq!(tower.kind, tower_type.id);

        // Type utilisé : impossible de le retirer.
        assert!(set_custom_types(&pool, &[]).await.is_err());

        // Renommé : même identifiant.
        let renamed = set_custom_types(
            &pool,
            &[CustomTypeInput { id: Some(tower_type.id.clone()), name: "Tour".to_owned(), category: "built".to_owned() }],
        )
        .await
        .unwrap();
        assert_eq!(renamed.custom_types[0].id, tower_type.id);

        assert!(set_custom_types(
            &pool,
            &[
                CustomTypeInput { id: None, name: "Oasis".to_owned(), category: "natural".to_owned() },
                CustomTypeInput { id: None, name: "oasis".to_owned(), category: "natural".to_owned() },
            ],
        )
        .await
        .is_err());
        assert!(set_custom_types(
            &pool,
            &[CustomTypeInput { id: None, name: "X".to_owned(), category: "nulle-part".to_owned() }],
        )
        .await
        .is_err());

        let settings = set_list(&pool, "status", Some(&["Existant".to_owned(), " Englouti ".to_owned()]))
            .await
            .unwrap();
        assert_eq!(settings.lists["status"], ["Existant", "Englouti"]);
        assert!(set_list(&pool, "genre", None).await.is_err());
        let settings = set_list(&pool, "status", None).await.unwrap();
        assert!(!settings.lists.contains_key("status"));
    }

    #[tokio::test]
    async fn portrait_and_gallery() {
        let pool = pool().await;
        let place = create(&pool, "Valona", "city", None).await;
        let png = BASE64.encode(PNG);

        let saved = set_portrait(&pool, &place.id, &png).await.unwrap();
        assert!(saved.portrait_updated_at.is_some());
        assert_eq!(get_portrait(&pool, &place.id).await.unwrap().unwrap().mime, "image/png");
        assert!(remove_portrait(&pool, &place.id).await.unwrap().portrait_updated_at.is_none());

        let image = add_gallery_image(&pool, &place.id, &png, Some(" Plan ")).await.unwrap();
        assert_eq!(image.caption.as_deref(), Some("Plan"));
        set_gallery_caption(&pool, &image.id, Some("Carte")).await.unwrap();
        let gallery = list_gallery(&pool, &place.id).await.unwrap();
        assert_eq!(gallery[0].caption.as_deref(), Some("Carte"));
        assert_eq!(get_location(&pool, &place.id).await.unwrap().gallery_count, 1);

        for _ in 1..MAX_GALLERY_IMAGES {
            add_gallery_image(&pool, &place.id, &png, None).await.unwrap();
        }
        assert!(add_gallery_image(&pool, &place.id, &png, None).await.is_err());

        delete_gallery_image(&pool, &image.id).await.unwrap();
        assert!(get_gallery_image(&pool, &image.id).await.is_err());

        // Le lieu supprimé emporte ses images.
        delete_location(&pool, &place.id).await.unwrap();
        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM location_images")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 0);
    }
}
