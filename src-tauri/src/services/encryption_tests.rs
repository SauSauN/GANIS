//! Tests de bout en bout du chiffrement : comptes, projets, récupération.
//!
//! Chaque test travaille dans un dossier temporaire, avec une vraie base
//! de l'application et de vraies bases de projet chiffrées.

use crate::db::init_app_db;
use crate::db::project_db::{self, open_db, DB_FILE};
use crate::models::project::ProjectType;
use crate::models::user::Role;
use crate::services::{auth_service, keyring_service, project_service, project_storage};
use crate::state::AppState;
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
    let dir = std::env::temp_dir().join(format!("ganis-flow-{}", uuid::Uuid::new_v4()));
    let app_db = init_app_db(&dir).await.unwrap();

    TestEnv {
        state: AppState::new(app_db, dir.clone()),
        dir,
    }
}

/// Crée l'administrateur puis un utilisateur, et lui crée une clé de
/// récupération depuis ses paramètres ; retourne cette clé. L'utilisateur
/// est déconnecté à la fin.
async fn register_alice(env: &TestEnv) -> String {
    auth_service::setup_first_admin(&env.state.app_db, "admin", "admin1234", None)
        .await
        .unwrap();

    let created = auth_service::register_user(
        &env.state.app_db,
        "alice",
        "motdepasse1",
        Some("alice@exemple.fr"),
    )
    .await
    .unwrap();

    // Clé donnée à l'inscription seulement si l'option est activée.
    assert_eq!(
        created.recovery_key.is_some(),
        keyring_service::RECOVERY_KEY_ON_SIGNUP
    );

    login(env, "alice", "motdepasse1").await;
    let key = auth_service::regenerate_recovery_key(&env.state, "motdepasse1")
        .await
        .unwrap()
        .display();
    auth_service::logout_user(&env.state).await.unwrap();

    key
}

async fn login(env: &TestEnv, username: &str, password: &str) -> Option<String> {
    auth_service::login_user(&env.state, username, password)
        .await
        .map(|outcome| outcome.recovery_key.map(|key| key.display()))
        .unwrap()
}

/// Crée un projet et écrit un texte dans son synopsis.
async fn create_project_with_text(env: &TestEnv, name: &str, text: &str) -> String {
    let (user, account_key) = env.state.require_session().await.unwrap();

    let (project, project_key) = project_service::create_project(
        &env.state.app_db,
        &user.id,
        &account_key,
        name,
        "Une description",
        ProjectType::Novel,
    )
    .await
    .unwrap();

    project_storage::create_storage(&env.state, &project.id, &project_key)
        .await
        .unwrap();

    let pool = project_storage::pool_for_user(&env.state, &project.id, &user.id)
        .await
        .unwrap();

    sqlx::query("UPDATE synopsis SET content = ? WHERE id = 'default'")
        .bind(text)
        .execute(&pool)
        .await
        .unwrap();

    project.id
}

async fn read_text(env: &TestEnv, project_id: &str) -> String {
    let user = env.state.require_user().await.unwrap();
    let pool = project_storage::pool_for_user(&env.state, project_id, &user.id)
        .await
        .unwrap();

    sqlx::query_scalar("SELECT content FROM synopsis WHERE id = 'default'")
        .fetch_one(&pool)
        .await
        .unwrap()
}

fn db_path(env: &TestEnv, project_id: &str) -> PathBuf {
    project_storage::project_dir(&env.state, project_id)
        .unwrap()
        .join(DB_FILE)
}

/// Vrai si `needle` apparaît en clair dans le fichier.
fn file_contains(path: &PathBuf, needle: &str) -> bool {
    let bytes = std::fs::read(path).unwrap_or_default();
    bytes
        .windows(needle.len())
        .any(|window| window == needle.as_bytes())
}

/// Vrai si `needle` apparaît en clair dans la base de l'application
/// (fichier principal et journal WAL).
fn app_db_contains(env: &TestEnv, needle: &str) -> bool {
    ["app.db", "app.db-wal"]
        .iter()
        .any(|name| file_contains(&env.dir.join(name), needle))
}

// ----------------------------------------------------------------------------

#[tokio::test]
async fn project_data_is_encrypted_on_disk_and_readable_after_login() {
    let env = env().await;
    register_alice(&env).await;

    assert_eq!(login(&env, "alice", "motdepasse1").await, None);

    let id = create_project_with_text(&env, "Mon roman secret", "Le trésor est sous le chêne").await;

    auth_service::logout_user(&env.state).await.unwrap();

    // Sur le disque : rien de lisible.
    let path = db_path(&env, &id);
    assert!(!project_db::is_plaintext_sqlite(&path));
    assert!(!file_contains(&path, "trésor"));
    assert!(!app_db_contains(&env, "Mon roman secret"));
    assert!(!app_db_contains(&env, "alice@exemple.fr"));

    // Une fois déconnecté, la clé n'est plus en mémoire.
    assert!(env.state.require_account_key().await.is_err());

    login(&env, "alice", "motdepasse1").await;

    assert_eq!(read_text(&env, &id).await, "Le trésor est sous le chêne");

    let (user, key) = env.state.require_session().await.unwrap();
    assert_eq!(user.email.as_deref(), Some("alice@exemple.fr"));

    let projects = project_service::list_projects_for_user(&env.state.app_db, &user.id, &key)
        .await
        .unwrap();
    assert_eq!(projects[0].name, "Mon roman secret");
    assert_eq!(projects[0].description, "Une description");
}

#[tokio::test]
async fn another_account_cannot_open_the_project() {
    let env = env().await;
    register_alice(&env).await;
    login(&env, "alice", "motdepasse1").await;
    let id = create_project_with_text(&env, "Projet", "Texte").await;
    auth_service::logout_user(&env.state).await.unwrap();

    auth_service::register_user(&env.state.app_db, "bob", "motdepasse2", None)
        .await
        .unwrap();
    login(&env, "bob", "motdepasse2").await;

    let bob = env.state.require_user().await.unwrap();
    assert!(project_storage::pool_for_user(&env.state, &id, &bob.id).await.is_err());

    // Même en contournant la vérification de propriétaire, la clé de Bob
    // n'ouvre pas la clé du projet d'Alice.
    let stored: Option<String> = sqlx::query_scalar("SELECT wrapped_key FROM projects WHERE id = ?")
        .bind(&id)
        .fetch_one(&env.state.app_db)
        .await
        .unwrap();
    let bob_key = env.state.require_account_key().await.unwrap();
    assert!(project_service::unwrap_project_key(&bob_key, &id, &stored.unwrap()).is_err());
}

#[tokio::test]
async fn forgotten_password_is_recovered_with_the_recovery_key() {
    let env = env().await;
    let recovery_key = register_alice(&env).await;

    login(&env, "alice", "motdepasse1").await;
    let id = create_project_with_text(&env, "Projet", "Rien n'est perdu").await;
    auth_service::logout_user(&env.state).await.unwrap();

    // Mauvaise clé : refus.
    let wrong = "000000-000000-000000-000000-000000-000000";
    assert!(auth_service::recover_account(&env.state, "alice", wrong, "nouveau123")
        .await
        .is_err());

    // Compte inconnu : même refus.
    assert!(auth_service::recover_account(&env.state, "inconnu", &recovery_key, "nouveau123")
        .await
        .is_err());

    // Bonne clé, saisie en minuscules et sans tirets.
    let typed = recovery_key.replace('-', " ").to_lowercase();
    auth_service::recover_account(&env.state, "alice", &typed, "nouveau123")
        .await
        .unwrap();

    // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
    assert!(auth_service::login_user(&env.state, "alice", "motdepasse1")
        .await
        .is_err());
    login(&env, "alice", "nouveau123").await;

    assert_eq!(read_text(&env, &id).await, "Rien n'est perdu");

    // La clé de récupération reste valable.
    auth_service::logout_user(&env.state).await.unwrap();
    auth_service::recover_account(&env.state, "alice", &recovery_key, "encore123")
        .await
        .unwrap();
    login(&env, "alice", "encore123").await;
    assert_eq!(read_text(&env, &id).await, "Rien n'est perdu");
}

#[tokio::test]
async fn changing_password_keeps_projects_and_recovery_key() {
    let env = env().await;
    let recovery_key = register_alice(&env).await;

    login(&env, "alice", "motdepasse1").await;
    let id = create_project_with_text(&env, "Projet", "Toujours là").await;

    assert!(auth_service::change_password(&env.state, "faux12345", "nouveau123")
        .await
        .is_err());
    auth_service::change_password(&env.state, "motdepasse1", "nouveau123")
        .await
        .unwrap();
    auth_service::logout_user(&env.state).await.unwrap();

    login(&env, "alice", "nouveau123").await;
    assert_eq!(read_text(&env, &id).await, "Toujours là");
    auth_service::logout_user(&env.state).await.unwrap();

    auth_service::recover_account(&env.state, "alice", &recovery_key, "autre1234")
        .await
        .unwrap();
    login(&env, "alice", "autre1234").await;
    assert_eq!(read_text(&env, &id).await, "Toujours là");
}

#[tokio::test]
async fn regenerated_recovery_key_replaces_the_old_one() {
    let env = env().await;
    let old_key = register_alice(&env).await;
    login(&env, "alice", "motdepasse1").await;
    let id = create_project_with_text(&env, "Projet", "Contenu").await;

    assert!(auth_service::regenerate_recovery_key(&env.state, "mauvais123")
        .await
        .is_err());

    let new_key = auth_service::regenerate_recovery_key(&env.state, "motdepasse1")
        .await
        .unwrap()
        .display();
    assert_ne!(new_key, old_key);

    auth_service::logout_user(&env.state).await.unwrap();

    assert!(auth_service::recover_account(&env.state, "alice", &old_key, "nouveau123")
        .await
        .is_err());
    auth_service::recover_account(&env.state, "alice", &new_key, "nouveau123")
        .await
        .unwrap();

    login(&env, "alice", "nouveau123").await;
    assert_eq!(read_text(&env, &id).await, "Contenu");
}

#[tokio::test]
async fn duplicated_project_has_its_own_key() {
    let env = env().await;
    register_alice(&env).await;
    login(&env, "alice", "motdepasse1").await;
    let id = create_project_with_text(&env, "Original", "Texte copié").await;

    let (user, key) = env.state.require_session().await.unwrap();
    let (copy, copy_key) =
        project_service::duplicate_project(&env.state.app_db, &id, &user.id, &key)
            .await
            .unwrap();
    project_storage::duplicate_storage(&env.state, &id, &copy.id, &user.id, &copy_key)
        .await
        .unwrap();

    assert_eq!(copy.name, "Original (copie)");
    assert_eq!(read_text(&env, &copy.id).await, "Texte copié");

    let wrapped: Vec<Option<String>> = sqlx::query_scalar("SELECT wrapped_key FROM projects")
        .fetch_all(&env.state.app_db)
        .await
        .unwrap();
    assert_eq!(wrapped.len(), 2);
    assert_ne!(wrapped[0], wrapped[1]);
    assert!(!project_db::is_plaintext_sqlite(&db_path(&env, &copy.id)));
}

/// Compte et projet créés par une version antérieure au chiffrement.
async fn insert_legacy_project(env: &TestEnv, owner_id: &str, name: &str, text: &str) -> String {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO projects (id, owner_id, name, description, project_type, status, \
         is_favorite, is_archived, created_at, updated_at, db_ready) \
         VALUES (?, ?, ?, 'Ancienne description', 'novel', 'preparing', 0, 0, 'x', 'x', 1)",
    )
    .bind(&id)
    .bind(owner_id)
    .bind(name)
    .execute(&env.state.app_db)
    .await
    .unwrap();

    let path = db_path(env, &id);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();

    let plain = open_db(&path, None).await.unwrap();
    sqlx::query("UPDATE synopsis SET content = ? WHERE id = 'default'")
        .bind(text)
        .execute(&plain)
        .await
        .unwrap();
    plain.close().await;

    assert!(project_db::is_plaintext_sqlite(&path));
    id
}

#[tokio::test]
async fn legacy_account_and_projects_are_encrypted_at_first_login() {
    let env = env().await;

    auth_service::setup_first_admin(&env.state.app_db, "admin", "admin1234", None)
        .await
        .unwrap();

    // Compte sans trousseau, e-mail en clair : comme avant le chiffrement.
    let legacy = auth_service::create_user_with_role(
        &env.state.app_db,
        "ancien",
        "motdepasse1",
        Some("ancien@exemple.fr"),
        Role::User,
    )
    .await
    .unwrap();

    let id = insert_legacy_project(&env, &legacy.id, "Vieux projet", "Écrit avant").await;
    assert!(app_db_contains(&env, "ancien@exemple.fr"));

    // Première connexion : le trousseau est créé. La clé de récupération
    // n'est donnée (une seule fois) que si l'option est activée.
    let given = login(&env, "ancien", "motdepasse1").await;
    assert_eq!(given.is_some(), keyring_service::RECOVERY_KEY_ON_SIGNUP);
    auth_service::logout_user(&env.state).await.unwrap();

    // Le projet et l'e-mail sont chiffrés.
    let path = db_path(&env, &id);
    assert!(!project_db::is_plaintext_sqlite(&path));
    assert!(!file_contains(&path, "Écrit avant"));
    assert!(!path.with_file_name("project.db.encrypting").exists());

    let (name, email): (String, Option<String>) = sqlx::query_as(
        "SELECT p.name, u.email FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?",
    )
    .bind(&id)
    .fetch_one(&env.state.app_db)
    .await
    .unwrap();
    assert_eq!(name, "");
    assert_eq!(email, None);

    // Plus aucune trace en clair dans la base de l'application, même dans
    // l'espace libéré par les anciennes valeurs.
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&env.state.app_db)
        .await
        .unwrap();
    assert!(!app_db_contains(&env, "ancien@exemple.fr"));
    assert!(!app_db_contains(&env, "Vieux projet"));

    // Connexion suivante : plus de clé à montrer, données intactes.
    assert_eq!(login(&env, "ancien", "motdepasse1").await, None);
    assert_eq!(read_text(&env, &id).await, "Écrit avant");

    let (user, key) = env.state.require_session().await.unwrap();
    assert_eq!(user.email.as_deref(), Some("ancien@exemple.fr"));
    let project = project_service::find_by_id_for_user(&env.state.app_db, &id, &user.id, &key)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(project.name, "Vieux projet");
    assert_eq!(project.description, "Ancienne description");

    // Une clé de récupération créée ensuite fonctionne pour ce compte.
    let recovery_key = auth_service::regenerate_recovery_key(&env.state, "motdepasse1")
        .await
        .unwrap()
        .display();
    auth_service::logout_user(&env.state).await.unwrap();
    auth_service::recover_account(&env.state, "ancien", &recovery_key, "nouveau123")
        .await
        .unwrap();
    login(&env, "ancien", "nouveau123").await;
    assert_eq!(read_text(&env, &id).await, "Écrit avant");
}

#[tokio::test]
async fn interrupted_encryption_is_completed() {
    let env = env().await;
    register_alice(&env).await;
    login(&env, "alice", "motdepasse1").await;
    let user = env.state.require_user().await.unwrap();
    let id = create_project_with_text(&env, "Projet", "Survit à la panne").await;

    // Simule un arrêt entre les étapes 2 et 3 : la clé est enregistrée, la
    // copie chiffrée est prête à côté, et `project.db` est encore « l'ancienne ».
    env.state.close_project_pools().await;
    let path = db_path(&env, &id);
    let encrypting = path.with_file_name("project.db.encrypting");
    std::fs::rename(&path, &encrypting).unwrap();
    std::fs::write(&path, b"ancienne base en clair").unwrap();

    let pool = project_storage::pool_for_user(&env.state, &id, &user.id)
        .await
        .unwrap();
    let text: String = sqlx::query_scalar("SELECT content FROM synopsis WHERE id = 'default'")
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(text, "Survit à la panne");
    assert!(!encrypting.exists());
}

#[tokio::test]
async fn recovery_attempts_are_limited() {
    let env = env().await;
    let recovery_key = register_alice(&env).await;
    let wrong = "000000-000000-000000-000000-000000-000000";

    for _ in 0..5 {
        let _ = auth_service::recover_account(&env.state, "alice", wrong, "nouveau123").await;
    }

    // Bloqué, même avec la bonne clé.
    let error = auth_service::recover_account(&env.state, "alice", &recovery_key, "nouveau123")
        .await
        .unwrap_err();
    assert_eq!(error.code, crate::error::ErrorCode::Forbidden);
}

#[tokio::test]
async fn account_without_recovery_key_cannot_be_recovered() {
    let env = env().await;

    auth_service::setup_first_admin(&env.state.app_db, "admin", "admin1234", None)
        .await
        .unwrap();
    auth_service::register_user(&env.state.app_db, "bob", "motdepasse2", None)
        .await
        .unwrap();

    if keyring_service::RECOVERY_KEY_ON_SIGNUP {
        return;
    }

    // Aucune clé n'existe : toute clé est refusée, avec le message habituel.
    let any_key = crate::security::recovery_key::RecoveryKey::generate().display();
    let error = auth_service::recover_account(&env.state, "bob", &any_key, "nouveau123")
        .await
        .unwrap_err();
    assert_eq!(error.key, Some("recovery.invalid"));

    // Le mot de passe d'origine fonctionne toujours.
    assert_eq!(login(&env, "bob", "motdepasse2").await, None);
}
