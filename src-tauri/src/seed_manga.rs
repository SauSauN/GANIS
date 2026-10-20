//! Projet de démonstration : un manga complet, créé de fond en comble.
//!
//! « Kōmori, la cité des lanternes » — une livreuse de lanternes découvre
//! qu'un esprit-renard est enfermé dans la lanterne qu'elle doit livrer.
//! Toutes les données sont imaginaires.
//!
//! Ce test crée un **projet public** (ouvrable sans compte, bouton
//! « Commencer ») dans le dossier de données de GANIS, en passant par les
//! mêmes services que l'application. Il exploite les fonctionnalités d'un
//! projet Manga / BD :
//!
//! - projet : type Manga, statut, favori, description ;
//! - synopsis (genres, sous-genres, ton) et une version nommée ;
//! - personnages : fiches avancées, listes personnalisées, portraits,
//!   galerie, un personnage mis à la corbeille ;
//! - lieux : types personnalisés, hiérarchie, fiches, portraits, galerie ;
//! - relations (types, intensité, tonalité, période), graphe, liens
//!   personnage ↔ lieu ;
//! - découpage Tome › Chapitre › Page, prologue hors numérotation,
//!   personnages et lieux liés aux pages ;
//! - scénario : objectif narratif, pages visées et statut de chaque
//!   chapitre ; fonction narrative et « tourné de page » des pages ; cases
//!   avec action, cadrage, décor, indications au dessinateur, rythme, lieu,
//!   moment, continuité, personnages présents avec leur état, textes typés
//!   (dialogue, pensée, récitatif, onomatopée, texte du décor) ;
//! - seuils d'alerte du volume de texte (une case les dépasse exprès) ;
//! - continuité : l'écharpe d'Aya change d'état, avec une erreur volontaire
//!   au chapitre 2 que la vue Continuité signale ;
//! - suivi : chapitres finis, en relecture, en cours et à préparer ;
//! - documents rangés dans le découpage (Word, Markdown, images) ;
//! - trame : intrigues parallèles, passé (moments négatifs), événements
//!   reliés aux pages, liens, actes, tension, mystères et indices ;
//! - notes, dossiers, post-it, notes système, historique, rythme de travail.
//!
//! ## Lancer
//!
//! **Fermez GANIS d'abord**, puis, dans le dossier `src-tauri` :
//!
//! ```text
//! cargo test --lib seed_public_manga -- --ignored --nocapture
//! ```
//!
//! (ou `npm run seed:manga` depuis la racine du projet).
//!
//! Même dossier de données que `seed_novel.rs` (variable `GANIS_DATA_DIR`
//! pour en choisir un autre). Chaque lancement crée un nouveau projet.

use std::collections::BTreeMap;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::db;
use crate::models::project::{ProjectStatus, ProjectType};
use crate::seed_novel::{bold, bullets, data_dir, doc, docx, fields, heading, italic, landscape, mention, note, numbered, para, portrait, quote, s, tags, text};
use crate::services::character_location_service::{self as places, CharacterLocationInput};
use crate::services::character_service::{self as characters, CharacterInput};
use crate::services::document_service as documents;
use crate::services::history_service as history;
use crate::services::location_service::{self as locations, CustomTypeInput, LocationInput};
use crate::services::manga_service::{self as manga, ChapterFields, MangaSettings, PageScriptInput, PanelCharacter, PanelInput, TextInput};
use crate::services::note_service::{self as notes, StickyUpdate};
use crate::services::relation_service::{self as relations, GraphPosition, RelationInput};
use crate::services::structure_link_service as links;
use crate::services::structure_service::{self as structure, StructureNode};
use crate::services::{plot_service, project_service, project_storage, synopsis_service, system_note_service};
use crate::state::{AppState, Viewer};

// ----------------------------------------------------------------------------
// Textes et cases
// ----------------------------------------------------------------------------

fn say(kind: &str, speaker: Option<&str>, content: &str) -> TextInput {
    TextInput { id: None, kind: s(kind), character_id: speaker.map(s), content: s(content) }
}
/// Dialogue (bulle).
fn d(speaker: &str, content: &str) -> TextInput {
    say("dialogue", Some(speaker), content)
}
/// Pensée.
fn th(speaker: &str, content: &str) -> TextInput {
    say("thought", Some(speaker), content)
}
/// Récitatif.
fn nar(content: &str) -> TextInput {
    say("narration", None, content)
}
/// Onomatopée.
fn sfx(content: &str) -> TextInput {
    say("sfx", None, content)
}
/// Texte du décor (panneau, étiquette, photo…).
fn sign(content: &str) -> TextInput {
    say("sign", None, content)
}

/// Une case. `cast` : personnages présents et leur état de continuité.
#[allow(clippy::too_many_arguments)]
fn panel(
    action: &str,
    framing: &str,
    rhythm: Option<&str>,
    location: &str,
    moment: &str,
    setting: &str,
    artist_notes: &str,
    continuity: &str,
    cast: &[(&str, &str)],
    texts: Vec<TextInput>,
) -> PanelInput {
    PanelInput {
        id: None,
        action: s(action),
        framing: s(framing),
        setting: s(setting),
        artist_notes: s(artist_notes),
        rhythm: rhythm.map(s),
        location_id: Some(s(location)).filter(|l| !l.is_empty()),
        moment: s(moment),
        continuity: s(continuity),
        characters: cast.iter().map(|(id, state)| PanelCharacter { character_id: s(id), state: s(state) }).collect(),
        texts,
    }
}

/// Enregistre le scénario d'une page et la lie à ses personnages et lieux.
async fn page(pool: &SqlitePool, node: &StructureNode, label: &str, rhythm: &str, turn: bool, panels: Vec<PanelInput>) -> usize {
    let mut cast: Vec<String> = Vec::new();
    let mut places: Vec<String> = Vec::new();
    for p in &panels {
        for c in &p.characters {
            if !cast.contains(&c.character_id) {
                cast.push(c.character_id.clone());
            }
        }
        for t in &p.texts {
            if let Some(id) = &t.character_id {
                if !cast.contains(id) {
                    cast.push(id.clone());
                }
            }
        }
        if let Some(l) = &p.location_id {
            if !places.contains(l) {
                places.push(l.clone());
            }
        }
    }
    let count = panels.len();
    history::snapshot_before(pool, "structureNode", &node.id).await;
    manga::save_page_script(pool, &node.id, &PageScriptInput { rhythm: Some(s(rhythm)), page_turn: turn, panels, page_label: s(label) }).await.unwrap();
    history::record(pool, "updated", "structureNode", &node.id, label, "").await;
    for (index, id) in cast.iter().enumerate() {
        links::link_character(pool, &node.id, id, if index == 0 { "pov" } else { "present" }).await.unwrap();
    }
    for id in &places {
        links::link_location(pool, &node.id, id, "setting").await.unwrap();
    }
    count
}

// ----------------------------------------------------------------------------
// Le test
// ----------------------------------------------------------------------------

#[tokio::test(flavor = "current_thread")]
#[ignore = "crée un projet dans le dossier de données de GANIS ; à lancer à la main"]
async fn seed_public_manga() {
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
        "Kōmori, la cité des lanternes",
        "Manga de démonstration : une livreuse de lanternes découvre un esprit-renard dans la lanterne qu'elle doit livrer.",
        ProjectType::Manga,
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
        "<p>Kōmori est une cité suspendue à des milliers de câbles au-dessus d'une mer de nuages. Ce sont ses lanternes qui la maintiennent dans le ciel. <strong>Aya Tsukishima</strong>, seize ans, les livre de toit en toit pour l'atelier du vieux maître Oba.</p><p>Un soir, Oba lui confie une lanterne bleue à porter au Sanctuaire abandonné, sans jamais l'ouvrir. Poursuivie par la Garde du Ciel, Aya découvre qu'un esprit-renard, <em>Kitsu</em>, est enfermé dans la flamme.</p><p>Si la Lanterne-Mère, éteinte dix ans plus tôt par la Commandante Kuroe, n'est pas rallumée avant la nuit sans lune, Kōmori tombera dans les nuages.</p>",
        &[s("Shōnen"), s("Fantasy")],
        &[s("Steampunk"), s("Aventure")],
        &[s("Lumineux"), s("Épique"), s("Mélancolique")],
    )
    .await
    .unwrap();
    history::snapshot_before(pool, "synopsis", "default").await;
    history::create_named_version(pool, "synopsis", "default", "Synopsis envoyé à l'éditeur").await.unwrap();

    // ------------------------------------------------------------------
    // Réglages des personnages, des lieux et du scénario
    // ------------------------------------------------------------------
    characters::set_detail_level(pool, "advanced").await.unwrap();
    characters::set_list(pool, "role", Some(&["main", "secondary", "antagonist", "mentor", "ally", "extra", "Esprit"].map(s))).await.unwrap();
    characters::set_list(pool, "status", Some(&["alive", "dead", "missing", "transformed", "newIdentity", "unknown", "Enfermé"].map(s))).await.unwrap();
    locations::set_detail_level(pool, "advanced").await.unwrap();
    let settings = locations::set_custom_types(
        pool,
        &[
            CustomTypeInput { id: None, name: s("Atelier"), category: s("built") },
            CustomTypeInput { id: None, name: s("Station de câbles"), category: s("built") },
        ],
    )
    .await
    .unwrap();
    let workshop_type = settings.custom_types.iter().find(|t| t.name == "Atelier").unwrap().id.clone();
    let station_type = settings.custom_types.iter().find(|t| t.name == "Station de câbles").unwrap().id.clone();
    // Seuils un peu plus stricts que ceux par défaut (35 / 150 mots).
    manga::set_settings(pool, &MangaSettings { panel_words_max: Some(30), page_words_max: Some(120) }).await.unwrap();

    // ------------------------------------------------------------------
    // Découpage : Tome › Chapitre › Page (modèle Manga)
    // ------------------------------------------------------------------
    structure::set_auto_numbering(pool, ProjectType::Manga, true).await.unwrap();
    let node = |parent: Option<String>, level: i64, title: &'static str| {
        let parent = parent.clone();
        async move { structure::create_node(pool, ProjectType::Manga, parent.as_deref(), level, title, None).await.unwrap() }
    };

    let tome1 = node(None, 0, "La lanterne bleue").await;
    let prologue = node(Some(tome1.id.clone()), 1, "Prologue").await;
    structure::update_node(pool, &prologue.id, None, None, Some(false), None).await.unwrap();
    let pr_1 = node(Some(prologue.id.clone()), 2, "").await;
    let ch1 = node(Some(tome1.id.clone()), 1, "Livraison de nuit").await;
    let c1: Vec<StructureNode> = {
        let mut out = Vec::new();
        for _ in 0..5 {
            out.push(node(Some(ch1.id.clone()), 2, "").await);
        }
        out
    };
    let ch2 = node(Some(tome1.id.clone()), 1, "Le renard dans la lanterne").await;
    let c2: Vec<StructureNode> = {
        let mut out = Vec::new();
        for _ in 0..4 {
            out.push(node(Some(ch2.id.clone()), 2, "").await);
        }
        out
    };
    let tome2 = node(None, 0, "La Garde du Ciel").await;
    let ch3 = node(Some(tome2.id.clone()), 1, "Le masque de fer").await;
    let c3: Vec<StructureNode> = {
        let mut out = Vec::new();
        for _ in 0..3 {
            out.push(node(Some(ch3.id.clone()), 2, "").await);
        }
        out
    };
    let ch4 = node(Some(tome2.id.clone()), 1, "Sous les nuages").await;

    let summaries: Vec<(&StructureNode, &str)> = vec![
        (&tome1, "Aya reçoit la lanterne bleue et rencontre Kitsu."),
        (&prologue, "Le mythe de la lanterne tombée."),
        (&pr_1, "La nuit où la lanterne bleue est tombée dans les nuages."),
        (&ch1, "Une livraison ordinaire qui tourne à la course-poursuite."),
        (&c1[0], "Aya court sur les câbles et livre une cliente."),
        (&c1[1], "Oba confie la lanterne bleue à Aya."),
        (&c1[2], "Contrôle de la Garde au marché flottant."),
        (&c1[3], "Aya saute ; Ren la reconnaît."),
        (&c1[4], "La lanterne parle."),
        (&ch2, "Kitsu raconte l'extinction de la Lanterne-Mère."),
        (&c2[0], "Présentations dans la ruelle."),
        (&c2[1], "Flash-back : Kuroe éteint la Lanterne-Mère."),
        (&c2[2], "La menace : Kōmori va tomber."),
        (&c2[3], "Hana malade ; Ren à la fenêtre."),
        (&tome2, "La Garde se lance sur la piste d'Aya."),
        (&ch3, "Ren reçoit l'ordre de ramener la lanterne."),
        (&c3[0], "Les ordres de la Commandante."),
        (&c3[1], "Ren sans masque, la vieille photo."),
        (&c3[2], "À écrire : Ren retourne à l'atelier."),
        (&ch4, "Aya et Kitsu descendent sous les nuages."),
    ];
    for (n, summary) in &summaries {
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
    let komori = place(
        "Kōmori",
        s("city"),
        None,
        "existing",
        fields(&[
            ("aliases", "La cité des lanternes"),
            ("description", "Cité suspendue à des milliers de câbles d'acier au-dessus d'une mer de nuages. Toits de tuiles noires, passerelles de bambou, et partout des lanternes de papier qui la maintiennent dans le ciel."),
            ("history", "Bâtie par les premiers lanterniers qui fuyaient les terres d'en bas. Depuis que la Lanterne-Mère s'est éteinte il y a dix ans, les câbles grincent chaque nuit un peu plus."),
            ("population", "120 000 habitants"),
            ("government", "La Garde du Ciel, depuis l'extinction de la Lanterne-Mère"),
            ("economy", "Lanternes, soie, pêche aux oiseaux des nuages."),
            ("atmosphere", "Odeur de papier huilé et de fumée ; carillons de vent ; lueurs orangées la nuit."),
            ("firstAppearance", &pr_1.id),
        ]),
    )
    .await;
    let toits = place(
        "Quartier des Toits",
        s("district"),
        Some(komori.id.clone()),
        "existing",
        fields(&[("description", "Le quartier le plus haut : on y circule sur les câbles plutôt que dans les rues."), ("firstAppearance", &c1[0].id)]),
    )
    .await;
    let atelier = place(
        "Atelier Oba",
        workshop_type,
        Some(toits.id.clone()),
        "existing",
        fields(&[
            ("description", "Une boutique étroite sur trois étages, encombrée de carcasses de lanternes et de pots de colle de riz."),
            ("purpose", "Fabriquer et réparer les lanternes ; cacher la lanterne bleue."),
            ("firstAppearance", &c1[1].id),
        ]),
    )
    .await;
    let marche = place(
        "Marché flottant",
        s("market"),
        Some(komori.id.clone()),
        "existing",
        fields(&[("description", "Des plateformes reliées par des ponts, éclairées jour et nuit. On y vend tout, surtout ce qui est interdit."), ("firstAppearance", &c1[2].id)]),
    )
    .await;
    let tour = place(
        "Tour de la Garde du Ciel",
        s("fortress"),
        Some(komori.id.clone()),
        "existing",
        fields(&[("description", "Tour de fer noir au centre de la cité, d'où partent les câbles maîtres."), ("purpose", "Siège de la Garde du Ciel"), ("firstAppearance", &c3[0].id)]),
    )
    .await;
    let sanctuaire = place(
        "Sanctuaire de la Lanterne-Mère",
        s("temple"),
        Some(komori.id.clone()),
        "abandoned",
        fields(&[
            ("description", "Un pavillon de bois rouge à la pointe de la cité. La Lanterne-Mère, éteinte, y pend encore."),
            ("legends", "On dit que la Lanterne-Mère a été allumée avec la flamme d'un renard."),
            ("firstAppearance", &c2[1].id),
        ]),
    )
    .await;
    let station = place("Station des câbles", station_type, Some(komori.id.clone()), "existing", fields(&[("description", "Gare des nacelles qui relient les quartiers. Les gardes y contrôlent les voyageurs.")])).await;
    let foret = place(
        "Forêt des Cèdres d'en bas",
        s("forest"),
        None,
        "inaccessible",
        fields(&[("description", "Sous la mer de nuages, une forêt que personne à Kōmori n'a vue depuis trois générations."), ("dangers", "La brume y efface le chemin du retour."), ("legends", "Les esprits-renards y sont nés.")]),
    )
    .await;

    locations::set_portrait(pool, &komori.id, &BASE64.encode(landscape([40, 46, 90], [235, 170, 90], 240, 160))).await.unwrap();
    locations::set_portrait(pool, &marche.id, &BASE64.encode(landscape([60, 40, 70], [220, 120, 60], 240, 160))).await.unwrap();
    locations::set_portrait(pool, &sanctuaire.id, &BASE64.encode(landscape([30, 30, 60], [150, 40, 40], 240, 160))).await.unwrap();
    locations::add_gallery_image(pool, &komori.id, &BASE64.encode(landscape([20, 24, 60], [250, 190, 110], 320, 200)), Some("Kōmori la nuit, vue depuis les câbles")).await.unwrap();
    locations::add_gallery_image(pool, &komori.id, &BASE64.encode(landscape([210, 220, 235], [245, 245, 250], 320, 200)), Some("La mer de nuages à l'aube")).await.unwrap();

    // ------------------------------------------------------------------
    // Personnages
    // ------------------------------------------------------------------
    let person = |first: &'static str, last: &'static str, role: &'static str, status: &'static str, f: BTreeMap<String, String>| async move {
        let created = characters::create_character(pool, &CharacterInput { first_name: s(first), last_name: s(last), role: s(role), status: s(status), fields: f }).await.unwrap();
        history::record(pool, "created", "character", &created.id, &format!("{first} {last}"), "").await;
        created
    };
    let aya = person(
        "Aya",
        "Tsukishima",
        "main",
        "alive",
        fields(&[
            ("nickname", "La souris des câbles"),
            ("age", "16 ans"),
            ("gender", "female"),
            ("occupation", "Livreuse de lanternes"),
            ("origin", &toits.id),
            ("firstAppearance", &c1[0].id),
            ("description", "Petite et nerveuse, cheveux noirs attachés en queue haute, écharpe rouge trop longue. Elle court plus qu'elle ne marche."),
            ("mainGoal", "Livrer la lanterne bleue… puis sauver la cité."),
            ("distinctiveTrait", "Elle ne tombe jamais d'un câble."),
            ("height", "1,52 m"),
            ("build", "slim"),
            ("eyes", "Noisette, très grands"),
            ("hair", "Noirs, queue de cheval haute"),
            ("voice", "Aiguë, rapide, rit fort"),
            ("clothingStyle", "Veste de livreuse orange, bottes souples, écharpe rouge"),
            ("colorPalette", r##"["#e8622c","#c81e3a","#1b1f3b"]"##),
            ("psychology", "Elle fonce d'abord et réfléchit ensuite ; elle porte seule la maladie de sa sœur."),
            ("traits", &tags(&["Intrépide", "Têtue", "Généreuse"])),
            ("strengths", &tags(&["Agilité", "Sens de l'orientation"])),
            ("flaws", &tags(&["Impulsive", "Ne demande jamais d'aide"])),
            ("motivations", "Payer les remèdes de Hana."),
            ("fears", "Le vide sous les nuages, qu'elle n'a jamais vu."),
            ("secret", "Elle a déjà vu Ren sans son masque, enfant, et l'a oublié."),
            ("plannedArc", "De la livreuse qui ne pense qu'à la prochaine course à celle qui rallume la Lanterne-Mère."),
        ]),
    )
    .await;
    let kitsu = person(
        "Kitsu",
        "",
        "Esprit",
        "Enfermé",
        fields(&[
            ("nickname", "La flamme bavarde"),
            ("age", "Plus de trois cents ans"),
            ("occupation", "Esprit-renard de troisième rang"),
            ("origin", &foret.id),
            ("firstAppearance", &c1[4].id),
            ("description", "Une flamme bleue en forme de renard, enfermée dans une lanterne. Sarcastique, gourmand d'huile parfumée."),
            ("mainGoal", "Retrouver son corps en rallumant la Lanterne-Mère."),
            ("traits", &tags(&["Sarcastique", "Loyal", "Vaniteux"])),
            ("colorPalette", r##"["#3aa0ff","#a8e1ff","#0b2340"]"##),
        ]),
    )
    .await;
    let ren = person(
        "Ren",
        "Kagehara",
        "secondary",
        "alive",
        fields(&[
            ("age", "17 ans"),
            ("gender", "male"),
            ("occupation", "Apprenti de la Garde du Ciel"),
            ("firstAppearance", &c1[2].id),
            ("description", "Grand, silencieux, masque de fer qui ne couvre que le haut du visage, lance pliante dans le dos."),
            ("mainGoal", "Monter en grade pour quitter son quartier."),
            ("build", "athletic"),
            ("traits", &tags(&["Discipliné", "Solitaire", "Juste"])),
            ("secret", "Il a grandi à l'atelier Oba avec Aya ; la Garde lui a fait oublier ce passé."),
            ("innerConflict", "Obéir à Kuroe ou protéger Aya."),
        ]),
    )
    .await;
    let oba = person(
        "Genzō",
        "Oba",
        "mentor",
        "alive",
        fields(&[
            ("age", "70 ans"),
            ("gender", "male"),
            ("occupation", "Maître lanternier, ancien gardien de la Lanterne-Mère"),
            ("firstAppearance", &c1[1].id),
            ("description", "Aveugle depuis dix ans, il reconnaît chaque lanterne à son bruit. Pipe éteinte, mains couvertes de colle."),
            ("mainGoal", "Rallumer la Lanterne-Mère avant de mourir."),
            ("formativeEvent", "La nuit où Kuroe a éteint la Lanterne-Mère et lui a brûlé les yeux."),
        ]),
    )
    .await;
    let sayo = person(
        "Sayo",
        "Kuroe",
        "antagonist",
        "alive",
        fields(&[
            ("age", "45 ans"),
            ("gender", "female"),
            ("occupation", "Commandante de la Garde du Ciel"),
            ("firstAppearance", &c2[1].id),
            ("description", "Uniforme noir impeccable, gants de fer, voix toujours calme."),
            ("mainGoal", "Une cité gouvernée par la Garde, pas par une flamme."),
            ("coreValues", "L'ordre, le contrôle, la survie de la cité à tout prix."),
        ]),
    )
    .await;
    let hana = person(
        "Hana",
        "Tsukishima",
        "secondary",
        "alive",
        fields(&[("age", "9 ans"), ("gender", "female"), ("firstAppearance", &c2[3].id), ("description", "La petite sœur d'Aya, alitée par la fièvre des nuages. Elle voit ce que les autres ne voient pas.")]),
    )
    .await;
    let brouillon = person("Marchand de nouilles", "(brouillon)", "extra", "unknown", fields(&[("notes", "Coupé au découpage du chapitre 1.")])).await;

    // La Commandante gouverne la cité (champ « personnage » d'un lieu).
    let mut komori_fields = komori.fields.clone();
    komori_fields.insert(s("ruler"), sayo.id.clone());
    locations::update_location(pool, &komori.id, &LocationInput { name: komori.name.clone(), kind: s("city"), parent_id: None, status: s("existing"), fields: komori_fields }).await.unwrap();

    characters::set_portrait(pool, &aya.id, &portrait([250, 225, 200], [232, 98, 44])).await.unwrap();
    characters::set_portrait(pool, &kitsu.id, &portrait([20, 35, 70], [58, 160, 255])).await.unwrap();
    characters::set_portrait(pool, &ren.id, &portrait([200, 205, 215], [60, 64, 80])).await.unwrap();
    characters::set_portrait(pool, &oba.id, &portrait([230, 220, 200], [140, 110, 80])).await.unwrap();
    characters::set_portrait(pool, &sayo.id, &portrait([180, 180, 190], [25, 25, 30])).await.unwrap();
    characters::set_portrait(pool, &hana.id, &portrait([245, 230, 240], [200, 120, 160])).await.unwrap();
    characters::add_gallery_image(pool, &aya.id, &portrait([255, 240, 220], [200, 30, 58])).await.unwrap();
    characters::add_gallery_image(pool, &aya.id, &BASE64.encode(landscape([30, 34, 80], [240, 160, 80], 240, 160))).await.unwrap();

    let trash_id = characters::delete_character(pool, &brouillon.id).await.unwrap();
    history::record_deleted(pool, &trash_id).await;

    // ------------------------------------------------------------------
    // Relations et graphe
    // ------------------------------------------------------------------
    let relation = |source: &str, target: &str, kind: &str, label: &str, description: &str, directed: bool, intensity: i64, sentiment: &str, since: Option<&str>| {
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
            until_node: None,
        };
        let label = s(label);
        async move {
            let created = relations::create_relation(pool, &input).await.unwrap();
            history::record(pool, "created", "relation", &created.id, &label, "").await;
        }
    };
    relation(&aya.id, &hana.id, "family", "Sœurs", "Aya travaille pour payer les remèdes de Hana.", false, 5, "positive", None).await;
    relation(&aya.id, &kitsu.id, "alliance", "Duo malgré eux", "Ils se disputent sans arrêt et ne se quittent plus.", false, 4, "positive", Some(&c1[4].id)).await;
    relation(&oba.id, &aya.id, "mentor", "Maître et apprentie", "Oba l'a recueillie à la mort de ses parents.", true, 4, "positive", None).await;
    relation(&sayo.id, &oba.id, "betrayal", "La nuit de l'extinction", "Kuroe était l'élève d'Oba quand elle a éteint la Lanterne-Mère.", true, 5, "negative", None).await;
    relation(&ren.id, &aya.id, "rivalry", "Le garde et la fugitive", "", false, 3, "negative", Some(&c1[2].id)).await;
    relation(&sayo.id, &ren.id, "professional", "Commandante et apprenti", "", true, 3, "neutral", None).await;
    relation(&kitsu.id, &oba.id, "friendship", "Vieux complices", "Oba a enfermé Kitsu dans la lanterne pour le sauver.", false, 4, "positive", None).await;
    relation(&ren.id, &aya.id, "secret", "Amis d'enfance oubliés", "Ils ont grandi ensemble à l'atelier ; aucun ne s'en souvient.", false, 2, "neutral", Some(&c3[1].id)).await;
    relations::save_positions(
        pool,
        &[
            GraphPosition { character_id: aya.id.clone(), x: 0.0, y: 0.0 },
            GraphPosition { character_id: kitsu.id.clone(), x: 240.0, y: -60.0 },
            GraphPosition { character_id: hana.id.clone(), x: -240.0, y: -40.0 },
            GraphPosition { character_id: oba.id.clone(), x: -60.0, y: -240.0 },
            GraphPosition { character_id: ren.id.clone(), x: 220.0, y: 200.0 },
            GraphPosition { character_id: sayo.id.clone(), x: -40.0, y: 260.0 },
        ],
    )
    .await
    .unwrap();

    let link = |character: &str, location: &str, kind: &str, label: &str| {
        let input = CharacterLocationInput { character_id: s(character), location_id: s(location), kind: s(kind), label: s(label), description: String::new(), since_node: None, until_node: None };
        async move {
            places::create_link(pool, &input).await.unwrap();
        }
    };
    link(&aya.id, &toits.id, "lives", "Une chambre sous les tuiles avec Hana").await;
    link(&aya.id, &atelier.id, "works", "Livreuse").await;
    link(&hana.id, &toits.id, "lives", "").await;
    link(&oba.id, &atelier.id, "owns", "Maître lanternier").await;
    link(&sayo.id, &tour.id, "rules", "Commandante").await;
    link(&ren.id, &tour.id, "works", "Apprenti").await;
    link(&ren.id, &atelier.id, "grewUp", "").await;
    link(&ren.id, &station.id, "guards", "Poste de contrôle").await;
    link(&kitsu.id, &sanctuaire.id, "imprisoned", "Lié à la Lanterne-Mère").await;
    link(&kitsu.id, &foret.id, "born", "").await;

    // ------------------------------------------------------------------
    // Scénario des chapitres
    // ------------------------------------------------------------------
    let chapter = |n: &StructureNode, goal: &str, pages: Option<i64>, status: Option<&str>| {
        let id = n.id.clone();
        let fields = ChapterFields { narrative_goal: s(goal), page_goal: pages, script_status: status.map(s) };
        async move {
            manga::set_chapter_fields(pool, &id, &fields).await.unwrap();
        }
    };
    chapter(&prologue, "Poser le mythe de la lanterne bleue et le ton du récit.", Some(1), Some("final")).await;
    chapter(&ch1, "Présenter Aya, la cité et la Garde ; faire basculer l'histoire avec la voix de Kitsu en dernière page.", Some(5), Some("final")).await;
    chapter(&ch2, "Expliquer l'enjeu (la cité va tomber) et l'attache d'Aya (Hana).", Some(6), Some("review")).await;
    chapter(&ch3, "Donner son point de vue à Ren et semer le doute sur son camp.", Some(18), Some("progress")).await;
    chapter(&ch4, "La descente sous les nuages : premier grand décor fantastique.", Some(18), None).await;

    // ------------------------------------------------------------------
    // Scénario des pages, case par case
    // ------------------------------------------------------------------
    let (a, k, r, o, sy, h) = (aya.id.as_str(), kitsu.id.as_str(), ren.id.as_str(), oba.id.as_str(), sayo.id.as_str(), hana.id.as_str());
    let (lk, lt, la, lm, lto, ls) = (komori.id.as_str(), toits.id.as_str(), atelier.id.as_str(), marche.id.as_str(), tour.id.as_str(), sanctuaire.id.as_str());
    let scarf = "Écharpe rouge intacte, sac de livraison";
    let torn = "Écharpe déchirée, genou écorché";
    let mut panels = 0;

    // Prologue
    panels += page(pool, &pr_1, "Prologue, page 1", "suspense", true, vec![
        panel("Kōmori la nuit : des milliers de lanternes suspendues au-dessus d'une mer de nuages.", "extremeWide", Some("pause"), lk, "Il y a dix ans, nuit sans lune", "Câbles, toits de tuiles, nuages en bas de case.", "Pleine largeur. Beaucoup de noir, les lanternes comme des étoiles.", "", &[], vec![nar("Kōmori. La cité qui ne touche jamais le sol.")]),
        panel("Une lanterne bleue se détache d'un câble et tombe.", "medium", Some("action"), lk, "Il y a dix ans, nuit sans lune", "", "Traînée bleue verticale qui traverse la case.", "", &[], vec![nar("On raconte qu'une lanterne bleue est tombée la nuit où la Lanterne-Mère s'est éteinte."), sfx("FSHHH")]),
        panel("Dans les nuages, deux yeux de renard s'allument.", "closeUp", Some("suspense"), "", "Il y a dix ans, nuit sans lune", "Nuages seulement.", "Case muette, petite, en bas à droite : la page se tourne sur ces yeux.", "", &[], vec![sfx("…")]),
    ]).await;

    // Chapitre 1
    panels += page(pool, &c1[0], "Chapitre 1, page 1", "action", false, vec![
        panel("Aya court sur un câble entre deux toits, sac de lanternes sur le dos.", "wide", Some("action"), lt, "Nuit, 21 h", "Toits du quartier, linge qui sèche, lanternes accrochées.", "Lignes de vitesse. L'écharpe rouge flotte derrière elle.", "", &[(a, scarf)], vec![sfx("TAP TAP TAP"), th(a, "Trois livraisons avant le couvre-feu. Facile.")]),
        panel("Elle saute d'un câble à l'autre au-dessus du vide.", "lowAngle", Some("action"), lt, "Nuit, 21 h", "Le vide et les nuages sous elle.", "Contre-plongée : on doit sentir la hauteur.", "", &[(a, scarf)], vec![sfx("HOP !")]),
        panel("Aya atterrit sur un balcon où l'attend une vieille cliente.", "medium", None, lt, "Nuit, 21 h", "Balcon fleuri, porte coulissante.", "", "", &[(a, scarf)], vec![d(a, "Livraison Oba ! Une lanterne verte, garantie dix nuits !")]),
    ]).await;
    panels += page(pool, &c1[1], "Chapitre 1, page 2", "transition", false, vec![
        panel("L'atelier : Oba, aveugle, répare une lanterne à tâtons.", "full", Some("pause"), la, "Nuit, 21 h 30", "Carcasses de lanternes, pots de colle, papier huilé.", "Oba ne regarde jamais vers Aya : il l'écoute.", "", &[(o, "Aveugle, pipe éteinte"), (a, scarf)], vec![d(o, "Tu es en retard de quatre minutes, Aya."), d(a, "Trois et demie !")]),
        panel("Oba tend une lanterne enveloppée d'un tissu sombre.", "closeUp", None, la, "Nuit, 21 h 30", "", "Mains du vieil homme, couvertes de colle.", "", &[(o, "Aveugle, pipe éteinte")], vec![d(o, "Celle-ci, tu la livres au Sanctuaire. Sans l'ouvrir.")]),
        panel("Étiquette cousue sur le tissu.", "insert", None, la, "Nuit, 21 h 30", "", "Écriture au pinceau, lisible.", "", &[], vec![sign("Pour la Lanterne-Mère — ne pas éteindre")]),
        panel("Aya, perplexe, la lanterne dans les bras.", "medium", None, la, "Nuit, 21 h 30", "", "", "", &[(a, "Écharpe rouge intacte, porte la lanterne bleue")], vec![th(a, "Le Sanctuaire ? Plus personne n'y va depuis dix ans…")]),
    ]).await;
    panels += page(pool, &c1[2], "Chapitre 1, page 3", "suspense", false, vec![
        panel("Le marché flottant : foule, étals, lumières. Aya se faufile.", "highAngle", None, lm, "Nuit, 22 h", "Plateformes reliées par des ponts, étals de soie et d'oiseaux.", "Plongée, Aya minuscule au milieu de la foule.", "", &[(a, scarf)], vec![nar("Le marché flottant ne dort jamais.")]),
        panel("Des gardes au masque de fer bloquent le pont de sortie.", "wide", Some("suspense"), lm, "Nuit, 22 h", "Pont de bambou, barrière de la Garde.", "", "", &[(r, "Masque de fer, lance dans le dos")], vec![sign("CONTRÔLE DE LA GARDE DU CIEL — LANTERNES NON DÉCLARÉES INTERDITES")]),
        panel("Ren lève la main vers Aya.", "medium", None, lm, "Nuit, 22 h", "", "On ne voit que la bouche de Ren sous le masque.", "", &[(r, "Masque de fer, lance dans le dos"), (a, scarf)], vec![d(r, "Toi. Le sac. Ouvre-le.")]),
        panel("Aya serre le sac contre elle.", "closeUp", Some("suspense"), lm, "Nuit, 22 h", "", "Sueur sur la tempe.", "", &[(a, scarf)], vec![th(a, "S'ils voient la bleue…")]),
    ]).await;
    panels += page(pool, &c1[3], "Chapitre 1, page 4", "action", false, vec![
        panel("Aya bondit par-dessus la rambarde.", "american", Some("action"), lm, "Nuit, 22 h", "", "Case inclinée, mouvement vers le bas.", "", &[(a, scarf), (r, "Masque de fer, lance dans le dos")], vec![sfx("WHAM !"), d(r, "Arrête-toi !")]),
        panel("Elle chute entre les lanternes et se rattrape à un câble ; son écharpe se déchire.", "wide", Some("action"), lm, "Nuit, 22 h", "Lanternes du marché qui tournoient.", "L'écharpe reste accrochée à un crochet : lambeau rouge au premier plan.", "L'écharpe se déchire ici : la garder déchirée dans toutes les pages suivantes.", &[(a, torn)], vec![sfx("CRRRAC")]),
        panel("Ren la regarde d'en haut ; son masque fendu laisse voir un œil.", "highAngle", Some("reveal"), lm, "Nuit, 22 h", "", "Premier regard de Ren : important.", "Masque fendu à partir d'ici.", &[(r, "Masque fendu (œil gauche visible)")], vec![th(r, "Cette fille… je l'ai déjà vue.")]),
    ]).await;
    panels += page(pool, &c1[4], "Chapitre 1, page 5", "reveal", true, vec![
        panel("Aya atterrit dans une ruelle sombre, à bout de souffle.", "full", Some("pause"), lt, "Nuit, 22 h 10", "Ruelle étroite, caisses, chat.", "", "", &[(a, torn)], vec![d(a, "Ha… ha… sauvée.")]),
        panel("Le tissu glisse : la lanterne bleue s'illumine.", "closeUp", Some("reveal"), lt, "Nuit, 22 h 10", "", "Toute la case baigne dans le bleu.", "", &[(a, torn)], vec![sfx("VWOOM")]),
        panel("Une voix sort de la flamme.", "extremeCloseUp", None, lt, "Nuit, 22 h 10", "", "La flamme prend la forme d'une tête de renard.", "", &[(k, "Dans la lanterne bleue (flamme-renard)")], vec![d(k, "Enfin ! Tu sais combien de temps j'ai attendu qu'on me secoue un peu ?")]),
        panel("Aya tombe à la renverse.", "medium", None, lt, "Nuit, 22 h 10", "", "Gag : yeux ronds, chat qui s'enfuit.", "", &[(a, torn)], vec![d(a, "La… la lanterne PARLE ?!")]),
    ]).await;

    // Chapitre 2
    panels += page(pool, &c2[0], "Chapitre 2, page 1", "pause", false, vec![
        panel("Ruelle : Aya fixe la lanterne posée sur une caisse.", "medium", Some("pause"), lt, "Nuit, 22 h 15", "Même ruelle que la page précédente.", "", "", &[(a, torn), (k, "Dans la lanterne bleue (flamme-renard)")], vec![d(k, "Kitsu. Esprit-renard de troisième rang. Enchanté.")]),
        panel("La flamme-renard sourit.", "closeUp", None, lt, "Nuit, 22 h 15", "", "", "", &[(k, "Dans la lanterne bleue (flamme-renard)")], vec![d(k, "Et toi, tu es la petite qui vole sur les câbles. Oba m'a beaucoup parlé de toi.")]),
        panel("Aya se penche vers la lanterne.", "medium", None, lt, "Nuit, 22 h 15", "", "", "Erreur volontaire de démonstration : l'écharpe est dessinée intacte alors qu'elle s'est déchirée au chapitre 1, page 4. La vue Continuité le signale.", &[(a, scarf)], vec![d(a, "Tu connais Maître Oba ?")]),
    ]).await;
    panels += page(pool, &c2[1], "Chapitre 2, page 2", "reveal", false, vec![
        panel("Flash-back : Oba jeune, debout devant la Lanterne-Mère allumée.", "wide", Some("pause"), ls, "Dix ans plus tôt", "Sanctuaire rouge, Lanterne-Mère immense et dorée.", "Trame de flash-back : bords de cases arrondis, fond gris.", "", &[(o, "Voyant, cheveux encore noirs")], vec![nar("Il y a dix ans, Oba était le gardien de la Lanterne-Mère. Chaque nuit, il veillait sur sa flamme, et chaque nuit, la cité restait accrochée au ciel. Personne ne se demandait pourquoi. Personne, sauf son élève la plus douée.")]),
        panel("Sayo, jeune, en uniforme, éteint la Lanterne-Mère.", "medium", Some("action"), ls, "Dix ans plus tôt", "", "Le geste doit être calme, presque tendre.", "", &[(sy, "Jeune, sans gants")], vec![d(sy, "Une seule flamme ne doit pas gouverner le ciel."), sfx("FFT")]),
        panel("Oba, les yeux brûlés, à genoux dans la fumée.", "closeUp", Some("reveal"), ls, "Dix ans plus tôt", "", "", "", &[(o, "Yeux brûlés, à genoux")], vec![nar("Ce soir-là, il a perdu la vue. Et moi, mon corps.")]),
    ]).await;
    panels += page(pool, &c2[2], "Chapitre 2, page 3", "suspense", false, vec![
        panel("Retour à la ruelle : Kitsu, grave.", "full", None, lt, "Nuit, 22 h 30", "", "", "", &[(k, "Dans la lanterne bleue (flamme-renard)"), (a, torn)], vec![d(k, "Si la Lanterne-Mère n'est pas rallumée avant la nuit sans lune, Kōmori tombera.")]),
        panel("Aya, livide.", "closeUp", Some("suspense"), lt, "Nuit, 22 h 30", "", "", "", &[(a, torn)], vec![d(a, "Tomber ? Tu veux dire… dans les nuages ?")]),
        panel("Les câbles de la cité grincent ; une tuile se détache.", "insert", Some("suspense"), lk, "Nuit, 22 h 30", "Câble maître, attaches rouillées.", "", "", &[], vec![sfx("GRRRIIIK")]),
    ]).await;
    panels += page(pool, &c2[3], "Chapitre 2, page 4", "transition", true, vec![
        panel("Chambre sous les toits : Hana, fiévreuse, se redresse.", "wide", Some("pause"), lt, "Nuit, 23 h", "Petite chambre, futon, couverture à étoiles, remèdes sur une étagère.", "", "", &[(h, "Fiévreuse, couverture à étoiles"), (a, torn)], vec![d(h, "Grande sœur ? Tu sens la fumée bleue.")]),
        panel("Aya cache la lanterne derrière son dos.", "medium", None, lt, "Nuit, 23 h", "", "La lueur bleue dépasse quand même.", "", &[(a, torn)], vec![d(a, "C'est rien, Hana. Dors.")]),
        panel("À la fenêtre, la silhouette de Ren, sur le toit d'en face.", "closeUp", Some("suspense"), lt, "Nuit, 23 h", "Toit d'en face, lune absente.", "Dernière case : silhouette noire, œil visible par la fente du masque.", "", &[(r, "Masque fendu (œil gauche visible)")], vec![th(r, "Trouvée.")]),
    ]).await;

    // Chapitre 3 (en cours d'écriture)
    panels += page(pool, &c3[0], "Chapitre 3, page 1", "action", false, vec![
        panel("La Tour de la Garde du Ciel au lever du jour.", "extremeWide", Some("pause"), lto, "Aube", "Tour de fer noir, câbles maîtres en éventail.", "", "", &[], vec![nar("Tour de la Garde du Ciel.")]),
        panel("Sayo devant une carte des câbles ; Ren au garde-à-vous.", "medium", None, lto, "Aube", "Salle des cartes.", "", "", &[(sy, "Uniforme noir, gants de fer"), (r, "Masque fendu (œil gauche visible)")], vec![d(sy, "La lanterne bleue a été vue au marché. Tu l'as laissée filer."), d(r, "Elle avait de l'aide, Commandante.")]),
        panel("Gros plan sur Sayo.", "closeUp", Some("suspense"), lto, "Aube", "", "", "", &[(sy, "Uniforme noir, gants de fer")], vec![d(sy, "Ramène-la-moi. La lanterne, pas la fille.")]),
    ]).await;
    panels += page(pool, &c3[1], "Chapitre 3, page 2", "pause", false, vec![
        panel("Ren seul ôte son masque : une cicatrice en forme de flamme sur la joue.", "full", Some("reveal"), lto, "Matin", "Chambrée de la Garde.", "Premier visage complet de Ren.", "Ren sans masque à partir d'ici, cicatrice joue droite.", &[(r, "Sans masque, cicatrice joue droite")], vec![]),
        panel("Une vieille photo : Ren et Aya enfants devant l'atelier Oba.", "insert", None, la, "Huit ans plus tôt", "", "Photo jaunie, coin déchiré.", "", &[], vec![sign("Atelier Oba — été")]),
    ]).await;
    panels += page(pool, &c3[2], "Chapitre 3, page 3", "transition", false, vec![
        panel("À écrire : Ren retourne à l'atelier Oba.", "", None, la, "", "", "", "", &[], vec![]),
        panel("À écrire : Oba le reconnaît au bruit de ses pas.", "", None, la, "", "", "", "", &[], vec![]),
    ]).await;

    // ------------------------------------------------------------------
    // Documents rangés dans le découpage
    // ------------------------------------------------------------------
    let draft = docx(&[
        "Kōmori — chapitre 1, premier jet",
        "Page 1. Aya court sur les câbles. Trois livraisons avant le couvre-feu.",
        "Page 2. L'atelier. Oba confie la lanterne bleue : « Sans l'ouvrir. »",
        "Page 3. Contrôle de la Garde au marché flottant. Ren.",
        "Page 4. Le saut. L'écharpe se déchire.",
        "Page 5. La lanterne parle.",
    ]);
    documents::add(pool, &ch1.id, "Chapitre 1 - premier jet.docx", &draft).await.unwrap();
    let editor = documents::add(
        pool,
        &tome1.id,
        "Retours de l'éditeur.md",
        "# Retours de l'éditeur\n\n- Chapitre 1 : **très bon rythme**, la dernière page fonctionne.\n- Chapitre 2 : trop de texte dans le flash-back (page 2, case 1).\n- Penser à la couverture du tome 1 : Aya et la lanterne, fond de nuages.\n".as_bytes(),
    )
    .await
    .unwrap();
    documents::set_note(pool, &editor.id, "Réunion du lundi : à traiter avant l'envoi du tome.").await.unwrap();
    documents::add(pool, &ch1.id, "Recherche - Aya.png", &crate::seed_novel::png(240, 320, |x, y| if (x / 40 + y / 40) % 2 == 0 { [232, 98, 44] } else { [27, 31, 59] })).await.unwrap();
    documents::add(pool, &tome1.id, "Couverture - croquis.png", &landscape([25, 30, 70], [240, 170, 90], 480, 680)).await.unwrap();

    // ------------------------------------------------------------------
    // Notes, dossiers, post-it, notes système
    // ------------------------------------------------------------------
    let bible = notes::create_folder(pool, None, "Bible graphique").await.unwrap();
    let edition = notes::create_folder(pool, None, "Édition").await.unwrap();
    let ideas = notes::create_folder(pool, None, "Idées en vrac").await.unwrap();

    let rules_note = note(
        pool,
        Some(&bible.id),
        "Les lanternes",
        doc(vec![
            heading(2, "Couleurs et fonctions"),
            bullets(&["Orange : éclairage ordinaire.", "Verte : porte-bonheur, dure dix nuits.", "Rouge : interdite, signal de la Garde.", "Bleue : flamme d'esprit — une seule connue."]),
            heading(2, "Règles"),
            numbered(&["Une lanterne éteinte ne se rallume qu'avec une flamme plus ancienne.", "Les câbles se relâchent quand les lanternes faiblissent.", "La Lanterne-Mère porte toutes les autres."]),
            quote("« Une seule flamme ne doit pas gouverner le ciel. » — Sayo Kuroe"),
        ]),
        "Orange, verte, rouge, bleue : ce que dit chaque couleur.",
        true,
    )
    .await;
    note(
        pool,
        Some(&bible.id),
        "Onomatopées",
        doc(vec![para(vec![bold("Câbles"), text(" : GRRRIIIK, TWANG.")]), para(vec![bold("Course"), text(" : TAP TAP TAP, HOP !")]), para(vec![bold("Flamme bleue"), text(" : VWOOM, FFT.")])]),
        "Câbles, course, flamme bleue.",
        false,
    )
    .await;
    note(
        pool,
        Some(&bible.id),
        "Aya et Ren : le passé",
        doc(vec![
            para(vec![mention("character", &aya.id, "Aya"), text(" et "), mention("character", &ren.id, "Ren"), text(" ont grandi ensemble à l'"), mention("location", &atelier.id, "atelier Oba"), text(".")]),
            para(vec![italic("Révélation prévue au tome 2, quand Ren retrouve la photo.")]),
        ]),
        "Aya et Ren ont grandi ensemble à l'atelier Oba.",
        false,
    )
    .await;
    note(
        pool,
        Some(&edition.id),
        "Calendrier de prépublication",
        doc(vec![bullets(&["Chapitre 1 : livré.", "Chapitre 2 : relecture de l'éditeur.", "Chapitre 3 : storyboard en cours.", "Tome 1 : couverture à valider."])]),
        "Chapitre 1 livré, chapitre 2 en relecture.",
        false,
    )
    .await;
    note(pool, Some(&ideas.id), "Pistes", doc(vec![bullets(&["Kitsu retrouve un corps de renard au tome 3 ?", "Hana voit les esprits : pourquoi ?", "Une autre cité suspendue, rivale."])]), "Kitsu retrouve un corps de renard au tome 3 ?", false).await;

    let sticky = |text: &'static str, color: &'static str, x: f64, y: f64| async move {
        let created = notes::create_sticky(pool, color, x, y).await.unwrap();
        notes::update_sticky(pool, &created.id, &StickyUpdate { text: Some(s(text)), color: None, x: None, y: None, width: None, height: None, z: None }).await.unwrap();
        created.id
    };
    sticky("Couverture tome 1 : Aya de dos, lanterne bleue, mer de nuages", "yellow", 40.0, 40.0).await;
    sticky("Motif récurrent : l'écharpe rouge", "pink", 300.0, 60.0).await;
    sticky("Raccourcir le récitatif du flash-back (ch. 2, p. 2)", "orange", 80.0, 260.0).await;
    sticky("Dessiner la carte des câbles", "blue", 340.0, 280.0).await;
    sticky("Titre alternatif : « La flamme bleue »", "purple", 600.0, 120.0).await;
    let discarded = sticky("Idée abandonnée : Kitsu est un chat", "green", 620.0, 320.0).await;
    let sticky_trash = notes::delete_sticky(pool, &discarded).await.unwrap();
    history::record_deleted(pool, &sticky_trash).await;

    system_note_service::set_enabled(pool, ProjectType::Manga, true, "fr").await.unwrap();
    system_note_service::sync(pool, ProjectType::Manga, Some("fr")).await.unwrap();

    // ------------------------------------------------------------------
    // Trame
    // ------------------------------------------------------------------
    let ev = |id: &str, lane: &str, row: i64, title: &str, note: &str, extra: Value| {
        let mut base = json!({
            "id": id, "laneId": lane, "row": row, "title": title, "note": note, "pivot": false, "status": "draft",
            "tags": [], "characterIds": [], "povId": null, "locationId": null, "nodeId": null, "alsoNodeIds": [],
            "noteIds": [], "date": "", "words": 0
        });
        for (key, value) in extra.as_object().unwrap() {
            base[key] = value.clone();
        }
        base
    };
    let plot = json!({
        "version": 1,
        "lanes": [
            { "id": "aya", "name": "La course d'Aya", "color": "#e8622c", "main": true, "hidden": false, "characterId": aya.id },
            { "id": "kitsu", "name": "Kitsu", "color": "#3aa0ff", "main": false, "hidden": false, "characterId": kitsu.id },
            { "id": "garde", "name": "La Garde du Ciel", "color": "#4b4f63", "main": false, "hidden": false, "characterId": sayo.id },
            { "id": "oba", "name": "Le passé d'Oba", "color": "#c9a227", "main": false, "hidden": false, "characterId": oba.id }
        ],
        "events": [
            ev("p1", "oba", -2, "Kuroe éteint la Lanterne-Mère", "Oba perd la vue.", json!({ "date": "Dix ans plus tôt", "locationId": sanctuaire.id, "characterIds": [oba.id, sayo.id], "tags": ["flash-back"], "pivot": true, "nodeId": c2[1].id, "status": "written" })),
            ev("p2", "kitsu", -1, "Oba enferme Kitsu dans une lanterne", "Pour sauver sa flamme.", json!({ "date": "Dix ans plus tôt", "characterIds": [oba.id, kitsu.id], "tags": ["flash-back", "secret"], "nodeId": pr_1.id, "status": "revised" })),
            ev("e1", "aya", 0, "Livraison de nuit", "Aya sur les câbles.", json!({ "nodeId": c1[0].id, "characterIds": [aya.id], "povId": aya.id, "locationId": toits.id, "status": "revised" })),
            ev("e2", "aya", 1, "La lanterne bleue", "« Sans l'ouvrir. »", json!({ "nodeId": c1[1].id, "characterIds": [aya.id, oba.id], "povId": aya.id, "locationId": atelier.id, "status": "revised", "noteIds": [rules_note] })),
            ev("g1", "garde", 2, "Contrôle au marché", "Ren arrête Aya.", json!({ "nodeId": c1[2].id, "characterIds": [ren.id, aya.id], "povId": aya.id, "locationId": marche.id, "status": "written" })),
            ev("e3", "aya", 3, "Le saut", "L'écharpe se déchire.", json!({ "nodeId": c1[3].id, "characterIds": [aya.id, ren.id], "povId": aya.id, "locationId": marche.id, "status": "written", "tags": ["action"] })),
            ev("k1", "kitsu", 4, "La lanterne parle", "Kitsu se présente.", json!({ "nodeId": c1[4].id, "alsoNodeIds": [c2[0].id], "characterIds": [kitsu.id, aya.id], "povId": aya.id, "locationId": toits.id, "pivot": true, "status": "written" })),
            ev("e4", "aya", 6, "L'enjeu", "Kōmori va tomber.", json!({ "nodeId": c2[2].id, "characterIds": [aya.id, kitsu.id], "povId": aya.id, "status": "draft" })),
            ev("g2", "garde", 7, "Ren retrouve Aya", "« Trouvée. »", json!({ "nodeId": c2[3].id, "characterIds": [ren.id, aya.id, hana.id], "locationId": toits.id, "status": "draft", "tags": ["menace"] })),
            ev("g3", "garde", 8, "Les ordres de Kuroe", "La lanterne, pas la fille.", json!({ "nodeId": c3[0].id, "characterIds": [sayo.id, ren.id], "povId": ren.id, "locationId": tour.id, "status": "draft" })),
            ev("g4", "garde", 9, "La photo", "Ren se souvient de l'atelier.", json!({ "nodeId": c3[1].id, "characterIds": [ren.id], "povId": ren.id, "status": "idea", "pivot": true })),
            ev("e5", "aya", 11, "Sous les nuages", "Aya et Kitsu descendent dans la forêt.", json!({ "nodeId": ch4.id, "characterIds": [aya.id, kitsu.id], "locationId": foret.id, "status": "idea" })),
            ev("e6", "aya", 14, "La nuit sans lune", "Rallumer la Lanterne-Mère.", json!({ "characterIds": [aya.id, kitsu.id, sayo.id], "locationId": sanctuaire.id, "status": "idea", "pivot": true }))
        ],
        "links": [
            { "id": "l1", "from": "p1", "to": "p2", "kind": "impact", "label": "sauver la flamme", "note": "" },
            { "id": "l2", "from": "p2", "to": "e2", "kind": "influence", "label": "la lanterne", "note": "Oba garde la lanterne dix ans avant de la confier." },
            { "id": "l3", "from": "g1", "to": "e3", "kind": "impact", "label": "fuite", "note": "" },
            { "id": "l4", "from": "e3", "to": "k1", "kind": "impact", "label": "le choc", "note": "La chute réveille Kitsu." },
            { "id": "l5", "from": "g2", "to": "g3", "kind": "meeting", "label": "", "note": "" },
            { "id": "l6", "from": "g4", "to": "e6", "kind": "influence", "label": "changement de camp ?", "note": "" }
        ],
        "rowLabels": { "-2": "Il y a dix ans", "0": "Nuit, 21 h", "8": "Le lendemain, aube", "14": "Nuit sans lune" },
        "acts": { "0": "Tome 1 — La lanterne bleue", "8": "Tome 2 — La Garde du Ciel" },
        "tension": { "-2": 8, "0": 2, "2": 5, "3": 7, "4": 6, "6": 7, "7": 8, "8": 5, "9": 6, "11": 7, "14": 10 },
        "readingOrder": [],
        "readingFollowsStructure": true,
        "questions": [
            { "id": "q1", "text": "Pourquoi Oba confie-t-il la lanterne maintenant ?", "done": false, "eventId": "e2" }
        ],
        "mysteries": [
            { "id": "y1", "question": "Qui est Kitsu pour Oba ?", "status": "solved", "answer": "Un vieil ami qu'il a enfermé pour le sauver.", "payoff": "Flash-back du chapitre 2.", "payoffEventId": "p2" },
            { "id": "y2", "question": "D'où Ren connaît-il Aya ?", "status": "open", "answer": "", "payoff": "", "payoffEventId": null }
        ],
        "clues": [
            { "id": "i1", "text": "Ren : « Je l'ai déjà vue. »", "eventId": "e3", "mysteryId": "y2" },
            { "id": "i2", "text": "La photo de l'atelier Oba.", "eventId": "g4", "mysteryId": "y2" }
        ],
        "templates": [{ "id": "t1", "name": "Arc du tome", "steps": ["Accroche", "Rencontre", "Enjeu", "Poursuite", "Révélation", "Cliffhanger"] }],
        "sceneOrder": {}
    });
    history::snapshot_before(pool, "plot", "default").await;
    plot_service::save(pool, &plot.to_string()).await.unwrap();
    history::record(pool, "updated", "plot", "default", "", "").await;

    // ------------------------------------------------------------------
    // Rythme de travail : six semaines de séances
    // ------------------------------------------------------------------
    let today = chrono::Local::now().date_naive();
    for offset in 0..42i64 {
        if offset % 4 == 2 {
            continue;
        }
        let day = today - chrono::Duration::days(offset);
        let minutes = 40 + (offset * 17) % 90;
        sqlx::query(
            "INSERT INTO work_days (day, actions, minutes, last_minute, words) VALUES (?, ?, ?, '', 0) \
             ON CONFLICT(day) DO UPDATE SET actions = excluded.actions, minutes = excluded.minutes",
        )
        .bind(day.format("%Y-%m-%d").to_string())
        .bind(minutes / 2 + 5)
        .bind(minutes)
        .execute(pool)
        .await
        .unwrap();
    }

    // ------------------------------------------------------------------
    // Vérifications
    // ------------------------------------------------------------------
    let tree = structure::get_structure(pool, ProjectType::Manga).await.unwrap();
    assert_eq!(tree.nodes.len(), 20, "découpage incomplet");
    let script = manga::script_panels(pool).await.unwrap();
    assert_eq!(script.len(), panels);
    let lines = script.iter().map(|p| p.texts.len()).sum::<usize>();
    assert_eq!(characters::list_characters(pool).await.unwrap().len(), 6);
    assert_eq!(locations::list_locations(pool).await.unwrap().len(), 8);
    assert_eq!(relations::list_relations(pool).await.unwrap().len(), 8);
    assert!(!plot_service::get(pool).await.unwrap().data.is_empty());
    let visible = project_service::list_for_viewer(&app_db, &Viewer::Guest).await.unwrap();
    assert!(visible.iter().any(|p| p.id == project.id), "le projet doit être public (visible sans compte)");

    pool.close().await;
    app_db.close().await;

    println!();
    println!("Projet public « {} » prêt.", project.name);
    println!("  2 tomes, 5 chapitres, 13 pages, {panels} cases, {lines} textes ; 6 personnages, 8 lieux, 8 relations,");
    println!("  trame (13 événements), notes, post-it, documents, continuité (une erreur volontaire au chapitre 2).");
    println!("Ouvrez GANIS, cliquez sur « Commencer » : le projet est dans l'espace public.");
}
