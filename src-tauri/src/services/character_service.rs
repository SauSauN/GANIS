//! Personnages d'un projet (base du projet).
//!
//! # Fiche en trois niveaux de 15 champs
//!
//! Le **niveau de détail** vaut pour tout le projet (`character_settings`).
//! Il est choisi à la création du premier personnage, puis se change dans
//! les paramètres du projet. Les niveaux sont cumulatifs :
//!
//! | Niveau         | Thème           | But                                         |
//! |----------------|-----------------|---------------------------------------------|
//! | `basic`        | l'identité      | identifier le personnage                    |
//! | `intermediate` | l'apparence     | le visualiser et le reconnaître             |
//! | `advanced`     | la personnalité | construire un personnage crédible, évolutif |
//!
//! Hors du JSON `fields` : prénom et nom (« nom complet »), rôle et statut
//! (colonnes, pour le classement), image principale (`character_portraits`)
//! et galerie de références (`character_images`).
//!
//! Types de champs (`FieldKind`) : texte, date (AAAA-MM-JJ), valeur d'une
//! liste personnalisable, étiquettes et couleurs (tableaux JSON enregistrés
//! comme texte), référence à un élément du découpage (« première
//! apparition »).
//!
//! Changer de niveau ne supprime rien : un champ rempli puis masqué par un
//! niveau inférieur réapparaît quand on remonte de niveau.
//!
//! La liste des champs est aussi dans l'interface
//! (`src/lib/characterFields.json`) ; un test vérifie que les deux sont
//! identiques.
//!
//! # Images
//!
//! L'interface réduit les images avant l'envoi ; Rust vérifie leur type
//! réel par leurs premiers octets (PNG, JPEG, WebP, GIF) et leur taille.
//! Elles sont dans la base du projet, donc chiffrées avec elle.

use crate::error::{AppError, AppResult};
use crate::utils::{new_id, now_utc};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::BTreeMap;

/// Longueur maximale du prénom, et du nom.
const MAX_NAME_CHARS: usize = 100;

/// Longueur maximale d'une valeur de liste (rôle, statut, genre…).
const MAX_CHOICE_CHARS: usize = 60;

/// Taille maximale d'une image, une fois décodée (octets).
pub const MAX_IMAGE_BYTES: usize = 2 * 1024 * 1024;

/// Nombre maximal d'images dans la galerie d'un personnage.
pub const MAX_GALLERY_IMAGES: i64 = 30;

const MAX_TAGS: usize = 30;
const MAX_TAG_CHARS: usize = 50;
const MAX_COLORS: usize = 12;
const MAX_LIST_VALUES: usize = 50;

// ----------------------------------------------------------------------------
// Niveaux
// ----------------------------------------------------------------------------

/// Niveau de détail des fiches du projet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DetailLevel {
    Basic,
    Intermediate,
    Advanced,
}

impl DetailLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            DetailLevel::Basic => "basic",
            DetailLevel::Intermediate => "intermediate",
            DetailLevel::Advanced => "advanced",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        [DetailLevel::Basic, DetailLevel::Intermediate, DetailLevel::Advanced]
            .into_iter()
            .find(|level| level.as_str() == value)
    }
}

/// Listes personnalisables du projet.
pub const LISTS: [&str; 4] = ["gender", "status", "role", "build"];

// ----------------------------------------------------------------------------
// Champs de la fiche
// ----------------------------------------------------------------------------

const SHORT: usize = 200;
const MEDIUM: usize = 1_000;
const LONG: usize = 20_000;

/// Nature d'un champ (et donc sa validation).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    /// Une ligne.
    Text,
    /// Texte long.
    LongText,
    /// Date facultative, AAAA-MM-JJ.
    Date,
    /// Valeur d'une liste personnalisable (texte libre court).
    Choice,
    /// Élément du découpage du récit (identifiant).
    Reference,
    /// Étiquettes : tableau JSON de textes.
    Tags,
    /// Couleurs : tableau JSON de « #rrggbb ».
    Colors,
}

/// Champ de la fiche.
pub struct FieldDef {
    pub key: &'static str,
    /// Premier niveau qui propose ce champ. Sert à l'interface ; vérifié
    /// par le test `catalog_matches_the_interface`.
    #[cfg_attr(not(test), allow(dead_code))]
    pub level: DetailLevel,
    pub kind: FieldKind,
    pub max_chars: usize,
}

const fn def(key: &'static str, level: DetailLevel, kind: FieldKind, max_chars: usize) -> FieldDef {
    FieldDef { key, level, kind, max_chars }
}

use DetailLevel::{Advanced, Basic, Intermediate};
use FieldKind::{Choice, Colors, Date, LongText, Reference, Tags, Text};

/// Champs enregistrés dans `fields` (même ordre que l'interface).
pub const FIELDS: &[FieldDef] = &[
    // Niveau 1 — l'identité (avec nom complet, rôle, statut, image : 15)
    def("nickname", Basic, Text, SHORT),
    def("age", Basic, Text, SHORT),
    def("birthDate", Basic, Date, SHORT),
    def("gender", Basic, Choice, MAX_CHOICE_CHARS),
    def("occupation", Basic, Text, SHORT),
    def("origin", Basic, Text, SHORT),
    def("firstAppearance", Basic, Reference, SHORT),
    def("description", Basic, LongText, LONG),
    def("mainGoal", Basic, Text, MEDIUM),
    def("distinctiveTrait", Basic, Text, MEDIUM),
    def("notes", Basic, LongText, LONG),
    // Niveau 2 — l'apparence (avec la galerie : 15)
    def("height", Intermediate, Text, SHORT),
    def("build", Intermediate, Choice, MAX_CHOICE_CHARS),
    def("silhouette", Intermediate, Text, MEDIUM),
    def("skinTone", Intermediate, Text, SHORT),
    def("face", Intermediate, Text, MEDIUM),
    def("eyes", Intermediate, Text, SHORT),
    def("hair", Intermediate, Text, SHORT),
    def("distinguishingMarks", Intermediate, Text, MEDIUM),
    def("voice", Intermediate, Text, MEDIUM),
    def("postureGait", Intermediate, Text, MEDIUM),
    def("clothingStyle", Intermediate, Text, MEDIUM),
    def("mainOutfit", Intermediate, Text, MEDIUM),
    def("accessories", Intermediate, Text, MEDIUM),
    def("colorPalette", Intermediate, Colors, SHORT),
    // Niveau 3 — la personnalité (15)
    def("psychology", Advanced, LongText, LONG),
    def("traits", Advanced, Tags, LONG),
    def("strengths", Advanced, Tags, LONG),
    def("flaws", Advanced, Tags, LONG),
    def("motivations", Advanced, LongText, LONG),
    def("deepDesire", Advanced, Text, MEDIUM),
    def("fears", Advanced, Text, MEDIUM),
    def("weaknesses", Advanced, Text, MEDIUM),
    def("coreValues", Advanced, Text, MEDIUM),
    def("beliefs", Advanced, Text, MEDIUM),
    def("formativeEvent", Advanced, LongText, LONG),
    def("secret", Advanced, LongText, LONG),
    def("innerConflict", Advanced, LongText, LONG),
    def("adversityResponse", Advanced, Text, MEDIUM),
    def("plannedArc", Advanced, LongText, LONG),
];

fn find_field(key: &str) -> Option<&'static FieldDef> {
    FIELDS.iter().find(|def| def.key == key)
}

// ----------------------------------------------------------------------------
// Types échangés avec l'interface
// ----------------------------------------------------------------------------

/// Personnage, tel qu'envoyé à l'interface (sans les images elles-mêmes).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub role: String,
    pub status: String,
    /// Champs remplis (les champs vides ne sont pas stockés).
    pub fields: BTreeMap<String, String>,
    /// Date de l'image principale (`None` : pas d'image). Change à chaque
    /// nouvelle image : l'interface s'en sert pour son cache.
    pub portrait_updated_at: Option<String>,
    /// Nombre d'images de la galerie.
    pub gallery_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Contenu d'une fiche (création ou modification).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterInput {
    pub first_name: String,
    pub last_name: String,
    pub role: String,
    pub status: String,
    #[serde(default)]
    pub fields: BTreeMap<String, String>,
}

/// Réglages des personnages du projet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSettings {
    /// `None` : pas encore choisi (premier personnage).
    pub detail_level: Option<DetailLevel>,
    /// Listes personnalisées. Une liste absente : valeurs par défaut de
    /// l'interface.
    pub lists: BTreeMap<String, Vec<String>>,
}

/// Image encodée en base64.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Portrait {
    pub mime: String,
    pub data: String,
    pub updated_at: String,
}

/// Image de la galerie, sans son contenu.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GalleryImage {
    pub id: String,
    pub created_at: String,
}

#[derive(sqlx::FromRow)]
struct CharacterRow {
    id: String,
    first_name: String,
    last_name: String,
    role: String,
    status: String,
    fields: String,
    portrait_updated_at: Option<String>,
    gallery_count: i64,
    created_at: String,
    updated_at: String,
}

impl CharacterRow {
    fn into_character(self) -> Character {
        // Valeurs illisibles (base modifiée à la main, version future) :
        // on affiche la fiche quand même plutôt que d'échouer.
        let fields = serde_json::from_str::<BTreeMap<String, String>>(&self.fields)
            .unwrap_or_default();

        Character {
            id: self.id,
            first_name: self.first_name,
            last_name: self.last_name,
            role: self.role,
            status: self.status,
            fields,
            portrait_updated_at: self.portrait_updated_at,
            gallery_count: self.gallery_count,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

fn not_found() -> AppError {
    AppError::not_found("Personnage introuvable.").with_key("character.notFound")
}

fn invalid_field(key: &'static str) -> AppError {
    AppError::validation(format!("Valeur invalide pour {key}."))
        .with_key("character.invalidValue")
        .with_param("field", key)
}

fn too_long(key: &'static str, max: usize) -> AppError {
    AppError::validation(format!("Un champ de la fiche dépasse {max} caractères."))
        .with_key("character.fieldTooLong")
        .with_param("field", key)
        .with_param("max", max)
}

/// Fiche validée, prête à être enregistrée.
struct CleanInput {
    first_name: String,
    last_name: String,
    role: String,
    status: String,
    fields: BTreeMap<String, String>,
}

fn clean_name(value: &str) -> AppResult<String> {
    let value = value.trim();

    if value.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Le prénom et le nom ne peuvent pas dépasser {MAX_NAME_CHARS} caractères."
        ))
        .with_key("character.nameTooLong")
        .with_param("max", MAX_NAME_CHARS));
    }

    Ok(value.to_owned())
}

/// Rôle ou statut : valeur d'une liste personnalisable, jamais vide.
fn clean_choice(value: &str, key: &'static str, default: &str) -> AppResult<String> {
    let value = value.trim();

    if value.chars().count() > MAX_CHOICE_CHARS {
        return Err(too_long(key, MAX_CHOICE_CHARS));
    }

    Ok(if value.is_empty() { default } else { value }.to_owned())
}

/// Date AAAA-MM-JJ valide.
fn is_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

/// Couleur « #rrggbb ».
fn is_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Nettoie la valeur d'un champ selon sa nature. `None` : champ vide.
fn clean_value(def: &'static FieldDef, raw: &str) -> AppResult<Option<String>> {
    let value = raw.trim();

    if value.is_empty() {
        return Ok(None);
    }

    match def.kind {
        Text | LongText | Choice | Reference => {
            if value.chars().count() > def.max_chars {
                return Err(too_long(def.key, def.max_chars));
            }
            Ok(Some(value.to_owned()))
        }
        Date => {
            if !is_date(value) {
                return Err(invalid_field(def.key));
            }
            Ok(Some(value.to_owned()))
        }
        Tags => {
            let tags: Vec<String> =
                serde_json::from_str(value).map_err(|_| invalid_field(def.key))?;
            let mut cleaned: Vec<String> = Vec::new();

            for tag in tags {
                let tag = tag.trim();

                if tag.is_empty() {
                    continue;
                }
                if tag.chars().count() > MAX_TAG_CHARS {
                    return Err(too_long(def.key, MAX_TAG_CHARS));
                }
                if !cleaned.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
                    cleaned.push(tag.to_owned());
                }
            }

            if cleaned.len() > MAX_TAGS {
                return Err(invalid_field(def.key));
            }

            Ok((!cleaned.is_empty()).then(|| serde_json::to_string(&cleaned)).transpose()?)
        }
        Colors => {
            let colors: Vec<String> =
                serde_json::from_str(value).map_err(|_| invalid_field(def.key))?;
            let colors: Vec<String> = colors.iter().map(|c| c.trim().to_lowercase()).collect();

            if colors.len() > MAX_COLORS || !colors.iter().all(|c| is_color(c)) {
                return Err(invalid_field(def.key));
            }

            Ok((!colors.is_empty()).then(|| serde_json::to_string(&colors)).transpose()?)
        }
    }
}

async fn clean_input(pool: &SqlitePool, input: &CharacterInput) -> AppResult<CleanInput> {
    let first_name = clean_name(&input.first_name)?;
    let last_name = clean_name(&input.last_name)?;

    if first_name.is_empty() && last_name.is_empty() {
        return Err(AppError::validation("Le prénom ou le nom du personnage est requis.")
            .with_key("character.nameRequired"));
    }

    let role = clean_choice(&input.role, "role", "main")?;
    let status = clean_choice(&input.status, "status", "alive")?;

    let mut fields = BTreeMap::new();

    for (key, raw) in &input.fields {
        let def = find_field(key).ok_or_else(|| {
            AppError::validation(format!("Champ de fiche inconnu : {key}."))
                .with_key("character.unknownField")
        })?;

        let Some(value) = clean_value(def, raw)? else {
            continue;
        };

        // Première apparition : un élément du découpage supprimé depuis
        // est simplement retiré (la fiche reste enregistrable).
        if def.kind == Reference {
            let exists: Option<String> =
                sqlx::query_scalar("SELECT id FROM structure_nodes WHERE id = ?")
                    .bind(&value)
                    .fetch_optional(pool)
                    .await?;

            if exists.is_none() {
                continue;
            }
        }

        fields.insert(def.key.to_owned(), value);
    }

    Ok(CleanInput { first_name, last_name, role, status, fields })
}

/// Type réel d'une image, d'après ses premiers octets.
fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else {
        None
    }
}

fn image_too_large() -> AppError {
    AppError::validation("L'image est trop lourde.")
        .with_key("character.imageTooLarge")
        .with_param("max", MAX_IMAGE_BYTES / (1024 * 1024))
}

/// Décode et vérifie une image envoyée en base64.
fn decode_image(data: &str) -> AppResult<(Vec<u8>, &'static str)> {
    let invalid = || {
        AppError::validation("Cette image n'est pas lisible (PNG, JPEG, WebP ou GIF).")
            .with_key("character.invalidImage")
    };

    // Taille vérifiée avant le décodage (base64 : 4 caractères pour 3 octets).
    if data.len() > MAX_IMAGE_BYTES / 3 * 4 + 4 {
        return Err(image_too_large());
    }

    let bytes = BASE64.decode(data.trim()).map_err(|_| invalid())?;

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(image_too_large());
    }

    let mime = sniff_image(&bytes).ok_or_else(invalid)?;

    Ok((bytes, mime))
}

async fn ensure_character(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM characters WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    exists.map(|_| ()).ok_or_else(not_found)
}

async fn touch(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("UPDATE characters SET updated_at = ? WHERE id = ?")
        .bind(now_utc())
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ----------------------------------------------------------------------------
// Réglages
// ----------------------------------------------------------------------------

/// Réglages des personnages du projet.
pub async fn get_settings(pool: &SqlitePool) -> AppResult<CharacterSettings> {
    let row: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT detail_level, lists FROM character_settings WHERE id = 'default'")
            .fetch_optional(pool)
            .await?;

    let (level, lists) = row.unwrap_or((None, "{}".to_owned()));

    Ok(CharacterSettings {
        detail_level: level.as_deref().and_then(DetailLevel::parse),
        lists: serde_json::from_str(&lists).unwrap_or_default(),
    })
}

/// Choisit le niveau de détail de toutes les fiches du projet.
pub async fn set_detail_level(pool: &SqlitePool, level: &str) -> AppResult<CharacterSettings> {
    let level = DetailLevel::parse(level).ok_or_else(|| {
        AppError::validation("Niveau de détail inconnu.").with_key("character.invalidLevel")
    })?;

    sqlx::query(
        "INSERT INTO character_settings (id, detail_level, updated_at) VALUES ('default', ?, ?) \
         ON CONFLICT (id) DO UPDATE SET detail_level = excluded.detail_level, updated_at = excluded.updated_at",
    )
    .bind(level.as_str())
    .bind(now_utc())
    .execute(pool)
    .await?;

    get_settings(pool).await
}

/// Remplace une liste personnalisable. `None` : retour aux valeurs par défaut.
pub async fn set_list(
    pool: &SqlitePool,
    list: &str,
    values: Option<&[String]>,
) -> AppResult<CharacterSettings> {
    if !LISTS.contains(&list) {
        return Err(AppError::validation("Liste inconnue.").with_key("character.invalidList"));
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
                    return Err(AppError::validation("Une valeur de la liste est trop longue.")
                        .with_key("character.listValueTooLong")
                        .with_param("max", MAX_CHOICE_CHARS));
                }
                if !cleaned.iter().any(|v| v.to_lowercase() == value.to_lowercase()) {
                    cleaned.push(value.to_owned());
                }
            }

            if cleaned.len() > MAX_LIST_VALUES {
                return Err(AppError::validation("La liste contient trop de valeurs.")
                    .with_key("character.listTooLong")
                    .with_param("max", MAX_LIST_VALUES));
            }

            settings.lists.insert(list.to_owned(), cleaned);
        }
    }

    sqlx::query(
        "INSERT INTO character_settings (id, detail_level, lists, updated_at) VALUES ('default', NULL, ?, ?) \
         ON CONFLICT (id) DO UPDATE SET lists = excluded.lists, updated_at = excluded.updated_at",
    )
    .bind(serde_json::to_string(&settings.lists)?)
    .bind(now_utc())
    .execute(pool)
    .await?;

    get_settings(pool).await
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

const SELECT_CHARACTER: &str = r#"
    SELECT c.id, c.first_name, c.last_name, c.role, c.status, c.fields,
           p.updated_at AS portrait_updated_at,
           (SELECT COUNT(*) FROM character_images i WHERE i.character_id = c.id) AS gallery_count,
           c.created_at, c.updated_at
    FROM characters c
    LEFT JOIN character_portraits p ON p.character_id = c.id
"#;

/// Tous les personnages, par ordre alphabétique (prénom puis nom).
pub async fn list_characters(pool: &SqlitePool) -> AppResult<Vec<Character>> {
    let sql = format!(
        "{SELECT_CHARACTER} ORDER BY TRIM(c.first_name || ' ' || c.last_name) COLLATE NOCASE, c.created_at"
    );

    let rows = sqlx::query_as::<_, CharacterRow>(&sql).fetch_all(pool).await?;

    Ok(rows.into_iter().map(CharacterRow::into_character).collect())
}

/// Un personnage.
pub async fn get_character(pool: &SqlitePool, id: &str) -> AppResult<Character> {
    let sql = format!("{SELECT_CHARACTER} WHERE c.id = ?");

    sqlx::query_as::<_, CharacterRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(CharacterRow::into_character)
        .ok_or_else(not_found)
}

// ----------------------------------------------------------------------------
// Écriture
// ----------------------------------------------------------------------------

/// Crée un personnage.
pub async fn create_character(pool: &SqlitePool, input: &CharacterInput) -> AppResult<Character> {
    let clean = clean_input(pool, input).await?;
    let id = new_id();
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO characters
            (id, first_name, last_name, role, status, fields, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&clean.first_name)
    .bind(&clean.last_name)
    .bind(&clean.role)
    .bind(&clean.status)
    .bind(serde_json::to_string(&clean.fields)?)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    get_character(pool, &id).await
}

/// Remplace la fiche d'un personnage.
pub async fn update_character(
    pool: &SqlitePool,
    id: &str,
    input: &CharacterInput,
) -> AppResult<Character> {
    let clean = clean_input(pool, input).await?;

    let result = sqlx::query(
        r#"
        UPDATE characters
        SET first_name = ?, last_name = ?, role = ?, status = ?, fields = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&clean.first_name)
    .bind(&clean.last_name)
    .bind(&clean.role)
    .bind(&clean.status)
    .bind(serde_json::to_string(&clean.fields)?)
    .bind(now_utc())
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    get_character(pool, id).await
}

/// Supprime un personnage (et ses images).
pub async fn delete_character(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM characters WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(not_found());
    }

    Ok(())
}

// ----------------------------------------------------------------------------
// Image principale
// ----------------------------------------------------------------------------

/// Image principale d'un personnage (`None` : il n'en a pas).
pub async fn get_portrait(pool: &SqlitePool, id: &str) -> AppResult<Option<Portrait>> {
    let row: Option<(String, Vec<u8>, String)> = sqlx::query_as(
        "SELECT mime, data, updated_at FROM character_portraits WHERE character_id = ?",
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
pub async fn set_portrait(pool: &SqlitePool, id: &str, data: &str) -> AppResult<Character> {
    let (bytes, mime) = decode_image(data)?;
    ensure_character(pool, id).await?;

    sqlx::query(
        r#"
        INSERT INTO character_portraits (character_id, mime, data, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (character_id) DO UPDATE
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
    get_character(pool, id).await
}

/// Retire l'image principale (les initiales sont alors affichées).
pub async fn remove_portrait(pool: &SqlitePool, id: &str) -> AppResult<Character> {
    let character = get_character(pool, id).await?;

    if character.portrait_updated_at.is_none() {
        return Ok(character);
    }

    sqlx::query("DELETE FROM character_portraits WHERE character_id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    touch(pool, id).await?;
    get_character(pool, id).await
}

// ----------------------------------------------------------------------------
// Galerie de références visuelles
// ----------------------------------------------------------------------------

/// Images de la galerie d'un personnage (sans leur contenu), dans l'ordre.
pub async fn list_gallery(pool: &SqlitePool, character_id: &str) -> AppResult<Vec<GalleryImage>> {
    ensure_character(pool, character_id).await?;

    Ok(sqlx::query_as::<_, GalleryImage>(
        "SELECT id, created_at FROM character_images WHERE character_id = ? ORDER BY position, created_at",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?)
}

/// Contenu d'une image de la galerie.
pub async fn get_gallery_image(pool: &SqlitePool, image_id: &str) -> AppResult<Portrait> {
    let row: Option<(String, Vec<u8>, String)> =
        sqlx::query_as("SELECT mime, data, created_at FROM character_images WHERE id = ?")
            .bind(image_id)
            .fetch_optional(pool)
            .await?;

    row.map(|(mime, data, updated_at)| Portrait { mime, data: BASE64.encode(data), updated_at })
        .ok_or_else(|| AppError::not_found("Image introuvable.").with_key("character.imageNotFound"))
}

/// Ajoute une image à la fin de la galerie.
pub async fn add_gallery_image(
    pool: &SqlitePool,
    character_id: &str,
    data: &str,
) -> AppResult<GalleryImage> {
    let (bytes, mime) = decode_image(data)?;
    ensure_character(pool, character_id).await?;

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM character_images WHERE character_id = ?")
            .bind(character_id)
            .fetch_one(pool)
            .await?;

    if count >= MAX_GALLERY_IMAGES {
        return Err(AppError::validation("La galerie est pleine.")
            .with_key("character.galleryFull")
            .with_param("max", MAX_GALLERY_IMAGES));
    }

    let id = new_id();
    let now = now_utc();

    sqlx::query(
        r#"
        INSERT INTO character_images (id, character_id, mime, data, position, created_at)
        SELECT ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?
        FROM character_images WHERE character_id = ?
        "#,
    )
    .bind(&id)
    .bind(character_id)
    .bind(mime)
    .bind(&bytes)
    .bind(&now)
    .bind(character_id)
    .execute(pool)
    .await?;

    touch(pool, character_id).await?;

    Ok(GalleryImage { id, created_at: now })
}

/// Supprime une image de la galerie.
pub async fn delete_gallery_image(pool: &SqlitePool, image_id: &str) -> AppResult<()> {
    let character_id: Option<String> =
        sqlx::query_scalar("SELECT character_id FROM character_images WHERE id = ?")
            .bind(image_id)
            .fetch_optional(pool)
            .await?;

    let Some(character_id) = character_id else {
        return Err(AppError::not_found("Image introuvable.").with_key("character.imageNotFound"));
    };

    sqlx::query("DELETE FROM character_images WHERE id = ?")
        .bind(image_id)
        .execute(pool)
        .await?;

    touch(pool, &character_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, PROJECT_MIGRATOR};
    use sqlx::migrate::Migrator;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn empty_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
        pool
    }

    async fn pool() -> SqlitePool {
        let pool = empty_pool().await;
        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();
        pool
    }

    /// Migrations jusqu'à `version` incluse seulement.
    async fn pool_until(version: i64) -> SqlitePool {
        let pool = empty_pool().await;
        let mut migrator = Migrator::new(std::path::Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/migrations/project"
        )))
        .await
        .unwrap();
        migrator.migrations = migrator
            .migrations
            .iter()
            .filter(|m| m.version <= version)
            .cloned()
            .collect::<Vec<_>>()
            .into();
        migrator.run(&pool).await.unwrap();
        pool
    }

    fn input(first: &str, last: &str, fields: &[(&str, &str)]) -> CharacterInput {
        CharacterInput {
            first_name: first.to_owned(),
            last_name: last.to_owned(),
            role: "main".to_owned(),
            status: "alive".to_owned(),
            fields: fields
                .iter()
                .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
                .collect(),
        }
    }

    /// Plus petit PNG valide (1 × 1 pixel).
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89,
    ];

    #[test]
    fn field_keys_are_unique() {
        for (i, a) in FIELDS.iter().enumerate() {
            assert!(FIELDS[i + 1..].iter().all(|b| b.key != a.key), "doublon : {}", a.key);
        }
    }

    /// 15 champs par niveau, en comptant ceux qui ne sont pas dans `fields` :
    /// nom complet, rôle, statut et image principale (niveau 1), galerie
    /// (niveau 2).
    #[test]
    fn each_level_has_fifteen_fields() {
        let count = |level| FIELDS.iter().filter(|f| f.level == level).count();

        assert_eq!(count(Basic) + 4, 15);
        assert_eq!(count(Intermediate) + 1, 15);
        assert_eq!(count(Advanced), 15);
    }

    /// Le catalogue de l'interface (`src/lib/characterFields.json`) doit
    /// être le même : clés, ordre, niveaux, natures et longueurs.
    #[test]
    fn catalog_matches_the_interface() {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct UiField {
            key: String,
            level: DetailLevel,
            kind: FieldKind,
            max_length: usize,
        }

        let ui: Vec<UiField> =
            serde_json::from_str(include_str!("../../../src/lib/characterFields.json")).unwrap();

        assert_eq!(ui.len(), FIELDS.len());

        for (ui, def) in ui.iter().zip(FIELDS) {
            assert_eq!(ui.key, def.key);
            assert_eq!(ui.level, def.level, "niveau de {}", def.key);
            assert_eq!(ui.kind, def.kind, "nature de {}", def.key);
            assert_eq!(ui.max_length, def.max_chars, "longueur de {}", def.key);
        }
    }

    #[tokio::test]
    async fn detail_level_and_lists_are_project_settings() {
        let pool = pool().await;

        let s = get_settings(&pool).await.unwrap();
        assert_eq!(s.detail_level, None);
        assert!(s.lists.is_empty());

        let s = set_detail_level(&pool, "intermediate").await.unwrap();
        assert_eq!(s.detail_level, Some(DetailLevel::Intermediate));
        assert!(set_detail_level(&pool, "expert").await.is_err());

        let values = vec![" Elfe ".to_owned(), "elfe".to_owned(), "Nain".to_owned(), "".to_owned()];
        let s = set_list(&pool, "gender", Some(&values)).await.unwrap();
        assert_eq!(s.lists["gender"], ["Elfe", "Nain"]);
        // Le niveau n'est pas touché.
        assert_eq!(s.detail_level, Some(DetailLevel::Intermediate));

        let s = set_list(&pool, "gender", None).await.unwrap();
        assert!(!s.lists.contains_key("gender"));

        assert!(set_list(&pool, "species", Some(&[])).await.is_err());
        let long = vec!["x".repeat(61)];
        assert!(set_list(&pool, "role", Some(&long)).await.is_err());
    }

    #[tokio::test]
    async fn typed_fields_are_validated_and_cleaned() {
        let pool = pool().await;

        let c = create_character(
            &pool,
            &input(
                " Zoé ",
                "Roux",
                &[
                    ("birthDate", "1987-03-12"),
                    ("traits", r#"[" Têtue ", "têtue", "Drôle", ""]"#),
                    ("colorPalette", r##"["#A0B1C2", "#000000"]"##),
                    ("gender", "Elfe des bois"),
                    ("nickname", "   "),
                ],
            ),
        )
        .await
        .unwrap();

        assert_eq!(c.first_name, "Zoé");
        assert_eq!(c.fields["traits"], r#"["Têtue","Drôle"]"#);
        assert_eq!(c.fields["colorPalette"], r##"["#a0b1c2","#000000"]"##);
        assert_eq!(c.fields["gender"], "Elfe des bois");
        assert!(!c.fields.contains_key("nickname"));
        assert_eq!(c.gallery_count, 0);

        let bad = [
            ("birthDate", "12/03/1987"),
            ("birthDate", "1987-02-30"),
            ("traits", "pas du json"),
            ("colorPalette", r#"["rouge"]"#),
            ("script", "x"),
        ];
        for (key, value) in bad {
            assert!(
                create_character(&pool, &input("A", "", &[(key, value)])).await.is_err(),
                "{key} = {value} devrait être refusé"
            );
        }

        assert!(create_character(&pool, &input("  ", "  ", &[])).await.is_err());
        assert!(create_character(&pool, &input(&"x".repeat(101), "", &[])).await.is_err());
    }

    #[tokio::test]
    async fn custom_roles_and_statuses_are_accepted() {
        let pool = pool().await;

        let mut custom = input("Ana", "", &[]);
        custom.role = "Mentor".to_owned();
        custom.status = "  ".to_owned();
        let c = create_character(&pool, &custom).await.unwrap();

        assert_eq!(c.role, "Mentor");
        assert_eq!(c.status, "alive");

        custom.role = "x".repeat(61);
        assert!(create_character(&pool, &custom).await.is_err());
    }

    #[tokio::test]
    async fn first_appearance_points_to_an_existing_structure_node() {
        let pool = pool().await;
        let node = crate::services::structure_service::create_node(&pool, None, 1, "Chapitre 1")
            .await
            .unwrap();

        let c = create_character(&pool, &input("Ana", "", &[("firstAppearance", &node.id)]))
            .await
            .unwrap();
        assert_eq!(c.fields["firstAppearance"], node.id);

        // Élément supprimé depuis : la référence est retirée à l'enregistrement.
        crate::services::structure_service::delete_node(&pool, &node.id).await.unwrap();
        let c = update_character(&pool, &c.id, &input("Ana", "", &[("firstAppearance", &node.id)]))
            .await
            .unwrap();
        assert!(!c.fields.contains_key("firstAppearance"));
    }

    #[tokio::test]
    async fn characters_are_listed_by_name() {
        let pool = pool().await;
        create_character(&pool, &input("Zoé", "Roux", &[])).await.unwrap();
        create_character(&pool, &input("arthur", "", &[])).await.unwrap();
        create_character(&pool, &input("", "Gandalf", &[])).await.unwrap();

        let names: Vec<_> = list_characters(&pool)
            .await
            .unwrap()
            .into_iter()
            .map(|c| format!("{} {}", c.first_name, c.last_name).trim().to_owned())
            .collect();
        assert_eq!(names, ["arthur", "Gandalf", "Zoé Roux"]);

        assert!(update_character(&pool, "inconnu", &input("A", "", &[])).await.is_err());
        assert!(delete_character(&pool, "inconnu").await.is_err());
    }

    #[tokio::test]
    async fn portrait_is_checked_stored_and_removed() {
        let pool = pool().await;
        let c = create_character(&pool, &input("Ana", "", &[])).await.unwrap();

        assert!(set_portrait(&pool, &c.id, &BASE64.encode(b"<svg></svg>")).await.is_err());
        assert!(set_portrait(&pool, &c.id, "pas du base64 !").await.is_err());
        let big = BASE64.encode(vec![0xFFu8; MAX_IMAGE_BYTES + 1]);
        assert!(set_portrait(&pool, &c.id, &big).await.is_err());
        assert!(set_portrait(&pool, "inconnu", &BASE64.encode(PNG)).await.is_err());

        let c = set_portrait(&pool, &c.id, &BASE64.encode(PNG)).await.unwrap();
        assert!(c.portrait_updated_at.is_some());

        let portrait = get_portrait(&pool, &c.id).await.unwrap().unwrap();
        assert_eq!(portrait.mime, "image/png");
        assert_eq!(BASE64.decode(portrait.data).unwrap(), PNG);

        let c = remove_portrait(&pool, &c.id).await.unwrap();
        assert!(c.portrait_updated_at.is_none());
    }

    #[tokio::test]
    async fn gallery_images_are_added_listed_and_deleted() {
        let pool = pool().await;
        let c = create_character(&pool, &input("Ana", "", &[])).await.unwrap();
        let png = BASE64.encode(PNG);

        let a = add_gallery_image(&pool, &c.id, &png).await.unwrap();
        let b = add_gallery_image(&pool, &c.id, &png).await.unwrap();
        assert!(add_gallery_image(&pool, &c.id, "pas une image").await.is_err());
        assert!(add_gallery_image(&pool, "inconnu", &png).await.is_err());

        let ids: Vec<_> = list_gallery(&pool, &c.id).await.unwrap().into_iter().map(|i| i.id).collect();
        assert_eq!(ids, [a.id.clone(), b.id.clone()]);
        assert_eq!(get_character(&pool, &c.id).await.unwrap().gallery_count, 2);
        assert_eq!(get_gallery_image(&pool, &a.id).await.unwrap().mime, "image/png");

        delete_gallery_image(&pool, &a.id).await.unwrap();
        assert!(delete_gallery_image(&pool, &a.id).await.is_err());
        assert_eq!(list_gallery(&pool, &c.id).await.unwrap().len(), 1);

        // Supprimer le personnage supprime ses images.
        set_portrait(&pool, &c.id, &png).await.unwrap();
        delete_character(&pool, &c.id).await.unwrap();
        let left: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM character_images) + (SELECT COUNT(*) FROM character_portraits)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(left, 0);
    }

    #[tokio::test]
    async fn gallery_is_limited() {
        let pool = pool().await;
        let c = create_character(&pool, &input("Ana", "", &[])).await.unwrap();
        let png = BASE64.encode(PNG);

        for _ in 0..MAX_GALLERY_IMAGES {
            add_gallery_image(&pool, &c.id, &png).await.unwrap();
        }
        assert!(add_gallery_image(&pool, &c.id, &png).await.is_err());
    }

    /// Projet créé avec la migration 004 : noms coupés en prénom et nom
    /// (005), niveau le plus élevé repris (005), champs renommés (006).
    #[tokio::test]
    async fn older_projects_are_migrated() {
        let pool = pool_until(4).await;

        for (id, name, level, fields) in [
            ("a", "Aldric Venn", "basic", r#"{"summary":"Capitaine.","strengths":"Loyal"}"#),
            ("b", "  Marie-Anne de Bovet ", "advanced", r#"{"species":"Elfe","notes":"Vue"}"#),
            ("c", "Gandalf", "intermediate", "{}"),
        ] {
            sqlx::query(
                "INSERT INTO characters (id, name, detail_level, fields, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z')",
            )
            .bind(id)
            .bind(name)
            .bind(level)
            .bind(fields)
            .execute(&pool)
            .await
            .unwrap();
        }

        run_migrations(&pool, &PROJECT_MIGRATOR).await.unwrap();

        let a = get_character(&pool, "a").await.unwrap();
        assert_eq!((a.first_name.as_str(), a.last_name.as_str()), ("Aldric", "Venn"));
        assert_eq!(a.fields["description"], "Capitaine.");
        assert!(!a.fields.contains_key("summary"));
        assert_eq!(a.fields["strengths"], r#"["Loyal"]"#);

        let b = get_character(&pool, "b").await.unwrap();
        assert_eq!((b.first_name.as_str(), b.last_name.as_str()), ("Marie-Anne", "de Bovet"));
        assert_eq!(b.fields["notes"], "Vue\nEspèce : Elfe");
        assert!(!b.fields.contains_key("species"));

        let c = get_character(&pool, "c").await.unwrap();
        assert_eq!((c.first_name.as_str(), c.last_name.as_str()), ("", "Gandalf"));

        let s = get_settings(&pool).await.unwrap();
        assert_eq!(s.detail_level, Some(DetailLevel::Advanced));
        assert!(s.lists.is_empty());

        // Une fiche migrée s'enregistre sans erreur.
        update_character(
            &pool,
            "a",
            &CharacterInput {
                first_name: a.first_name,
                last_name: a.last_name,
                role: a.role,
                status: a.status,
                fields: a.fields,
            },
        )
        .await
        .unwrap();
    }
}
