//! Projet de démonstration : un roman complet, créé de fond en comble.
//!
//! « Les Archives de Valombre » — une archiviste découvre que les souvenirs
//! de sa ville sont falsifiés. Toutes les données sont imaginaires.
//!
//! Ce test crée un **projet public** (ouvrable sans compte, bouton
//! « Commencer ») dans le dossier de données de GANIS, en passant par les
//! mêmes services que l'application : chiffrement, formats et contrôles
//! sont donc ceux de GANIS. Il exploite toutes les fonctionnalités :
//!
//! - projet : type Roman, statut, favori, description ;
//! - synopsis (genres, sous-genres, ton) ;
//! - personnages : niveau de détail avancé, listes personnalisées, fiches
//!   complètes, portraits, galeries, un personnage mis à la corbeille ;
//! - lieux : types personnalisés, hiérarchie, fiches, portraits, galerie
//!   légendée, statuts ;
//! - relations entre personnages (types, intensité, tonalité, période) et
//!   disposition du graphe ; liens personnage ↔ lieu ;
//! - découpage : parties, chapitres, scènes, prologue et épilogue hors
//!   numérotation, personnages et lieux liés (présent, point de vue, cité,
//!   lieu de l'action), première apparition ;
//! - documents rangés dans le découpage : Word (.docx), Markdown, texte
//!   (avec une version précédente), image ;
//! - roman : texte des scènes, objectifs de mots, états de rédaction,
//!   narration (personne, temps, point de vue), objectif du manuscrit,
//!   dossier éditorial ; une scène dont le texte vient d'un document ;
//!   objectif quotidien et mots écrits chaque jour (série en cours) ;
//! - trame : intrigues parallèles, passé narratif (moments négatifs),
//!   événements reliés aux scènes, liens de cause à effet, actes, tension,
//!   étiquettes, mystères et indices, questions, modèle personnalisé ;
//! - notes : dossiers, notes riches (titres, listes, citation, mentions),
//!   note épinglée, mur de post-it, notes système ;
//! - historique, versions nommées, rythme de travail sur deux mois.
//!
//! (Rechercher et remplacer et l'import de manuscrit agissent sur ce projet
//! comme sur tout roman : rien à préparer.)
//!
//! ## Lancer
//!
//! **Fermez GANIS d'abord**, puis, dans le dossier `src-tauri` :
//!
//! ```text
//! cargo test --lib seed_public_novel -- --ignored --nocapture
//! ```
//!
//! (ou `npm run seed:roman` depuis la racine du projet).
//!
//! Le dossier de données est celui de l'application installée
//! (Windows : `%APPDATA%\app.ganis.studio`). Pour en choisir un autre :
//! variable d'environnement `GANIS_DATA_DIR`. Chaque lancement crée un
//! nouveau projet ; il se supprime dans GANIS comme n'importe quel projet.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::models::project::{ProjectStatus, ProjectType};
use crate::services::character_location_service::{self as places, CharacterLocationInput};
use crate::services::character_service::{self as characters, CharacterInput};
use crate::services::document_service as documents;
use crate::services::history_service as history;
use crate::services::location_service::{self as locations, CustomTypeInput, LocationInput};
use crate::services::note_service::{self as notes, NoteUpdate, StickyUpdate};
use crate::services::novel_service::{self as novel, EditorialUpdate, NovelFields};
use crate::services::relation_service::{self as relations, GraphPosition, RelationInput};
use crate::services::structure_link_service as links;
use crate::services::structure_service::{self as structure, StructureNode};
use crate::services::{plot_service, project_service, project_storage, synopsis_service, system_note_service};
use crate::state::{AppState, Viewer};

// ----------------------------------------------------------------------------
// Dossier de données
// ----------------------------------------------------------------------------

/// Identifiant de l'application (`tauri.conf.json`), nom de son dossier.
const IDENTIFIER: &str = "app.ganis.studio";

/// Dossier de données de GANIS : `GANIS_DATA_DIR`, sinon celui que Tauri
/// utilise sur ce système.
pub(crate) fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("GANIS_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let home = || PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default());
    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| home().join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home().join("Library").join("Application Support")
    } else {
        std::env::var("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|_| home().join(".local").join("share"))
    };
    base.join(IDENTIFIER)
}

// ----------------------------------------------------------------------------
// Petits outils
// ----------------------------------------------------------------------------

pub(crate) fn s(value: &str) -> String {
    value.to_owned()
}

pub(crate) fn fields(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

pub(crate) fn tags(values: &[&str]) -> String {
    serde_json::to_string(values).unwrap()
}

// --- Images PNG (portraits, galeries, planche d'ambiance) -------------------

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

fn adler32(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + byte as u32) % 65_521;
        b = (b + a) % 65_521;
    }
    (b << 16) | a
}

/// Image PNG (RVB) d'après une fonction de couleur, compressée « stockée ».
pub(crate) fn png(width: u32, height: u32, pixel: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
    let mut raw = Vec::with_capacity(((width * 3 + 1) * height) as usize);
    for y in 0..height {
        raw.push(0);
        for x in 0..width {
            raw.extend_from_slice(&pixel(x, y));
        }
    }
    let mut zlib = vec![0x78, 0x01];
    for (index, chunk) in raw.chunks(65_535).enumerate() {
        let last = (index + 1) * 65_535 >= raw.len();
        zlib.push(u8::from(last));
        zlib.extend_from_slice(&(chunk.len() as u16).to_le_bytes());
        zlib.extend_from_slice(&(!(chunk.len() as u16)).to_le_bytes());
        zlib.extend_from_slice(chunk);
    }
    zlib.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut chunk = |kind: &[u8], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&crc32(&body).to_be_bytes());
    };
    let mut header = Vec::new();
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 2, 0, 0, 0]);
    chunk(b"IHDR", &header);
    chunk(b"IDAT", &zlib);
    chunk(b"IEND", &[]);
    out
}

/// Portrait stylisé : fond dégradé, tête et épaules de la couleur donnée.
pub(crate) fn portrait(background: [u8; 3], figure: [u8; 3]) -> String {
    let size = 160;
    let bytes = png(size, size, |x, y| {
        let (fx, fy) = (x as f32, y as f32);
        let head = (fx - 80.0).powi(2) + (fy - 62.0).powi(2) < 30.0f32.powi(2);
        let body = (fx - 80.0).powi(2) / 58.0f32.powi(2) + (fy - 160.0).powi(2) / 62.0f32.powi(2) < 1.0;
        if head || body {
            figure
        } else {
            let t = fy / size as f32;
            [
                (background[0] as f32 * (1.0 - t * 0.35)) as u8,
                (background[1] as f32 * (1.0 - t * 0.35)) as u8,
                (background[2] as f32 * (1.0 - t * 0.35)) as u8,
            ]
        }
    });
    BASE64.encode(bytes)
}

/// Paysage stylisé (ciel, horizon, brume) pour les lieux et la galerie.
pub(crate) fn landscape(sky: [u8; 3], ground: [u8; 3], width: u32, height: u32) -> Vec<u8> {
    png(width, height, |x, y| {
        let horizon = height as f32 * 0.62 + (x as f32 / 11.0).sin() * 6.0;
        if (y as f32) < horizon {
            let t = y as f32 / horizon;
            [
                (sky[0] as f32 + (235.0 - sky[0] as f32) * t) as u8,
                (sky[1] as f32 + (235.0 - sky[1] as f32) * t) as u8,
                (sky[2] as f32 + (240.0 - sky[2] as f32) * t) as u8,
            ]
        } else {
            ground
        }
    })
}

// --- Document Word minimal (.docx) ------------------------------------------

/// Fichier Word lisible par Word, LibreOffice et l'aperçu de GANIS.
pub(crate) fn docx(paragraphs: &[&str]) -> Vec<u8> {
    let escape = |text: &str| text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let body: String = paragraphs
        .iter()
        .map(|p| format!(r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#, escape(p)))
        .collect();
    let files = [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#.to_owned(),
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#.to_owned(),
        ),
        (
            "word/document.xml",
            format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>"#),
        ),
    ];
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, content) in files {
        zip.start_file(name, options).unwrap();
        zip.write_all(content.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

// --- Notes (document de l'éditeur, en JSON) ----------------------------------

pub(crate) fn text(value: &str) -> Value {
    json!({ "type": "text", "text": value })
}
pub(crate) fn italic(value: &str) -> Value {
    json!({ "type": "text", "text": value, "marks": [{ "type": "italic" }] })
}
pub(crate) fn bold(value: &str) -> Value {
    json!({ "type": "text", "text": value, "marks": [{ "type": "bold" }] })
}
pub(crate) fn mention(kind: &str, id: &str, label: &str) -> Value {
    json!({ "type": "entityMention", "attrs": { "kind": kind, "id": id, "label": label } })
}
pub(crate) fn para(content: Vec<Value>) -> Value {
    json!({ "type": "paragraph", "content": content })
}
pub(crate) fn heading(level: u8, value: &str) -> Value {
    json!({ "type": "heading", "attrs": { "level": level }, "content": [text(value)] })
}
pub(crate) fn bullets(items: &[&str]) -> Value {
    json!({ "type": "bulletList", "content": items.iter().map(|i| json!({ "type": "listItem", "content": [para(vec![text(i)])] })).collect::<Vec<_>>() })
}
pub(crate) fn numbered(items: &[&str]) -> Value {
    json!({ "type": "orderedList", "content": items.iter().map(|i| json!({ "type": "listItem", "content": [para(vec![text(i)])] })).collect::<Vec<_>>() })
}
pub(crate) fn quote(value: &str) -> Value {
    json!({ "type": "blockquote", "content": [para(vec![italic(value)])] })
}
pub(crate) fn doc(content: Vec<Value>) -> String {
    json!({ "type": "doc", "content": content }).to_string()
}

/// Lien de mention dans le texte d'une scène (HTML de l'éditeur).
fn mention_html(kind: &str, id: &str, label: &str) -> String {
    format!(r#"<span data-mention="" data-kind="{kind}" data-id="{id}" data-label="{label}">{label}</span>"#)
}

pub(crate) async fn note(pool: &SqlitePool, folder: Option<&str>, title: &str, content: String, excerpt: &str, pinned: bool) -> String {
    let created = notes::create_note(pool, folder, title).await.unwrap();
    notes::update_note(
        pool,
        &created.id,
        &NoteUpdate { title: None, content: Some(content), excerpt: Some(excerpt.to_owned()), pinned: Some(pinned) },
    )
    .await
    .unwrap();
    history::record(pool, "created", "note", &created.id, title, "").await;
    created.id
}

// ----------------------------------------------------------------------------
// Le test
// ----------------------------------------------------------------------------

#[tokio::test(flavor = "current_thread")]
#[ignore = "crée un projet dans le dossier de données de GANIS ; à lancer à la main"]
async fn seed_public_novel() {
    let dir = data_dir();
    println!("Dossier de données de GANIS : {}", dir.display());
    std::fs::create_dir_all(&dir).expect("dossier de données inaccessible");

    let app_db = db::init_app_db(&dir).await.expect("base de l'application illisible (GANIS est-il fermé ?)");
    let state = AppState::new(app_db.clone(), dir.clone());

    // ------------------------------------------------------------------
    // Projet public (comme « Commencer » puis « Nouveau projet »)
    // ------------------------------------------------------------------
    let (project, key) = project_service::create_public_project(
        &app_db,
        "Les Archives de Valombre",
        "Roman de démonstration : une archiviste découvre que les souvenirs de sa ville sont falsifiés.",
        ProjectType::Novel,
    )
    .await
    .unwrap();
    project_storage::create_storage(&state, &project.id, &key).await.unwrap();
    project_service::update_for_viewer(&app_db, &project.id, &Viewer::Guest, None, None, None, Some(ProjectStatus::InProgress), Some(true), None)
        .await
        .unwrap();
    project_service::mark_opened_for_viewer(&app_db, &project.id, &Viewer::Guest).await.ok();
    let pool = project_storage::pool_for_viewer(&state, &project.id, &Viewer::Guest).await.unwrap();
    let pool = &pool;
    println!("Projet créé : {} ({})", project.name, project.id);

    // ------------------------------------------------------------------
    // Synopsis
    // ------------------------------------------------------------------
    synopsis_service::update_synopsis(
        pool,
        "<p>À Valombre, ville portuaire noyée de brume, <strong>Léa Morel</strong>, vingt-six ans, classe les registres des Archives municipales. Une lettre scellée de cire rouge, adressée à sa mère disparue vingt ans plus tôt, lui révèle que les archives ne conservent pas la mémoire de la ville : elles la <em>fabriquent</em>.</p><p>Avec Marc Delaunay, journaliste sans journal, elle remonte la piste d'un « Bureau des oublis » où le maire Victor Hallard fait réécrire les souvenirs des habitants. Mais chaque vérité retrouvée efface un peu de son propre passé.</p><p>Le jour du grand nettoyage, le « jour blanc », Léa devra choisir : rendre à la ville ses souvenirs, ou garder les siens.</p>",
        &[s("Fantastique"), s("Mystère")],
        &[s("Uchronie douce"), s("Roman d'enquête")],
        &[s("Mélancolique"), s("Inquiétant"), s("Lumineux")],
    )
    .await
    .unwrap();
    history::snapshot_before(pool, "synopsis", "default").await;
    history::create_named_version(pool, "synopsis", "default", "Synopsis envoyé à l'atelier d'écriture").await.unwrap();

    // ------------------------------------------------------------------
    // Réglages des personnages et des lieux
    // ------------------------------------------------------------------
    characters::set_detail_level(pool, "advanced").await.unwrap();
    characters::set_list(pool, "role", Some(&["main", "secondary", "antagonist", "mentor", "ally", "extra", "Narratrice"].map(s))).await.unwrap();
    characters::set_list(pool, "status", Some(&["alive", "dead", "missing", "transformed", "newIdentity", "unknown", "Mémoire effacée"].map(s))).await.unwrap();
    locations::set_detail_level(pool, "advanced").await.unwrap();
    let settings = locations::set_custom_types(
        pool,
        &[
            CustomTypeInput { id: None, name: s("Phare"), category: s("built") },
            CustomTypeInput { id: None, name: s("Gare"), category: s("built") },
        ],
    )
    .await
    .unwrap();
    let lighthouse_type = settings.custom_types.iter().find(|t| t.name == "Phare").unwrap().id.clone();
    let station_type = settings.custom_types.iter().find(|t| t.name == "Gare").unwrap().id.clone();
    locations::set_list(pool, "status", Some(&["existing", "destroyed", "hidden", "inaccessible", "abandoned", "lost", "unknown", "Effacé des cartes"].map(s))).await.unwrap();

    // ------------------------------------------------------------------
    // Découpage : Partie › Chapitre › Scène (modèle Roman)
    // ------------------------------------------------------------------
    structure::set_auto_numbering(pool, ProjectType::Novel, true).await.unwrap();
    let node = |parent: Option<String>, level: i64, title: &'static str| {
        let parent = parent.clone();
        async move { structure::create_node(pool, ProjectType::Novel, parent.as_deref(), level, title, None).await.unwrap() }
    };

    let part1 = node(None, 0, "Les registres").await;
    let prologue = node(Some(part1.id.clone()), 1, "Prologue").await;
    structure::update_node(pool, &prologue.id, None, Some("Le naufrage de 1996, vu par la petite Léa."), Some(false), None).await.unwrap();
    let ch1 = node(Some(part1.id.clone()), 1, "La lettre rouge").await;
    let s1_1 = node(Some(ch1.id.clone()), 2, "").await;
    let s1_2 = node(Some(ch1.id.clone()), 2, "").await;
    let s1_3 = node(Some(ch1.id.clone()), 2, "").await;
    let ch2 = node(Some(part1.id.clone()), 1, "Le Bureau des oublis").await;
    let s2_1 = node(Some(ch2.id.clone()), 2, "").await;
    let s2_2 = node(Some(ch2.id.clone()), 2, "").await;

    let part2 = node(None, 0, "La mémoire des autres").await;
    let ch3 = node(Some(part2.id.clone()), 1, "Le phare de Saint-Aubin").await;
    let s3_1 = node(Some(ch3.id.clone()), 2, "").await;
    let s3_2 = node(Some(ch3.id.clone()), 2, "").await;
    let ch4 = node(Some(part2.id.clone()), 1, "Ce que savait Agathe").await;
    let s4_1 = node(Some(ch4.id.clone()), 2, "").await;
    let s4_2 = node(Some(ch4.id.clone()), 2, "").await;

    let part3 = node(None, 0, "Le jour blanc").await;
    let ch5 = node(Some(part3.id.clone()), 1, "La salle des souvenirs").await;
    let s5_1 = node(Some(ch5.id.clone()), 2, "").await;
    let s5_2 = node(Some(ch5.id.clone()), 2, "").await;
    let ch6 = node(Some(part3.id.clone()), 1, "Ce qui reste").await;
    let s6_1 = node(Some(ch6.id.clone()), 2, "").await;
    let epilogue = node(Some(part3.id.clone()), 1, "Épilogue").await;
    structure::update_node(pool, &epilogue.id, None, Some("Un an plus tard, la brume se lève sur Valombre."), Some(false), None).await.unwrap();

    let summaries: [(&StructureNode, &str); 18] = [
        (&part1, "Léa découvre que les archives réécrivent la ville."),
        (&ch1, "La lettre scellée adressée à Agathe Morel."),
        (&s1_1, "Léa trouve la lettre rouge dans un registre de 1996."),
        (&s1_2, "Marc observe Léa à la gare ; il la reconnaît sans savoir d'où."),
        (&s1_3, "Inès Castel interdit à Léa d'ouvrir la lettre."),
        (&ch2, "Le Bureau des oublis, sous la mairie."),
        (&s2_1, "Léa et Marc s'introduisent dans les sous-sols de la mairie."),
        (&s2_2, "Hallard reçoit Léa : il connaît son nom, et celui de sa mère."),
        (&part2, "Remonter le fil d'Agathe."),
        (&s3_1, "Au phare, Léa retrouve le journal de bord de sa mère."),
        (&s3_2, "Marc comprend qu'on a effacé sa propre enfance."),
        (&s4_1, "La lettre d'Agathe, enfin lue (texte dans le document Word)."),
        (&s4_2, "Inès avoue avoir aidé Agathe à fuir (texte dans le document Markdown)."),
        (&part3, "Le grand nettoyage."),
        (&s5_1, "La salle des souvenirs : des milliers de bocaux de brume."),
        (&s5_2, "Léa ouvre les bocaux ; la ville se souvient."),
        (&s6_1, "Léa a perdu le visage de sa mère, mais pas sa voix."),
        (&ch6, "Ce que Léa a gagné, ce qu'elle a perdu."),
    ];
    for (n, summary) in summaries {
        structure::update_node(pool, &n.id, None, Some(summary), None, None).await.unwrap();
        history::record(pool, "created", "structureNode", &n.id, &n.title, "").await;
    }

    // ------------------------------------------------------------------
    // Lieux
    // ------------------------------------------------------------------
    let place = |name: &'static str, kind: String, parent: Option<String>, status: &'static str, f: BTreeMap<String, String>| async move {
        let created = locations::create_location(pool, &LocationInput { name: s(name), kind, parent_id: parent, status: s(status), fields: f }).await.unwrap();
        history::record(pool, "created", "location", &created.id, name, "").await;
        created
    };
    let valombre = place(
        "Valombre",
        s("city"),
        None,
        "existing",
        fields(&[
            ("aliases", "La Ville-Brume"),
            ("description", "Ville portuaire du Nord, bâtie en terrasses au-dessus d'une baie où la brume ne se lève presque jamais. Les façades sont grises, les volets bleus, et chaque rue porte le nom d'un souvenir."),
            ("history", "Fondée par des pêcheurs de harengs, enrichie par le commerce du sel, Valombre a connu un naufrage terrible en 1996. Depuis, la ville vit dans un étrange présent sans aspérités."),
            ("population", "48 000 habitants"),
            ("government", "Conseil municipal présidé par le maire"),
            ("foundedOn", "1412"),
            ("economy", "Pêche, conserveries, tourisme de brume."),
            ("atmosphere", "Odeur de sel et de papier humide ; cornes de brume la nuit ; on parle bas."),
            ("firstAppearance", &prologue.id),
        ]),
    )
    .await;
    let archives = place(
        "Archives municipales",
        s("library"),
        Some(valombre.id.clone()),
        "existing",
        fields(&[
            ("description", "Un ancien entrepôt à sel reconverti : sept étages de rayonnages, un monte-charge capricieux et une salle de lecture sous verrière."),
            ("purpose", "Conserver les registres de la ville… et, en secret, les réécrire."),
            ("architecturalStyle", "Brique rouge, fonte et verre, 1890"),
            ("firstAppearance", &s1_1.id),
        ]),
    )
    .await;
    let mairie = place(
        "Mairie de Valombre",
        s("palace"),
        Some(valombre.id.clone()),
        "existing",
        fields(&[("description", "Façade néoclassique, horloge arrêtée sur 4 h 12. Les sous-sols abritent le Bureau des oublis."), ("purpose", "Siège du pouvoir municipal"), ("firstAppearance", &s2_1.id)]),
    )
    .await;
    let bureau = place(
        "Bureau des oublis",
        s("dungeon"),
        Some(mairie.id.clone()),
        "hidden",
        fields(&[("description", "Une enfilade de caves voûtées où l'on distille les souvenirs dans des bocaux de verre."), ("dangers", "Rester plus d'une heure fait oublier pourquoi on est venu."), ("inhabitants", "Les copistes, employés sans mémoire."), ("firstAppearance", &s2_1.id)]),
    )
    .await;
    let quartier = place("Quartier des Brumes", s("district"), Some(valombre.id.clone()), "existing", fields(&[("description", "Ruelles en pente, maisons de pêcheurs, la boulangerie Morel aux volets clos.")])).await;
    let gare = place("Gare de Valombre", station_type, Some(valombre.id.clone()), "existing", fields(&[("description", "Gare terminus ; un seul train par jour, le 7 h 40, qui ne part jamais à l'heure."), ("firstAppearance", &s1_2.id)])).await;
    let ile = place("Île aux Mouettes", s("island"), None, "existing", fields(&[("description", "Îlot rocheux à deux milles de la côte, accessible à marée basse."), ("climate", "Venteux, embruns permanents")])).await;
    let phare = place(
        "Phare de Saint-Aubin",
        lighthouse_type,
        Some(ile.id.clone()),
        "abandoned",
        fields(&[("description", "Phare éteint depuis le naufrage. Agathe y avait installé son atelier."), ("purpose", "Guider les navires ; désormais, cacher un journal de bord."), ("firstAppearance", &s3_1.id)]),
    )
    .await;
    let foret = place("Forêt de Vire", s("forest"), None, "Effacé des cartes", fields(&[("description", "Forêt qui n'apparaît plus sur aucune carte depuis 1996."), ("legends", "On dit qu'on y entend les souvenirs perdus chuchoter."), ("dangers", "Les sentiers changent de place.")])).await;

    // Portraits et galerie des lieux.
    locations::set_portrait(pool, &valombre.id, &BASE64.encode(landscape([96, 120, 150], [70, 78, 92], 240, 160))).await.unwrap();
    locations::set_portrait(pool, &archives.id, &BASE64.encode(landscape([150, 90, 70], [90, 60, 50], 240, 160))).await.unwrap();
    locations::set_portrait(pool, &phare.id, &BASE64.encode(landscape([60, 80, 120], [40, 50, 60], 240, 160))).await.unwrap();
    locations::add_gallery_image(pool, &valombre.id, &BASE64.encode(landscape([180, 190, 200], [110, 120, 130], 320, 200)), Some("La baie au petit matin")).await.unwrap();
    locations::add_gallery_image(pool, &valombre.id, &BASE64.encode(landscape([200, 160, 120], [80, 70, 60], 320, 200)), Some("Le port au coucher du soleil")).await.unwrap();

    // ------------------------------------------------------------------
    // Personnages
    // ------------------------------------------------------------------
    let person = |first: &'static str, last: &'static str, role: &'static str, status: &'static str, f: BTreeMap<String, String>| async move {
        let created = characters::create_character(pool, &CharacterInput { first_name: s(first), last_name: s(last), role: s(role), status: s(status), fields: f }).await.unwrap();
        history::record(pool, "created", "character", &created.id, &format!("{first} {last}"), "").await;
        created
    };
    let lea = person(
        "Léa",
        "Morel",
        "main",
        "alive",
        fields(&[
            ("nickname", "La souris des archives"),
            ("age", "26 ans"),
            ("birthDate", "1990-03-14"),
            ("gender", "female"),
            ("occupation", "Archiviste adjointe"),
            ("origin", &quartier.id),
            ("firstAppearance", &prologue.id),
            ("description", "Petite, cheveux courts couleur d'encre, toujours un crayon derrière l'oreille. Elle parle peu mais remarque tout."),
            ("mainGoal", "Comprendre ce qui est arrivé à sa mère."),
            ("distinctiveTrait", "Elle n'oublie jamais un numéro de registre."),
            ("height", "1,58 m"),
            ("build", "slim"),
            ("eyes", "Gris pâle"),
            ("hair", "Noirs, coupés au carré"),
            ("voice", "Basse, posée, avec un léger accent du Nord"),
            ("clothingStyle", "Cardigans trop grands, gants de coton blanc"),
            ("colorPalette", r##"["#1e2a3a","#c8b79e","#b23a3a"]"##),
            ("psychology", "Méthodique jusqu'à l'obsession, elle range le monde pour ne pas avoir à le ressentir."),
            ("traits", &tags(&["Méticuleuse", "Têtue", "Discrète"])),
            ("strengths", &tags(&["Mémoire photographique", "Patience"])),
            ("flaws", &tags(&["Méfiance", "Solitude"])),
            ("motivations", "Retrouver la voix de sa mère, dont elle n'a plus aucun souvenir sonore."),
            ("deepDesire", "Appartenir à une histoire qui ne soit pas réécrite."),
            ("fears", "Oublier ce qu'elle vient de découvrir."),
            ("secret", "Elle a déjà falsifié un registre, une fois, pour protéger un voisin."),
            ("innerConflict", "La vérité ou ses propres souvenirs."),
            ("plannedArc", "De gardienne silencieuse des archives à celle qui rend la mémoire à la ville."),
        ]),
    )
    .await;
    let marc = person(
        "Marc",
        "Delaunay",
        "ally",
        "alive",
        fields(&[
            ("age", "31 ans"),
            ("gender", "male"),
            ("occupation", "Journaliste sans journal"),
            ("origin", &valombre.id),
            ("firstAppearance", &s1_2.id),
            ("description", "Grand, imperméable élimé, carnet à spirale toujours ouvert. Il rit trop fort pour quelqu'un qui a peur."),
            ("mainGoal", "Publier enfin un article vrai."),
            ("build", "athletic"),
            ("traits", &tags(&["Curieux", "Impulsif", "Loyal"])),
            ("secret", "Son enfance entière a été réécrite : il l'ignore."),
        ]),
    )
    .await;
    let ines = person(
        "Inès",
        "Castel",
        "mentor",
        "alive",
        fields(&[
            ("age", "64 ans"),
            ("gender", "female"),
            ("occupation", "Conservatrice en chef des Archives"),
            ("firstAppearance", &s1_3.id),
            ("description", "Chignon d'argent, lunettes à chaîne, une bonté sévère."),
            ("mainGoal", "Protéger Léa, quitte à lui mentir."),
            ("secret", "Elle a aidé Agathe à fuir, il y a vingt ans."),
        ]),
    )
    .await;
    let victor = person(
        "Victor",
        "Hallard",
        "antagonist",
        "alive",
        fields(&[
            ("age", "58 ans"),
            ("gender", "male"),
            ("occupation", "Maire de Valombre"),
            ("firstAppearance", &s2_2.id),
            ("description", "Costume impeccable, sourire de vitrine. Il appelle chacun par son prénom."),
            ("mainGoal", "Une ville sans douleur, donc sans mémoire."),
            ("coreValues", "L'ordre, la paix, l'oubli."),
        ]),
    )
    .await;
    let agathe = person(
        "Agathe",
        "Morel",
        "secondary",
        "missing",
        fields(&[
            ("age", "38 ans (en 1996)"),
            ("gender", "female"),
            ("occupation", "Gardienne du phare, inventrice"),
            ("firstAppearance", &prologue.id),
            ("description", "La mère de Léa. On dit qu'elle s'est noyée le soir du naufrage."),
            ("formativeEvent", "Le naufrage de 1996, qu'elle a vu venir et que personne n'a voulu croire."),
        ]),
    )
    .await;
    let theo = person("Théo", "Lanvin", "extra", "alive", fields(&[("age", "9 ans"), ("occupation", "Fils du boulanger"), ("description", "Il se souvient de tout ce que les adultes oublient.")])).await;
    let brouillon = person("Facteur", "(brouillon)", "extra", "unknown", fields(&[("notes", "Personnage abandonné à la réécriture.")])).await;

    // Le maire gouverne la ville (champ « personnage » d'un lieu).
    let mut valombre_fields = valombre.fields.clone();
    valombre_fields.insert(s("ruler"), victor.id.clone());
    locations::update_location(pool, &valombre.id, &LocationInput { name: valombre.name.clone(), kind: s("city"), parent_id: None, status: s("existing"), fields: valombre_fields }).await.unwrap();

    // Portraits et galerie.
    characters::set_portrait(pool, &lea.id, &portrait([200, 210, 225], [40, 52, 72])).await.unwrap();
    characters::set_portrait(pool, &marc.id, &portrait([215, 200, 180], [120, 80, 50])).await.unwrap();
    characters::set_portrait(pool, &ines.id, &portrait([220, 220, 210], [150, 150, 160])).await.unwrap();
    characters::set_portrait(pool, &victor.id, &portrait([190, 170, 170], [60, 30, 30])).await.unwrap();
    characters::set_portrait(pool, &agathe.id, &portrait([180, 200, 210], [70, 100, 110])).await.unwrap();
    characters::add_gallery_image(pool, &lea.id, &portrait([235, 225, 210], [178, 58, 58])).await.unwrap();
    characters::add_gallery_image(pool, &lea.id, &BASE64.encode(landscape([120, 130, 150], [60, 60, 70], 240, 160))).await.unwrap();

    // Un personnage mis à la corbeille (restaurable pendant 30 jours).
    let trash_id = characters::delete_character(pool, &brouillon.id).await.unwrap();
    history::record_deleted(pool, &trash_id).await;

    // ------------------------------------------------------------------
    // Relations et graphe
    // ------------------------------------------------------------------
    let relation = |source: &str, target: &str, kind: &str, label: &str, description: &str, directed: bool, intensity: i64, sentiment: &str, since: Option<&str>, until: Option<&str>| {
        let input = RelationInput {
            source_id: s(source),
            target_id: s(target),
            kind: s(kind),
            label: s(label),
            description: s(description),
            directed,
            intensity,
            sentiment: s(sentiment),
            since_node: since.map(s),
            until_node: until.map(s),
        };
        let label = s(label);
        async move {
            let created = relations::create_relation(pool, &input).await.unwrap();
            history::record(pool, "created", "relation", &created.id, &label, "").await;
        }
    };
    relation(&lea.id, &agathe.id, "family", "Mère et fille", "Léa n'a gardé aucun souvenir de sa voix.", false, 5, "positive", None, None).await;
    relation(&lea.id, &marc.id, "love", "Amour naissant", "Ils se sont connus enfants ; ni l'un ni l'autre ne s'en souvient.", false, 4, "positive", Some(&s1_2.id), None).await;
    relation(&ines.id, &lea.id, "mentor", "Protectrice", "Inès forme Léa et lui ment pour la protéger.", true, 4, "positive", None, None).await;
    relation(&victor.id, &lea.id, "enmity", "Menace", "Hallard veut effacer ce que Léa a découvert.", true, 5, "negative", Some(&s2_2.id), None).await;
    relation(&ines.id, &agathe.id, "secret", "Complices", "Inès a aidé Agathe à disparaître.", false, 3, "neutral", None, Some(&s4_2.id)).await;
    relation(&victor.id, &agathe.id, "betrayal", "Trahison de 1996", "Hallard a fait passer Agathe pour morte.", true, 5, "negative", None, None).await;
    relation(&marc.id, &victor.id, "rivalry", "Le journaliste et le maire", "", false, 3, "negative", Some(&s2_1.id), None).await;
    relation(&theo.id, &lea.id, "friendship", "Le petit témoin", "Théo apporte à Léa ce dont il se souvient.", true, 2, "positive", Some(&s5_1.id), None).await;
    relations::save_positions(
        pool,
        &[
            GraphPosition { character_id: lea.id.clone(), x: 0.0, y: 0.0 },
            GraphPosition { character_id: marc.id.clone(), x: 260.0, y: -40.0 },
            GraphPosition { character_id: ines.id.clone(), x: -240.0, y: -80.0 },
            GraphPosition { character_id: victor.id.clone(), x: 40.0, y: 240.0 },
            GraphPosition { character_id: agathe.id.clone(), x: -200.0, y: 200.0 },
            GraphPosition { character_id: theo.id.clone(), x: 260.0, y: 200.0 },
        ],
    )
    .await
    .unwrap();

    // Liens personnage ↔ lieu.
    let link = |character: &str, location: &str, kind: &str, label: &str, since: Option<&str>| {
        let input = CharacterLocationInput { character_id: s(character), location_id: s(location), kind: s(kind), label: s(label), description: String::new(), since_node: since.map(s), until_node: None };
        async move {
            places::create_link(pool, &input).await.unwrap();
        }
    };
    link(&lea.id, &quartier.id, "born", "", None).await;
    link(&lea.id, &archives.id, "works", "Archiviste adjointe", None).await;
    link(&marc.id, &gare.id, "frequents", "Y attend des trains qui ne partent pas", None).await;
    link(&ines.id, &archives.id, "rules", "Conservatrice en chef", None).await;
    link(&victor.id, &mairie.id, "rules", "Maire", None).await;
    link(&agathe.id, &phare.id, "hides", "Son atelier secret", None).await;
    link(&theo.id, &quartier.id, "lives", "Au-dessus de la boulangerie", None).await;

    // ------------------------------------------------------------------
    // Personnages et lieux des éléments du découpage
    // ------------------------------------------------------------------
    for (n, c, role) in [
        (&prologue, &lea, "pov"),
        (&prologue, &agathe, "present"),
        (&s1_1, &lea, "pov"),
        (&s1_1, &agathe, "mentioned"),
        (&s1_2, &marc, "pov"),
        (&s1_2, &lea, "present"),
        (&s1_3, &lea, "pov"),
        (&s1_3, &ines, "present"),
        (&s2_1, &lea, "pov"),
        (&s2_1, &marc, "present"),
        (&s2_2, &lea, "pov"),
        (&s2_2, &victor, "present"),
        (&s3_1, &lea, "pov"),
        (&s3_1, &agathe, "mentioned"),
        (&s3_2, &marc, "pov"),
        (&s4_1, &lea, "pov"),
        (&s4_1, &agathe, "mentioned"),
        (&s4_2, &ines, "pov"),
        (&s4_2, &lea, "present"),
        (&s5_1, &lea, "pov"),
        (&s5_1, &victor, "present"),
        (&s5_1, &theo, "present"),
        (&s5_2, &lea, "pov"),
        (&s5_2, &marc, "present"),
        (&s6_1, &lea, "pov"),
        (&epilogue, &lea, "pov"),
        (&epilogue, &marc, "present"),
    ] {
        links::link_character(pool, &n.id, &c.id, role).await.unwrap();
    }
    for (n, l, role) in [
        (&prologue, &phare, "setting"),
        (&s1_1, &archives, "setting"),
        (&s1_2, &gare, "setting"),
        (&s1_3, &archives, "setting"),
        (&s2_1, &bureau, "setting"),
        (&s2_2, &mairie, "setting"),
        (&s3_1, &phare, "setting"),
        (&s3_2, &ile, "setting"),
        (&s4_1, &quartier, "setting"),
        (&s4_2, &archives, "setting"),
        (&s4_2, &foret, "mentioned"),
        (&s5_1, &bureau, "setting"),
        (&s5_2, &bureau, "setting"),
        (&s6_1, &quartier, "setting"),
        (&epilogue, &valombre, "setting"),
    ] {
        links::link_location(pool, &n.id, &l.id, role).await.unwrap();
    }

    // ------------------------------------------------------------------
    // Roman : texte des scènes
    // ------------------------------------------------------------------
    let lea_m = mention_html("character", &lea.id, "Léa");
    let marc_m = mention_html("character", &marc.id, "Marc");
    let archives_m = mention_html("location", &archives.id, "Archives");
    let texts: Vec<(&StructureNode, String)> = vec![
        (&prologue, s("<p>J'avais six ans et la mer était en feu. C'est le seul souvenir que les Archives n'ont jamais réussi à me prendre : la baie de Valombre illuminée de fusées rouges, les cornes de brume qui hurlaient toutes en même temps, et ma mère debout en haut du phare, une lanterne à la main, qui faisait de grands gestes vers les bateaux.</p><p>Personne ne regardait le phare. Tout le monde regardait la mer.</p><p>Le lendemain, on m'a dit qu'elle s'était noyée. Le surlendemain, on m'a dit qu'il n'y avait jamais eu de naufrage. Le troisième jour, je ne savais plus très bien ce qu'on m'avait dit le premier.</p>")),
        (&s1_1, format!("<p>Le registre 1996-B sentait le sel et la colle de poisson. {archives_m} étaient vides à cette heure ; seule la pluie tapait contre la verrière. Je tournais les pages avec mes gants de coton, une à une, comme on m'avait appris.</p><p>Entre le mois d'octobre et le mois de novembre, il manquait trois jours. Pas une page arrachée : trois jours qui n'avaient jamais été écrits. À leur place, glissée dans la reliure, il y avait une enveloppe scellée de cire rouge.</p><p><em>Pour Agathe Morel. À n'ouvrir qu'après le jour blanc.</em></p><p>J'ai reconnu l'écriture avant de comprendre le nom. C'était celle de ma mère. Et la lettre lui était adressée à elle-même.</p>")),
        (&s1_2, format!("<p>{marc_m} observe la jeune femme qui traverse le hall de la gare, une enveloppe rouge serrée contre la poitrine. Elle marche vite, sans courir, comme quelqu'un qui a appris à ne jamais attirer l'attention.</p><p>Il la connaît. Il en est certain. Il ne sait pas d'où, ni depuis quand, mais il connaît cette manière de pencher la tête pour lire les panneaux. Elle semble le reconnaître aussi : elle ralentit, le regarde, puis détourne les yeux.</p><p>Le 7 h 40 ne partira pas encore aujourd'hui. Marc referme son carnet. Pour la première fois depuis des années, il a envie d'écrire quelque chose de vrai.</p>")),
        (&s1_3, s("<p>Inès Castel a posé ses lunettes sur le bureau, ce qui chez elle valait un cri.</p><p>— Tu ne l'ouvriras pas, Léa.</p><p>— Elle est adressée à ma mère.</p><p>— Justement. Certaines lettres sont faites pour rester fermées. Celle-ci en fait partie.</p><p>Elle a tendu la main. Je n'ai pas bougé. Pendant un long moment, nous sommes restées ainsi, de part et d'autre du bureau, et j'ai compris que pour la première fois en sept ans, Inès avait peur de moi. Ou peur pour moi. Je n'ai jamais su faire la différence.</p>")),
        (&s2_1, s("<p>L'escalier de service de la mairie descendait plus bas que les plans ne l'indiquaient. Marc tenait la lampe ; je comptais les marches. Cent douze. Au bas, une porte de fer portait une plaque de cuivre polie par les mains : <em>Bureau des oublis — Entrée réservée au personnel</em>.</p><p>Derrière, des caves voûtées s'enfilaient à perte de vue. Sur des étagères de bois, des milliers de bocaux contenaient une brume pâle qui tournait lentement sur elle-même. Chaque bocal portait une étiquette, une date, un nom.</p><p>J'ai cherché le mien sans le vouloir. Je l'ai trouvé sans le chercher.</p>")),
        (&s2_2, s("<p>Le maire Hallard m'a reçue dans son bureau sous l'horloge arrêtée. Il m'a offert un thé, m'a appelée par mon prénom, et m'a demandé des nouvelles de ma mère.</p><p>— Elle est morte en 1996, ai-je répondu.</p><p>— Vraiment ? a-t-il dit avec un sourire très doux. C'est ce dont vous vous souvenez ?</p><p>J'ai su à cet instant que la question n'en était pas une. C'était une menace, posée sur la table avec la délicatesse d'une tasse de porcelaine.</p>")),
        (&s3_1, s("<p>Il faut attendre la marée basse pour rejoindre l'île aux Mouettes à pied. J'ai marché deux milles dans la vase, les chaussures à la main, jusqu'au phare de Saint-Aubin.</p><p>La porte n'était pas fermée. En haut, sous la lanterne éteinte, l'atelier de ma mère m'attendait tel qu'elle l'avait laissé : des plans de machines épinglés aux murs, des bocaux vides, et sur la table un journal de bord ouvert à la dernière page.</p><p><em>Ils vont effacer le naufrage. Ils vont effacer les morts. Si je disparais, c'est que j'ai réussi à garder une copie.</em></p>")),
        (&s3_2, s("<p>Marc s'assoit sur les rochers pendant que Léa fouille le phare. Il tente de se rappeler son école, son premier vélo, la voix de son père. Tout est là, net et précis, trop précis : des images sans odeur, des souvenirs de catalogue.</p><p>Il comprend alors que quelqu'un a réécrit son enfance. Pas une partie. Toute. Il ne sait pas qui il était avant. Il sait seulement qu'à cet instant, la marée remonte, et qu'il doit prévenir Léa.</p>")),
        (&s5_1, s("<p>Le jour blanc commence à l'aube. Dans toute la ville, les cloches sonnent une seule fois, et les habitants sortent sur le pas de leur porte pour respirer la brume de l'oubli.</p><p>Moi, je suis sous la mairie, dans la salle des souvenirs. Théo m'a montré le chemin : les enfants connaissent tous les passages que les adultes oublient. Hallard est là, au milieu des bocaux, comme un sacristain dans sa chapelle.</p><p>— Vous ne pouvez pas leur rendre tout ça, Léa. Ils ne le supporteraient pas.</p><p>— Ce n'est pas à vous d'en décider.</p>")),
        (&s5_2, s("<p>J'ai ouvert le premier bocal. La brume s'est échappée en tourbillonnant et une femme, quelque part au-dessus de nous, a crié un prénom qu'elle n'avait pas prononcé depuis vingt ans.</p><p>Alors j'ai ouvert le deuxième. Puis tous les autres. Marc m'aidait, en pleurant sans s'en rendre compte. La ville entière s'est mise à se souvenir en même temps, et ce fut le plus grand vacarme que Valombre ait jamais connu.</p><p>Le mien était au fond, tout au fond. Je l'ai ouvert en dernier.</p>")),
        (&s6_1, s("<p>J'ai perdu le visage de ma mère. C'était le prix : un souvenir rendu pour chaque souvenir libéré, avait écrit Agathe dans son journal. Je ne sais plus comment elle était. Mais je me souviens de sa voix, maintenant. Elle chantait faux, et elle riait de chanter faux.</p><p>C'est assez. C'est même beaucoup.</p>")),
        (&epilogue, format!("<p>Un an plus tard, la brume s'est levée sur Valombre pour la première fois depuis un siècle. Le 7 h 40 est parti à l'heure. {lea_m} a repris son poste aux Archives, qui conservent désormais la mémoire de la ville au lieu de la fabriquer.</p><p>Chaque matin, en ouvrant le premier registre, elle laisse la fenêtre entrouverte. On ne sait jamais : certains souvenirs mettent du temps à rentrer.</p>")),
    ];
    for (n, html) in &texts {
        history::snapshot_before(pool, "structureNode", &n.id).await;
        novel::set_content(pool, &n.id, html).await.unwrap();
        history::record(pool, "updated", "structureNode", &n.id, &n.title, "").await;
    }
    // Une version nommée, puis une réécriture.
    history::create_named_version(pool, "structureNode", &s1_1.id, "Premier jet").await.unwrap();
    let revised = format!("{}<p>Dehors, la corne de brume a sonné deux fois. À Valombre, cela veut dire qu'un bateau rentre, ou qu'un souvenir s'en va.</p>", texts[1].1);
    novel::set_content(pool, &s1_1.id, &revised).await.unwrap();

    // Textes tirés des documents (scènes sans texte dans leur fiche).
    let letter = docx(&[
        "Ma Léa,",
        "Si tu lis ceci, c'est que le jour blanc est passé et que tu te souviens encore de moi. Alors ils n'ont pas tout pris.",
        "Je ne me suis pas noyée. Je me suis cachée dans la seule chose qu'ils n'archivent jamais : les souvenirs des enfants. Cherche Théo, le fils du boulanger. Il ne sait pas qu'il me garde.",
        "Je t'aime d'une mémoire que personne ne pourra mettre en bocal.",
        "Agathe",
    ]);
    documents::add(pool, &s4_1.id, "Lettre d'Agathe.docx", &letter).await.unwrap();
    documents::add(
        pool,
        &s4_2.id,
        "Aveux d'Inès.md",
        "# Aveux d'Inès\n\nInès a refermé la porte de la salle de lecture et s'est assise sans allumer la lampe.\n\n— C'est moi qui l'ai fait passer de l'autre côté de la forêt de Vire. Ta mère savait ce que Hallard préparait. Elle voulait que tu grandisses *loin de tout ça*.\n\nJe n'ai rien répondu. Il n'y avait rien à répondre. Pour la première fois, Inès m'a semblé **vieille**.\n".as_bytes(),
    )
    .await
    .unwrap();

    // Documents de travail : recherches (avec une version précédente), planche d'ambiance.
    let research = documents::add(pool, &part2.id, "Plan de Valombre - notes.txt", "Rue des Harengs : boulangerie Morel.\nRue du Sel : Archives.\n".as_bytes()).await.unwrap();
    documents::replace_content(
        pool,
        &research.id,
        "Rue des Harengs : boulangerie Morel (volets bleus).\nRue du Sel : Archives municipales, entrée des livraisons côté quai.\nPlace de l'Horloge : mairie, escalier de service à gauche.\nMarée basse : 2 h de passage vers l'île aux Mouettes.\n".as_bytes(),
        None,
    )
    .await
    .unwrap();
    documents::set_note(pool, &research.id, "Repères pour garder la géographie cohérente.").await.unwrap();
    documents::add(pool, &ch1.id, "Planche d'ambiance.png", &landscape([120, 135, 160], [50, 55, 65], 480, 300)).await.unwrap();

    // ------------------------------------------------------------------
    // Roman : objectifs, états de rédaction, narration, dossier éditorial
    // ------------------------------------------------------------------
    let set = |n: &StructureNode, goal: Option<i64>, status: Option<&str>, person: Option<&str>, tense: Option<&str>| {
        let id = n.id.clone();
        let f = NovelFields { word_goal: goal, writing_status: status.map(s), narrative_person: person.map(s), narrative_tense: tense.map(s) };
        async move {
            novel::set_fields(pool, &id, f).await.unwrap();
        }
    };
    set(&part1, Some(30_000), None, None, None).await;
    set(&part2, Some(30_000), None, None, None).await;
    set(&part3, Some(30_000), None, None, None).await;
    set(&prologue, Some(1_500), Some("corrected"), Some("first"), Some("past")).await;
    set(&ch1, Some(9_000), Some("proofread"), None, None).await;
    set(&ch2, Some(9_000), Some("revision"), None, None).await;
    set(&ch3, Some(9_000), Some("draft"), None, None).await;
    set(&ch4, Some(9_000), Some("draft"), None, None).await;
    set(&ch5, Some(9_000), Some("revision"), None, None).await;
    set(&ch6, Some(6_000), Some("todo"), None, None).await;
    set(&epilogue, Some(1_500), Some("draft"), Some("third"), Some("present")).await;
    for n in [&s1_1, &s1_3, &s2_1, &s2_2, &s3_1, &s4_1, &s5_1, &s5_2, &s6_1] {
        set(n, Some(3_000), None, Some("first"), Some("past")).await;
    }
    // Les scènes du point de vue de Marc : 3e personne, présent (changement voulu, signalé).
    set(&s1_2, Some(3_000), None, Some("third"), Some("present")).await;
    set(&s3_2, Some(3_000), None, Some("third"), Some("present")).await;
    set(&s4_2, Some(3_000), None, Some("first"), Some("past")).await;
    novel::set_manuscript_goal(pool, Some(90_000)).await.unwrap();
    novel::set_daily_goal(pool, Some(800)).await.unwrap();

    novel::update_editorial(
        pool,
        EditorialUpdate {
            pitch: Some(s("Lorsqu'une jeune archiviste découvre que les souvenirs de sa ville sont falsifiés, elle doit rendre la mémoire aux habitants avant le « jour blanc » — au prix de ses propres souvenirs.")),
            summary_short: Some(s("À Valombre, ville noyée de brume, Léa Morel classe les registres des Archives municipales. Une lettre scellée, adressée à sa mère disparue, lui révèle que les archives ne conservent pas la mémoire de la ville : elles la fabriquent. Avec Marc, journaliste sans journal, elle découvre le Bureau des oublis où le maire fait mettre en bocaux les souvenirs des habitants. Le jour du grand nettoyage, Léa devra choisir entre la vérité de tous et ses propres souvenirs.")),
            summary_long: Some(s("Valombre, port du Nord. Depuis le naufrage de 1996, la ville vit dans un présent sans douleur, et personne ne se souvient de rien de grave.\n\nLéa Morel, 26 ans, archiviste adjointe, trouve dans un registre de 1996 une lettre scellée adressée à sa mère Agathe, déclarée noyée le soir du naufrage. Sa supérieure, Inès Castel, lui interdit de l'ouvrir. À la gare, Marc Delaunay, journaliste, croise Léa et la reconnaît sans savoir d'où.\n\nEnsemble, ils découvrent sous la mairie le Bureau des oublis : des milliers de bocaux où l'on conserve les souvenirs retirés aux habitants. Le maire Victor Hallard reçoit Léa et lui fait comprendre qu'il sait tout de sa mère.\n\nAu phare de Saint-Aubin, Léa retrouve le journal d'Agathe : sa mère n'est pas morte, elle s'est cachée dans la mémoire d'un enfant, Théo, le fils du boulanger. Marc comprend que toute son enfance a été réécrite. Inès avoue avoir aidé Agathe à fuir.\n\nLe jour blanc, Hallard prévoit d'effacer la ville entière. Guidée par Théo, Léa atteint la salle des souvenirs et ouvre tous les bocaux : Valombre se souvient. Le prix est celui qu'avait prévu Agathe : Léa perd le visage de sa mère, mais retrouve sa voix.\n\nUn an plus tard, la brume se lève sur Valombre, et les Archives conservent enfin la mémoire au lieu de la fabriquer.")),
        },
    )
    .await
    .unwrap();
    history::record(pool, "updated", "editorial", "default", "", "").await;

    // ------------------------------------------------------------------
    // Notes, dossiers, post-it, notes système
    // ------------------------------------------------------------------
    let research_folder = notes::create_folder(pool, None, "Recherches").await.unwrap();
    let archives_folder = notes::create_folder(pool, Some(&research_folder.id), "Archivistique").await.unwrap();
    let people_folder = notes::create_folder(pool, None, "Personnages").await.unwrap();
    let ideas_folder = notes::create_folder(pool, None, "Idées en vrac").await.unwrap();

    let rules_note = note(
        pool,
        Some(&research_folder.id),
        "Règles de la mémoire",
        doc(vec![
            heading(2, "Ce qu'on peut effacer"),
            para(vec![text("Un souvenir retiré devient une "), bold("brume"), text(" que l'on peut conserver en bocal. Il ne disparaît pas : il "), italic("attend"), text(".")]),
            bullets(&["Les souvenirs d'enfants résistent mieux.", "Un souvenir libéré en emporte un autre (règle du prix).", "La brume de l'oubli se respire le jour blanc."]),
            heading(2, "Ce qu'on ne peut pas effacer"),
            numbered(&["Les voix (elles reviennent toujours en dernier).", "Les odeurs liées à la mer.", "Ce qui a été écrit à la main par la personne elle-même."]),
            quote("« Une ville sans mémoire est une ville sans douleur. » — V. Hallard, discours d'investiture"),
        ]),
        "Un souvenir retiré devient une brume que l'on peut conserver en bocal.",
        true,
    )
    .await;
    note(
        pool,
        Some(&archives_folder.id),
        "Vocabulaire de l'archiviste",
        doc(vec![para(vec![bold("Cote"), text(" : adresse d'un document dans le dépôt.")]), para(vec![bold("Versement"), text(" : arrivée d'un lot de documents.")]), para(vec![bold("Lacune"), text(" : période sans document — les trois jours manquants de 1996.")])]),
        "Cote, versement, lacune.",
        false,
    )
    .await;
    note(
        pool,
        Some(&people_folder.id),
        "Léa et Marc : ce qu'ils ont oublié",
        doc(vec![
            para(vec![mention("character", &lea.id, "Léa Morel"), text(" et "), mention("character", &marc.id, "Marc Delaunay"), text(" étaient dans la même classe en 1996. Ils jouaient au "), mention("location", &phare.id, "phare de Saint-Aubin"), text(" le mercredi.")]),
            para(vec![text("Révélation prévue au chapitre 5, quand Léa ouvre le bocal de Marc par erreur.")]),
        ]),
        "Léa et Marc étaient dans la même classe en 1996.",
        false,
    )
    .await;
    note(
        pool,
        Some(&ideas_folder.id),
        "Pistes pour une suite",
        doc(vec![bullets(&["Les autres villes du littoral ont-elles leur Bureau ?", "Que devient Hallard sans mémoire ?", "Théo adulte, archiviste à son tour."])]),
        "Les autres villes du littoral ont-elles leur Bureau ?",
        false,
    )
    .await;

    let sticky = |text: &'static str, color: &'static str, x: f64, y: f64| async move {
        let created = notes::create_sticky(pool, color, x, y).await.unwrap();
        notes::update_sticky(pool, &created.id, &StickyUpdate { text: Some(s(text)), color: None, x: None, y: None, width: None, height: None, z: None }).await.unwrap();
        created.id
    };
    sticky("Et si l'horloge de la mairie s'était arrêtée à l'heure exacte du naufrage ?", "yellow", 40.0, 40.0).await;
    sticky("Motif récurrent : la cire rouge", "pink", 300.0, 60.0).await;
    sticky("Scène à écrire : Théo raconte le phare", "green", 80.0, 260.0).await;
    sticky("Vérifier les horaires des marées", "blue", 340.0, 280.0).await;
    sticky("Titre alternatif : « Le jour blanc »", "purple", 600.0, 120.0).await;
    let discarded = sticky("Idée abandonnée : un chat narrateur", "orange", 620.0, 320.0).await;
    let sticky_trash = notes::delete_sticky(pool, &discarded).await.unwrap();
    history::record_deleted(pool, &sticky_trash).await;

    // Notes système : descriptions et résumés des fiches, modifiables depuis les notes.
    system_note_service::set_enabled(pool, ProjectType::Novel, true, "fr").await.unwrap();
    system_note_service::sync(pool, ProjectType::Novel, Some("fr")).await.unwrap();

    // ------------------------------------------------------------------
    // Trame : intrigues parallèles, passé narratif, liens, mystères
    // ------------------------------------------------------------------
    let ev = |id: &str, lane: &str, row: i64, title: &str, note: &str, extra: Value| {
        let mut base = json!({
            "id": id, "laneId": lane, "row": row, "title": title, "note": note, "pivot": false, "status": "draft",
            "tags": [], "characterIds": [], "povId": null, "locationId": null, "nodeId": null, "alsoNodeIds": [],
            "noteIds": [], "date": "", "words": 0
        });
        for (k, v) in extra.as_object().unwrap() {
            base[k] = v.clone();
        }
        base
    };
    let plot = json!({
        "version": 1,
        "lanes": [
            { "id": "enquete", "name": "L'enquête de Léa", "color": "#2b7de9", "main": true, "hidden": false, "characterId": lea.id },
            { "id": "marc", "name": "Marc", "color": "#1fa37a", "main": false, "hidden": false, "characterId": marc.id },
            { "id": "complot", "name": "Le complot Hallard", "color": "#e0483d", "main": false, "hidden": false, "characterId": victor.id },
            { "id": "agathe", "name": "Le passé d'Agathe", "color": "#e3a21a", "main": false, "hidden": false, "characterId": agathe.id }
        ],
        "events": [
            // Passé narratif (avant le début de l'histoire).
            ev("p1", "agathe", -3, "Agathe voit venir le naufrage", "Elle prévient la capitainerie ; personne ne la croit.", json!({ "date": "1996-10-28", "locationId": phare.id, "characterIds": [agathe.id], "tags": ["flash-back"], "status": "written" })),
            ev("p2", "complot", -2, "Hallard fait effacer le naufrage", "Première grande distillation de souvenirs.", json!({ "date": "1996-10-31", "locationId": bureau.id, "characterIds": [victor.id], "tags": ["flash-back"], "pivot": true, "status": "written" })),
            ev("p3", "agathe", -1, "Agathe disparaît", "Inès l'aide à passer la forêt de Vire.", json!({ "date": "1996-11-02", "locationId": foret.id, "characterIds": [agathe.id, ines.id], "tags": ["flash-back", "secret"], "nodeId": prologue.id, "status": "revised" })),
            // Histoire principale.
            ev("e1", "enquete", 0, "La lettre rouge", "Léa trouve la lettre scellée dans le registre 1996-B.", json!({ "nodeId": s1_1.id, "characterIds": [lea.id], "povId": lea.id, "locationId": archives.id, "pivot": true, "status": "revised", "words": 1800, "noteIds": [rules_note] })),
            ev("m1", "marc", 1, "Marc reconnaît Léa", "À la gare, il la reconnaît sans savoir d'où.", json!({ "nodeId": s1_2.id, "characterIds": [marc.id, lea.id], "povId": marc.id, "locationId": gare.id, "status": "written", "words": 1500 })),
            ev("e2", "enquete", 2, "L'interdit d'Inès", "Inès refuse que Léa ouvre la lettre.", json!({ "nodeId": s1_3.id, "characterIds": [lea.id, ines.id], "povId": lea.id, "locationId": archives.id, "status": "written", "words": 1400 })),
            ev("e3", "enquete", 3, "La descente au Bureau", "Cent douze marches et des milliers de bocaux.", json!({ "nodeId": s2_1.id, "characterIds": [lea.id, marc.id], "povId": lea.id, "locationId": bureau.id, "status": "draft", "words": 2100 })),
            ev("c1", "complot", 4, "Hallard menace Léa", "« C'est ce dont vous vous souvenez ? »", json!({ "nodeId": s2_2.id, "characterIds": [victor.id, lea.id], "povId": lea.id, "locationId": mairie.id, "status": "draft", "tags": ["menace"] })),
            ev("e4", "enquete", 5, "Le journal de bord", "Agathe a gardé une copie.", json!({ "nodeId": s3_1.id, "characterIds": [lea.id], "povId": lea.id, "locationId": phare.id, "status": "draft", "pivot": true })),
            ev("m2", "marc", 6, "L'enfance réécrite", "Marc comprend que ses souvenirs sont faux.", json!({ "nodeId": s3_2.id, "characterIds": [marc.id], "povId": marc.id, "locationId": ile.id, "status": "idea" })),
            ev("e5", "enquete", 7, "La lettre d'Agathe", "Agathe s'est cachée dans la mémoire de Théo.", json!({ "nodeId": s4_1.id, "alsoNodeIds": [s6_1.id], "characterIds": [lea.id, agathe.id, theo.id], "povId": lea.id, "locationId": quartier.id, "status": "draft", "tags": ["révélation"] })),
            ev("e6", "enquete", 8, "Les aveux d'Inès", "« C'est moi qui l'ai fait passer. »", json!({ "nodeId": s4_2.id, "characterIds": [ines.id, lea.id], "povId": ines.id, "locationId": archives.id, "status": "idea" })),
            ev("c2", "complot", 9, "Le jour blanc est décrété", "Toute la ville respirera la brume de l'oubli.", json!({ "characterIds": [victor.id], "locationId": mairie.id, "status": "idea", "date": "Un an après la lettre" })),
            ev("e7", "enquete", 10, "La salle des souvenirs", "Théo guide Léa ; face-à-face avec Hallard.", json!({ "nodeId": s5_1.id, "characterIds": [lea.id, victor.id, theo.id], "povId": lea.id, "locationId": bureau.id, "status": "draft" })),
            ev("e8", "enquete", 11, "Valombre se souvient", "Léa ouvre tous les bocaux.", json!({ "nodeId": s5_2.id, "characterIds": [lea.id, marc.id], "povId": lea.id, "locationId": bureau.id, "pivot": true, "status": "draft" })),
            ev("m3", "marc", 11, "Marc retrouve son nom", "Son vrai prénom lui revient : Martin.", json!({ "characterIds": [marc.id], "locationId": bureau.id, "status": "idea" })),
            ev("e9", "enquete", 12, "Le prix", "Léa perd le visage de sa mère, garde sa voix.", json!({ "nodeId": s6_1.id, "characterIds": [lea.id], "povId": lea.id, "locationId": quartier.id, "status": "idea" }))
        ],
        "links": [
            { "id": "k1", "from": "p1", "to": "p2", "kind": "impact", "label": "le naufrage", "note": "Hallard profite de la catastrophe." },
            { "id": "k2", "from": "p2", "to": "p3", "kind": "impact", "label": "fuite", "note": "" },
            { "id": "k3", "from": "p3", "to": "e1", "kind": "influence", "label": "la lettre", "note": "Agathe a laissé la lettre pour Léa." },
            { "id": "k4", "from": "e1", "to": "m1", "kind": "meeting", "label": "", "note": "" },
            { "id": "k5", "from": "e3", "to": "c1", "kind": "impact", "label": "repérée", "note": "Hallard sait que Léa est descendue." },
            { "id": "k6", "from": "e4", "to": "e5", "kind": "influence", "label": "", "note": "" },
            { "id": "k7", "from": "c2", "to": "e7", "kind": "impact", "label": "urgence", "note": "Le jour blanc oblige Léa à agir." },
            { "id": "k8", "from": "e8", "to": "m3", "kind": "meeting", "label": "", "note": "" },
            { "id": "k9", "from": "m2", "to": "m3", "kind": "influence", "label": "", "note": "" }
        ],
        "rowLabels": { "-3": "28 octobre 1996", "-1": "2 novembre 1996", "0": "Lundi, 7 h", "11": "Le jour blanc" },
        "acts": { "0": "Acte I — La lettre", "5": "Acte II — La mémoire des autres", "9": "Acte III — Le jour blanc" },
        "tension": { "-2": 7, "0": 3, "2": 4, "3": 6, "4": 7, "5": 5, "7": 6, "8": 5, "9": 8, "10": 9, "11": 10, "12": 4 },
        "readingOrder": [],
        "readingFollowsStructure": true,
        "questions": [
            { "id": "q1", "text": "Pourquoi la lettre est-elle adressée à Agathe elle-même ?", "done": true, "eventId": "e5" },
            { "id": "q2", "text": "Que devient Hallard après le jour blanc ?", "done": false, "eventId": null }
        ],
        "mysteries": [
            { "id": "y1", "question": "Agathe est-elle vraiment morte ?", "status": "solved", "answer": "Non : elle s'est cachée dans la mémoire de Théo.", "payoff": "Révélé par la lettre (chapitre 4).", "payoffEventId": "e5" },
            { "id": "y2", "question": "Qui était Marc avant 1996 ?", "status": "open", "answer": "", "payoff": "", "payoffEventId": null }
        ],
        "clues": [
            { "id": "i1", "text": "Trois jours manquent dans le registre 1996-B.", "eventId": "e1", "mysteryId": "y1" },
            { "id": "i2", "text": "Le journal : « Si je disparais, c'est que j'ai réussi. »", "eventId": "e4", "mysteryId": "y1" },
            { "id": "i3", "text": "Marc reconnaît Léa sans savoir d'où.", "eventId": "m1", "mysteryId": "y2" }
        ],
        "goal": 90000,
        "templates": [{ "id": "t1", "name": "Structure Valombre", "steps": ["La lettre", "La descente", "Le phare", "La révélation", "Le jour blanc", "Le prix"] }],
        "sceneOrder": {}
    });
    history::snapshot_before(pool, "plot", "default").await;
    plot_service::save(pool, &plot.to_string()).await.unwrap();
    history::record(pool, "updated", "plot", "default", "", "").await;

    // ------------------------------------------------------------------
    // Rythme de travail : deux mois de séances d'écriture
    // ------------------------------------------------------------------
    let today = chrono::Local::now().date_naive();
    for offset in 0..60i64 {
        // Une séance quatre jours sur cinq, plus longue le week-end.
        if offset % 5 == 3 {
            continue;
        }
        let day = today - chrono::Duration::days(offset);
        let weekend = matches!(chrono::Datelike::weekday(&day), chrono::Weekday::Sat | chrono::Weekday::Sun);
        let minutes = if weekend { 95 + (offset * 7) % 60 } else { 25 + (offset * 13) % 50 };
        // Mots écrits : environ 20 par minute, objectif de 800 souvent atteint.
        let words = if offset == 0 { 420 } else { minutes * 18 + (offset * 37) % 260 };
        sqlx::query(
            "INSERT INTO work_days (day, actions, minutes, last_minute, words) VALUES (?, ?, ?, '', ?) \
             ON CONFLICT(day) DO UPDATE SET actions = excluded.actions, minutes = excluded.minutes, words = excluded.words",
        )
        .bind(day.format("%Y-%m-%d").to_string())
        .bind(minutes / 2 + 3)
        .bind(minutes)
        .bind(words)
        .execute(pool)
        .await
        .unwrap();
    }

    // ------------------------------------------------------------------
    // Vérifications
    // ------------------------------------------------------------------
    let manuscript = novel::manuscript_contents(pool).await.unwrap();
    let words: i64 = manuscript.iter().map(|c| novel::count_words(&c.content)).sum();
    let tree = structure::get_structure(pool, ProjectType::Novel).await.unwrap();
    assert_eq!(tree.manuscript_goal, Some(90_000));
    assert_eq!(tree.nodes.len(), 23, "découpage incomplet");
    assert_eq!(characters::list_characters(pool).await.unwrap().len(), 6);
    assert!(locations::list_locations(pool).await.unwrap().len() >= 9);
    assert_eq!(relations::list_relations(pool).await.unwrap().len(), 8);
    assert!(!plot_service::get(pool).await.unwrap().data.is_empty());
    assert!(novel::get_editorial(pool).await.unwrap().pitch.starts_with("Lorsqu'une"));
    let visible = project_service::list_for_viewer(&app_db, &Viewer::Guest).await.unwrap();
    assert!(visible.iter().any(|p| p.id == project.id), "le projet doit être public (visible sans compte)");

    pool.close().await;
    app_db.close().await;

    println!();
    println!("Projet public « {} » prêt.", project.name);
    println!("  {} éléments du découpage, {} scènes avec texte ({} mots), 6 personnages, 9 lieux, 8 relations,", tree.nodes.len(), manuscript.len(), words);
    println!("  trame (17 événements dont 3 dans le passé narratif), notes, post-it, documents, dossier éditorial.");
    println!("Ouvrez GANIS, cliquez sur « Commencer » : le projet est dans l'espace public.");
}
