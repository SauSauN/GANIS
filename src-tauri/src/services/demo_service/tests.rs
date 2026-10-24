//! Tests des projets d'exemple : données lisibles, construction complète
//! par les services, une seule création par espace, annulation propre en
//! cas d'échec, export et import .ganix.

use super::*;
use crate::db::init_app_db;
use crate::models::project::ProjectVisibility;
use crate::services::{auth_service, ganix_service};
use std::path::PathBuf;

struct TestEnv {
    state: AppState,
    dir: PathBuf,
}

impl Drop for TestEnv {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

async fn env() -> TestEnv {
    let dir = std::env::temp_dir().join(format!("ganis-demo-{}", uuid::Uuid::new_v4()));
    let app_db = init_app_db(&dir).await.unwrap();
    TestEnv { state: AppState::new(app_db, dir.clone()), dir }
}

/// Crée l'administrateur et le compte « alice », connecté.
async fn alice(env: &TestEnv) -> Viewer {
    auth_service::setup_first_admin(&env.state.app_db, "admin", "admin1234", None).await.unwrap();
    auth_service::register_user(&env.state.app_db, "alice", "motdepasse1", None).await.unwrap();
    auth_service::login_user(&env.state, "alice", "motdepasse1").await.unwrap();
    env.state.viewer().await
}

async fn count(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

/// Nombre de lignes de chaque table de la base d'un projet.
async fn table_counts(pool: &SqlitePool) -> BTreeMap<String, i64> {
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx%'",
    )
    .fetch_all(pool)
    .await
    .unwrap();
    let mut out = BTreeMap::new();
    for table in tables {
        out.insert(table.clone(), count(pool, &format!("SELECT COUNT(*) FROM \"{table}\"")).await);
    }
    out
}

#[test]
fn every_example_parses() {
    for source in &SOURCES {
        let parsed = parse(source).unwrap_or_else(|e| panic!("{} : {e:?}", source.id));
        assert!(!parsed.data.project.name.is_empty());
        assert!(!parsed.data.card.highlights.is_empty());
    }
    assert_eq!(ids(), vec!["roman", "manga"]);
    assert!(source("inconnu").is_err());
}

#[tokio::test]
async fn the_novel_is_complete_and_created_only_once() {
    let env = env().await;
    let viewer = Viewer::Guest;

    let first = create(&env.state, &viewer, "roman").await.unwrap();
    assert!(first.created);
    let project = &first.project;
    assert_eq!(project.project_type, ProjectType::Novel);
    assert_eq!(project.visibility, ProjectVisibility::Public);
    assert_eq!(project.status, ProjectStatus::InProgress);

    let pool = project_storage::pool_for_viewer(&env.state, &project.id, &viewer).await.unwrap();
    let parsed = parse(source("roman").unwrap()).unwrap();

    // Découpage : parties, chapitres, scènes, prologue et épilogue.
    let tree = structure::get_structure(&pool, ProjectType::Novel).await.unwrap();
    assert_eq!(tree.nodes.len(), 33);
    assert_eq!(tree.manuscript_goal, Some(50_000));
    assert!(tree.nodes.iter().all(|n| !n.summary.is_empty()), "chaque élément du découpage a un résumé");

    // Texte : chaque scène écrite, la dernière scène du chapitre 9 non.
    let manuscript = novel::manuscript_contents(&pool).await.unwrap();
    let words: i64 = manuscript.iter().map(|c| novel::count_words(&c.content)).sum();
    assert!(words > 9_000, "{words} mots");
    let scene_texts = parsed.texts.keys().filter(|k| k.starts_with("scène:")).count();
    assert_eq!(manuscript.iter().filter(|c| !c.content.is_empty()).count(), scene_texts);

    // La première scène garde son premier jet dans une version nommée.
    let s11 = parsed_node_id(&pool, "L'arrivée").await;
    let versions = history::list_versions(&pool, "structureNode", &s11).await.unwrap();
    assert!(versions.versions.iter().any(|v| v.name == "Premier jet"));

    assert_eq!(characters::list_characters(&pool).await.unwrap().len(), parsed.data.characters.len());
    assert_eq!(locations::list_locations(&pool).await.unwrap().len(), parsed.data.locations.len());
    assert_eq!(relations::list_relations(&pool).await.unwrap().len(), parsed.data.relations.len());
    assert_eq!(world::list_entries(&pool, Module::Item).await.unwrap().len(), parsed.data.items.len());
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM structure_documents").await, parsed.data.documents.len() as i64);
    assert!(novel::get_editorial(&pool).await.unwrap().pitch.starts_with("Hiver 2019"));

    // Les fiches désignées par un champ (souverain, origine…) existent.
    let locations_list = locations::list_locations(&pool).await.unwrap();
    // Les lieux sont rangés les uns dans les autres (massif › pic › observatoire…).
    let nested = locations_list.iter().filter(|l| l.parent_id.is_some()).count();
    assert_eq!(nested, parsed.data.locations.iter().filter(|l| l.get("parentId").is_some()).count());
    assert!(nested >= 10, "{nested} lieux rangés dans un autre");
    assert!(locations_list.iter().all(|l| l.fields.get("firstAppearance").is_none_or(|id| tree.nodes.iter().any(|n| &n.id == id))));

    // Notes : documents valides qui finissent par un paragraphe.
    for summary in notes::list_notes(&pool).await.unwrap() {
        let note = notes::get_note(&pool, &summary.id).await.unwrap();
        let doc: Value = serde_json::from_str(&note.content).unwrap();
        assert_eq!(doc["type"], "doc");
        assert_eq!(doc["content"].as_array().unwrap().last().unwrap()["type"], "paragraph", "{}", note.title);
    }

    // Trame enregistrée, identifiants résolus.
    let plot = plot_service::get(&pool).await.unwrap();
    assert!(!plot.data.contains("\"@"), "référence non résolue dans la trame");

    // La construction ne compte pas comme une séance de travail.
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM work_days").await, 0);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM activity").await, 0);

    // Une seconde demande rend le même projet, sans rien créer.
    let again = create(&env.state, &viewer, "roman").await.unwrap();
    assert!(!again.created);
    assert_eq!(again.project.id, project.id);
    let listed = list(&env.state.app_db, &viewer).await.unwrap();
    assert_eq!(listed[0].project_id.as_deref(), Some(project.id.as_str()));
    assert_eq!(listed[1].project_id, None);
    assert_eq!(project_service::list_for_viewer(&env.state.app_db, &viewer).await.unwrap().len(), 1);
}

async fn parsed_node_id(pool: &SqlitePool, title: &str) -> String {
    sqlx::query_scalar("SELECT id FROM structure_nodes WHERE title = ?").bind(title).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn the_manga_is_complete_with_its_script() {
    let env = env().await;
    let viewer = Viewer::Guest;
    let outcome = create(&env.state, &viewer, "manga").await.unwrap();
    assert!(outcome.created);
    assert_eq!(outcome.project.project_type, ProjectType::Manga);

    let pool = project_storage::pool_for_viewer(&env.state, &outcome.project.id, &viewer).await.unwrap();
    let parsed = parse(source("manga").unwrap()).unwrap();

    // Arc › Tome › Chapitre › Page.
    let tree = structure::get_structure(&pool, ProjectType::Manga).await.unwrap();
    assert_eq!(tree.levels.len(), 4);
    let pages = tree.nodes.iter().filter(|n| n.level == 3).count();
    assert_eq!(pages, parsed.pages.len());

    // Chaque case du scénario est enregistrée, avec ses textes.
    let panels = manga::script_panels(&pool).await.unwrap();
    let expected: usize = parsed.pages.iter().map(|p| p.panels.len()).sum();
    assert_eq!(panels.len(), expected);
    assert!(expected >= 150, "{expected} cases");
    let texts: usize = panels.iter().map(|p| p.texts.len()).sum();
    let expected_texts: usize = parsed.pages.iter().flat_map(|p| &p.panels).map(|p| p.texts.len()).sum();
    assert_eq!(texts, expected_texts);

    // Chapitres : objectif narratif et pages visées.
    let chapters: Vec<&StructureNode> = tree.nodes.iter().filter(|n| n.level == 2).collect();
    assert!(chapters.iter().all(|c| !c.narrative_goal.is_empty()), "chaque chapitre a un objectif narratif");

    // Les pages scénarisées sont reliées à leurs personnages et lieux.
    let links = node_links::list_links(&pool).await.unwrap();
    assert!(links.characters.len() >= pages);

    // Les niveaux portent les noms choisis, et les pages suivent leurs chapitres.
    let names: Vec<&str> = tree.levels.iter().map(|l| l.one.as_deref().unwrap_or_default()).collect();
    assert_eq!(names, ["Arc", "Tome", "Chapitre", "Page"]);
    assert!(chapters.iter().all(|c| c.page_goal.is_some()), "chaque chapitre a un nombre de pages visé");

    // Lieux rangés, objets et faune créés.
    let places = locations::list_locations(&pool).await.unwrap();
    assert_eq!(places.len(), parsed.data.locations.len());
    assert!(places.iter().filter(|l| l.parent_id.is_some()).count() >= 10);
    assert_eq!(world::list_entries(&pool, Module::Item).await.unwrap().len(), parsed.data.items.len());
    assert_eq!(world::list_entries(&pool, Module::Species).await.unwrap().len(), parsed.data.species.len());

    // Le synopsis garde la version envoyée à l'éditrice, plus courte que l'actuelle.
    let synopsis = synopsis_service::get_synopsis(&pool).await.unwrap();
    let versions = history::list_versions(&pool, "synopsis", &synopsis.id).await.unwrap();
    assert!(versions.versions.iter().any(|v| v.name.starts_with("Synopsis envoyé")));
    assert!(synopsis.content.contains("Récifs Hurlants"));

    // Trame : chaque événement placé sur une page ou un chapitre existe.
    let plot = plot_service::get(&pool).await.unwrap();
    assert!(!plot.data.contains("\"@"), "référence non résolue dans la trame");

    assert_eq!(characters::list_characters(&pool).await.unwrap().len(), parsed.data.characters.len());
    assert!(manga::settings(&pool).await.unwrap().panel_words_max.is_some());
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM work_days").await, 0);
}

#[tokio::test]
async fn each_space_has_its_own_example_and_trash_allows_a_new_one() {
    let env = env().await;
    let public = create(&env.state, &Viewer::Guest, "roman").await.unwrap().project;

    let account = alice(&env).await;
    // Le compte ne voit pas l'exemple public comme le sien : il en crée un privé.
    let private = create(&env.state, &account, "roman").await.unwrap();
    assert!(private.created);
    assert_ne!(private.project.id, public.id);
    assert_eq!(private.project.visibility, ProjectVisibility::Private);
    assert_eq!(project_service::find_demo_for_viewer(&env.state.app_db, "roman", &account).await.unwrap(), Some(private.project.id.clone()));
    assert_eq!(project_service::find_demo_for_viewer(&env.state.app_db, "roman", &Viewer::Guest).await.unwrap(), Some(public.id.clone()));

    // L'exemple modifié n'est jamais remplacé…
    let pool = project_storage::pool_for_viewer(&env.state, &private.project.id, &account).await.unwrap();
    synopsis_service::update_synopsis(&pool, "<p>Mon synopsis</p>", &[], &[], &[]).await.unwrap();
    let again = create(&env.state, &account, "roman").await.unwrap();
    assert!(!again.created);
    assert_eq!(synopsis_service::get_synopsis(&pool).await.unwrap().content, "<p>Mon synopsis</p>");

    // … mais, une fois à la corbeille, on peut en recréer un neuf.
    project_service::trash_for_viewer(&env.state.app_db, &private.project.id, &account).await.unwrap();
    let fresh = create(&env.state, &account, "roman").await.unwrap();
    assert!(fresh.created);
    assert_ne!(fresh.project.id, private.project.id);
}

#[tokio::test]
async fn a_failed_build_leaves_nothing_behind() {
    const BROKEN: Source = Source {
        id: "cassé",
        data: r#"{"format":1,"project":{"name":"Cassé","description":"","type":"novel","status":"preparing"},
                  "card":{"pitch":"","highlights":[]},
                  "structure":{"nodes":[{"key":"a","title":"A"}]},
                  "characters":[{"key":"x","firstName":"X","lastName":"","role":"main","status":"alive","fields":{"firstAppearance":"@node:inconnu"}}]}"#,
        texts: &[],
    };
    let env = env().await;
    let error = create_from(&env.state, &Viewer::Guest, &BROKEN).await.unwrap_err();
    assert!(format!("{error:?}").contains("@node:inconnu"));
    assert_eq!(count(&env.state.app_db, "SELECT COUNT(*) FROM projects").await, 0);
    let leftovers = std::fs::read_dir(env.dir.join("projets")).map(|d| d.count()).unwrap_or(0);
    assert_eq!(leftovers, 0, "aucun dossier de projet ne doit rester");
}

#[tokio::test]
async fn examples_survive_a_ganix_export_and_import() {
    let env = env().await;
    let account = alice(&env).await;
    let (user, key) = env.state.require_session().await.unwrap();

    for demo in ids() {
        let original = create(&env.state, &account, demo).await.unwrap().project;
        let pool = project_storage::pool_for_viewer(&env.state, &original.id, &account).await.unwrap();
        let file = env.dir.join(ganix_service::suggested_file_name(&original.name));
        ganix_service::write_ganix(&pool, &original, &file, &ganix_service::work_dir(&env.dir)).await.unwrap();

        let preview = ganix_service::stage_import(&env.dir, &env.state.app_db, &user.id, &file).await.unwrap();
        let copy = ganix_service::confirm_import(&env.state, &user.id, &key, &preview.staging_id, ganix_service::ImportMode::Copy)
            .await
            .unwrap()
            .project;
        let copy_pool = project_storage::pool_for_viewer(&env.state, &copy.id, &account).await.unwrap();

        assert_eq!(table_counts(&copy_pool).await, table_counts(&pool).await, "{demo} : contenu différent après import");
        // La copie importée est un projet ordinaire, pas l'exemple.
        assert_eq!(project_service::find_demo_for_viewer(&env.state.app_db, demo, &account).await.unwrap(), Some(original.id.clone()));
    }
}
