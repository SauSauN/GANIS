//! Service de gestion des projets narratifs.
//!
//! Les métadonnées des projets sont stockées dans la base applicative.
//! Les données narratives détaillées restent dans la base SQLite propre
//! à chaque projet.
//!
//! Chaque requête filtre sur `owner_id` : un utilisateur ne peut jamais
//! lire ni modifier le projet d'un autre compte.
//!
//! # Chiffrement
//!
//! Le nom et la description sont chiffrés avec la clé du compte
//! (`name_sealed`, `description_sealed`) ; les colonnes en clair restent
//! vides. Chaque projet reçoit aussi sa propre clé, enfermée par la clé du
//! compte (`wrapped_key`), qui chiffre sa base (voir `project_storage`).
//!
//! Les fonctions publiques qui rendent un `Project` le rendent déchiffré.
//! Seul `find_stored` donne la ligne telle qu'elle est en base.
//!
//! # Projets publics
//!
//! Un projet public (créé sans connexion, ou rendu public par son
//! propriétaire) n'appartient à aucun compte : `owner_id` est NULL, nom et
//! description restent en clair, et sa clé est gardée en clair
//! (`public_key`). Les fonctions `*_for_viewer` donnent accès aux projets
//! selon la personne qui utilise l'application (voir `state::Viewer`) :
//! un invité n'atteint que les projets publics, un compte connecté ses
//! projets privés et les projets publics.

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType, ProjectVisibility};
use crate::security::crypto::{self, SecretKey};
use crate::security::aad;
use crate::state::Viewer;
use sqlx::SqlitePool;
use uuid::Uuid;

const MAX_NAME_CHARS: usize = 200;
const MAX_DESCRIPTION_CHARS: usize = 5000;

/// Colonnes lues pour construire un `Project`.
const COLUMNS: &str = "id, name, description, project_type, status, \
    is_favorite, is_archived, created_at, updated_at, last_opened_at, \
    name_sealed, description_sealed, wrapped_key, visibility, public_key";

/// Condition d'accès d'un visiteur à un projet : public, ou appartenant au
/// compte connecté. Le paramètre vaut NULL pour un invité (aucun projet
/// privé ne correspond alors).
const VIEWER_ACCESS: &str = "(visibility = 'public' OR owner_id = ?)";

/// Suffixe ajouté au nom d'un projet dupliqué.
const COPY_SUFFIX: &str = " (copie)";

/// Suffixe du nom d'un projet importé alors que l'utilisateur l'a déjà.
pub const IMPORT_SUFFIX: &str = " (importé)";

/// Longueur maximale d'un nom de projet (pour ajouter un suffixe).
pub const MAX_PROJECT_NAME_CHARS: usize = MAX_NAME_CHARS;

fn validate_name(name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::validation(
            "Le nom du projet ne peut pas être vide.",
        ).with_key("project.nameEmpty"));
    }

    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(
            "Le nom du projet ne peut pas dépasser 200 caractères.",
        ).with_key("project.nameTooLong"));
    }

    Ok(())
}

fn validate_description(description: &str) -> AppResult<()> {
    if description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(AppError::validation(
            "La description du projet ne peut pas dépasser 5000 caractères.",
        ).with_key("project.descriptionTooLong"));
    }

    Ok(())
}

fn project_not_found() -> AppError {
    AppError::not_found("Projet non trouvé ou non autorisé.").with_key("project.notFound")
}

// ----------------------------------------------------------------------------
// Chiffrement des champs et de la clé du projet
// ----------------------------------------------------------------------------

/// Nom et description chiffrés, prêts à être écrits.
pub struct SealedText {
    pub name: String,
    pub description: String,
}

/// Chiffre le nom et la description d'un projet avec la clé du compte.
pub fn seal_text(
    account_key: &SecretKey,
    project_id: &str,
    name: &str,
    description: &str,
) -> AppResult<SealedText> {
    Ok(SealedText {
        name: crypto::seal_text(account_key, &aad::field("projects", "name", project_id), name)?,
        description: crypto::seal_text(
            account_key,
            &aad::field("projects", "description", project_id),
            description,
        )?,
    })
}

/// Déchiffre le nom et la description d'un projet lu en base.
///
/// Un projet pas encore chiffré garde ses valeurs en clair.
pub fn reveal(mut project: Project, account_key: &SecretKey) -> AppResult<Project> {
    if let Some(sealed) = project.name_sealed.take() {
        project.name =
            crypto::open_text(account_key, &aad::field("projects", "name", &project.id), &sealed)?;
    }

    if let Some(sealed) = project.description_sealed.take() {
        project.description = crypto::open_text(
            account_key,
            &aad::field("projects", "description", &project.id),
            &sealed,
        )?;
    }

    Ok(project)
}

/// Enferme la clé d'un projet avec la clé du compte.
pub fn wrap_project_key(
    account_key: &SecretKey,
    project_id: &str,
    project_key: &SecretKey,
) -> AppResult<String> {
    crypto::wrap_key(account_key, &aad::project_key(project_id), project_key)
}

/// Ouvre la clé d'un projet. Un échec signale une donnée corrompue : la
/// clé du compte est forcément la bonne à ce stade.
pub fn unwrap_project_key(
    account_key: &SecretKey,
    project_id: &str,
    wrapped: &str,
) -> AppResult<SecretKey> {
    crypto::unwrap_key(account_key, &aad::project_key(project_id), wrapped)?
        .ok_or_else(|| AppError::internal("Clé du projet impossible à ouvrir"))
}

// ----------------------------------------------------------------------------
// Création
// ----------------------------------------------------------------------------

/// Crée un nouveau projet appartenant à l'utilisateur indiqué.
///
/// Retourne le projet et sa clé, qui sert à créer sa base chiffrée.
pub async fn create_project(
    pool: &SqlitePool,
    owner_id: &str,
    account_key: &SecretKey,
    name: &str,
    description: &str,
    project_type: ProjectType,
) -> AppResult<(Project, SecretKey)> {
    let name = name.trim();
    let description = description.trim();

    validate_name(name)?;
    validate_description(description)?;

    insert_project(
        pool,
        owner_id,
        account_key,
        None,
        name,
        description,
        project_type,
        ProjectStatus::Preparing,
    )
    .await
}

/// Crée la ligne d'un projet importé (.ganix). `id` : identifiant à garder
/// (`None` : nouvel identifiant, quand celui du fichier est déjà pris).
#[allow(clippy::too_many_arguments)]
pub async fn create_imported_project(
    pool: &SqlitePool,
    owner_id: &str,
    account_key: &SecretKey,
    id: Option<&str>,
    name: &str,
    description: &str,
    project_type: ProjectType,
    status: ProjectStatus,
) -> AppResult<(Project, SecretKey)> {
    let name = name.trim();
    let description = description.trim();

    validate_name(name)?;
    validate_description(description)?;

    insert_project(pool, owner_id, account_key, id, name, description, project_type, status).await
}

/// Vrai si un projet (de n'importe quel compte) porte cet identifiant.
pub async fn id_exists(pool: &SqlitePool, id: &str) -> AppResult<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT id FROM projects WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

/// Insère une ligne dans `projects`, avec une nouvelle clé de projet, et
/// retourne le projet créé (déchiffré) et sa clé.
#[allow(clippy::too_many_arguments)]
async fn insert_project(
    pool: &SqlitePool,
    owner_id: &str,
    account_key: &SecretKey,
    id: Option<&str>,
    name: &str,
    description: &str,
    project_type: ProjectType,
    status: ProjectStatus,
) -> AppResult<(Project, SecretKey)> {
    let id = id.map(str::to_owned).unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = crate::utils::now_utc();

    let project_key = SecretKey::generate();
    let wrapped_key = wrap_project_key(account_key, &id, &project_key)?;
    let sealed = seal_text(account_key, &id, name, description)?;

    sqlx::query(
        r#"
        INSERT INTO projects (
            id,
            owner_id,
            name,
            description,
            name_sealed,
            description_sealed,
            wrapped_key,
            project_type,
            status,
            is_favorite,
            is_archived,
            created_at,
            updated_at
        )
        VALUES (?, ?, '', '', ?, ?, ?, ?, ?, 0, 0, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(owner_id)
    .bind(&sealed.name)
    .bind(&sealed.description)
    .bind(&wrapped_key)
    .bind(project_type.as_str())
    .bind(status.as_str())
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(&e)
            .with_detail(format!("Échec de la création du projet : {e}"))
    })?;

    let project = find_by_id_for_user(pool, &id, owner_id, account_key)
        .await?
        .ok_or_else(|| AppError::internal("Le projet créé est introuvable."))?;

    Ok((project, project_key))
}

// ----------------------------------------------------------------------------
// Lecture
// ----------------------------------------------------------------------------

/// Ligne du projet telle qu'elle est en base (champs chiffrés, clé
/// enfermée), uniquement s'il appartient à l'utilisateur.
pub async fn find_stored(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
) -> AppResult<Option<Project>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM projects WHERE id = ? AND owner_id = ?"
    );

    let project = sqlx::query_as::<_, Project>(&sql)
        .bind(project_id)
        .bind(owner_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::database(&e)
                .with_detail(format!("Échec de la recherche du projet : {e}"))
        })?;

    Ok(project)
}

/// Récupère un projet (déchiffré) uniquement s'il appartient à l'utilisateur.
pub async fn find_by_id_for_user(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
) -> AppResult<Option<Project>> {
    find_stored(pool, project_id, owner_id)
        .await?
        .map(|project| reveal(project, account_key))
        .transpose()
}

/// Lignes des projets de l'utilisateur, telles qu'elles sont en base.
pub async fn list_stored_for_user(
    pool: &SqlitePool,
    owner_id: &str,
) -> AppResult<Vec<Project>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM projects WHERE owner_id = ? \
         ORDER BY updated_at DESC"
    );

    let projects = sqlx::query_as::<_, Project>(&sql)
        .bind(owner_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::database(&e)
                .with_detail(format!("Échec de la liste des projets : {e}"))
        })?;

    Ok(projects)
}

/// Liste uniquement les projets appartenant à l'utilisateur (déchiffrés).
pub async fn list_projects_for_user(
    pool: &SqlitePool,
    owner_id: &str,
    account_key: &SecretKey,
) -> AppResult<Vec<Project>> {
    let stored = list_stored_for_user(pool, owner_id).await?;
    let mut projects = Vec::with_capacity(stored.len());

    // Un projet dont le nom ou la description ne se déchiffre plus (ligne
    // abîmée) est écarté de la liste au lieu de faire échouer tout le
    // tableau de bord. Il n'est ni modifié ni supprimé : l'erreur est
    // journalisée pour pouvoir le réparer.
    for project in stored {
        let id = project.id.clone();

        match reveal(project, account_key) {
            Ok(project) => projects.push(project),
            Err(error) => tracing::error!(
                project = %id,
                error = %error,
                detail = error.detail().unwrap_or_default(),
                "Projet illisible écarté de la liste"
            ),
        }
    }

    Ok(projects)
}

/// Identifiants des projets d'un utilisateur (sans rien déchiffrer).
///
/// Sert à un administrateur qui supprime un compte : il n'a pas la clé de
/// ce compte, et n'a besoin que des dossiers à effacer.
pub async fn list_project_ids_for_user(
    pool: &SqlitePool,
    owner_id: &str,
) -> AppResult<Vec<String>> {
    sqlx::query_scalar("SELECT id FROM projects WHERE owner_id = ?")
        .bind(owner_id)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::database(&e)
                .with_detail(format!("Échec de la liste des projets : {e}"))
        })
}

// ----------------------------------------------------------------------------
// Modification
// ----------------------------------------------------------------------------

/// Met à jour un projet existant de manière partielle.
///
/// Seuls les champs fournis (`Some(...)`) sont modifiés.
/// Les champs `None` conservent leur valeur actuelle en base.
#[allow(clippy::too_many_arguments)]
pub async fn update_project(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
    name: Option<&str>,
    description: Option<&str>,
    project_type: Option<ProjectType>,
    status: Option<ProjectStatus>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
) -> AppResult<Project> {
    // La lecture vérifie aussi que le projet appartient à l'utilisateur.
    let current_project = find_by_id_for_user(pool, project_id, owner_id, account_key)
        .await?
        .ok_or_else(project_not_found)?;

    let new_name = name.unwrap_or(&current_project.name).trim();
    let new_description = description
        .unwrap_or(&current_project.description)
        .trim();
    let new_project_type = project_type.unwrap_or(current_project.project_type);
    let new_status = status.unwrap_or(current_project.status);
    let new_is_favorite = is_favorite.unwrap_or(current_project.is_favorite);
    let new_is_archived = is_archived.unwrap_or(current_project.is_archived);

    validate_name(new_name)?;
    validate_description(new_description)?;

    // Toujours écrits chiffrés, même pour un projet pas encore chiffré :
    // son chiffrement complet relira ces valeurs déchiffrées.
    let sealed = seal_text(account_key, project_id, new_name, new_description)?;

    let now = crate::utils::now_utc();

    let result = sqlx::query(
        r#"
        UPDATE projects
        SET
            name = '',
            description = '',
            name_sealed = ?,
            description_sealed = ?,
            project_type = ?,
            status = ?,
            is_favorite = ?,
            is_archived = ?,
            updated_at = ?
        WHERE id = ? AND owner_id = ?
        "#,
    )
    .bind(&sealed.name)
    .bind(&sealed.description)
    .bind(new_project_type.as_str())
    .bind(new_status.as_str())
    .bind(new_is_favorite)
    .bind(new_is_archived)
    .bind(&now)
    .bind(project_id)
    .bind(owner_id)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(&e)
            .with_detail(format!("Échec de la mise à jour du projet : {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    find_by_id_for_user(pool, project_id, owner_id, account_key)
        .await?
        .ok_or_else(|| {
            AppError::internal("Projet introuvable après la mise à jour.")
        })
}

/// Enregistre l'ouverture d'un projet et le retourne.
///
/// Seule `last_opened_at` change : la date de modification
/// (`updated_at`) reste celle de la dernière modification réelle.
pub async fn mark_opened(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
) -> AppResult<Project> {
    let now = crate::utils::now_utc();

    let result = sqlx::query(
        r#"
        UPDATE projects
        SET last_opened_at = ?
        WHERE id = ? AND owner_id = ?
        "#,
    )
    .bind(&now)
    .bind(project_id)
    .bind(owner_id)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(&e)
            .with_detail(format!("Échec de l'ouverture du projet : {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    find_by_id_for_user(pool, project_id, owner_id, account_key)
        .await?
        .ok_or_else(project_not_found)
}

/// Duplique un projet appartenant à l'utilisateur.
///
/// La copie reprend le type et la description, avec le statut
/// « en préparation », sans favori ni archivage. Elle a sa propre clé.
pub async fn duplicate_project(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
) -> AppResult<(Project, SecretKey)> {
    let source = find_by_id_for_user(pool, project_id, owner_id, account_key)
        .await?
        .ok_or_else(project_not_found)?;

    let max_base_chars = MAX_NAME_CHARS - COPY_SUFFIX.chars().count();
    let base: String = source.name.chars().take(max_base_chars).collect();
    let copy_name = format!("{base}{COPY_SUFFIX}");

    insert_project(
        pool,
        owner_id,
        account_key,
        None,
        &copy_name,
        &source.description,
        source.project_type,
        ProjectStatus::Preparing,
    )
    .await
}

/// Supprime un projet de la base des métadonnées.
///
/// Sa clé, enfermée dans cette ligne, disparaît avec elle : même si le
/// dossier du projet ne pouvait pas être effacé, sa base resterait
/// définitivement illisible.
pub async fn delete_project(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
) -> AppResult<()> {
    let result = sqlx::query(
        r#"
        DELETE FROM projects
        WHERE id = ? AND owner_id = ?
        "#,
    )
    .bind(project_id)
    .bind(owner_id)
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(&e)
            .with_detail(format!("Échec de la suppression du projet : {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    Ok(())
}
// ----------------------------------------------------------------------------
// Accès selon le visiteur : projets publics et privés
// ----------------------------------------------------------------------------

/// Ligne d'un projet telle qu'elle est en base, si le visiteur y a accès
/// (projet public, ou projet privé de son compte).
pub async fn find_stored_for_viewer(
    pool: &SqlitePool,
    project_id: &str,
    viewer: &Viewer,
) -> AppResult<Option<Project>> {
    let sql = format!("SELECT {COLUMNS} FROM projects WHERE id = ? AND {VIEWER_ACCESS}");

    sqlx::query_as::<_, Project>(&sql)
        .bind(project_id)
        .bind(viewer.user_id())
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            AppError::database(&e).with_detail(format!("Échec de la recherche du projet : {e}"))
        })
}

/// Déchiffre un projet lu en base pour le visiteur : un projet public est
/// déjà en clair ; un projet privé demande la clé du compte connecté.
pub fn reveal_for_viewer(mut project: Project, viewer: &Viewer) -> AppResult<Project> {
    if project.is_public() {
        project.name_sealed = None;
        project.description_sealed = None;
        return Ok(project);
    }

    let key = viewer.account_key().ok_or_else(project_not_found)?;
    reveal(project, key)
}

/// Clé de la base d'un projet, pour le visiteur.
pub fn project_key_for_viewer(project: &Project, viewer: &Viewer) -> AppResult<SecretKey> {
    if project.is_public() {
        let encoded = project
            .public_key
            .as_deref()
            .ok_or_else(|| AppError::internal("Projet public sans clé"))?;
        return SecretKey::from_base64(encoded);
    }

    let key = viewer.account_key().ok_or_else(project_not_found)?;
    let wrapped = project
        .wrapped_key
        .as_deref()
        .ok_or_else(|| AppError::internal("Projet sans clé"))?;

    unwrap_project_key(key, &project.id, wrapped)
}

/// Projet (déchiffré) si le visiteur y a accès.
pub async fn find_for_viewer(
    pool: &SqlitePool,
    project_id: &str,
    viewer: &Viewer,
) -> AppResult<Option<Project>> {
    find_stored_for_viewer(pool, project_id, viewer)
        .await?
        .map(|project| reveal_for_viewer(project, viewer))
        .transpose()
}

/// Projets accessibles au visiteur (déchiffrés), du plus récemment modifié
/// au plus ancien : projets publics, et projets privés du compte connecté.
pub async fn list_for_viewer(pool: &SqlitePool, viewer: &Viewer) -> AppResult<Vec<Project>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM projects WHERE visibility = 'public' OR owner_id = ? \
         ORDER BY updated_at DESC"
    );

    let stored = sqlx::query_as::<_, Project>(&sql)
        .bind(viewer.user_id())
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::database(&e).with_detail(format!("Échec de la liste des projets : {e}"))
        })?;

    let mut projects = Vec::with_capacity(stored.len());

    // Comme `list_projects_for_user` : une ligne abîmée est écartée et
    // journalisée, sans faire échouer tout le tableau de bord.
    for project in stored {
        let id = project.id.clone();

        match reveal_for_viewer(project, viewer) {
            Ok(project) => projects.push(project),
            Err(error) => tracing::error!(
                project = %id,
                error = %error,
                detail = error.detail().unwrap_or_default(),
                "Projet illisible écarté de la liste"
            ),
        }
    }

    Ok(projects)
}

/// Insère un projet public : sans propriétaire, nom et description en
/// clair, clé conservée telle quelle. Retourne le projet et sa clé.
async fn insert_public_project(
    pool: &SqlitePool,
    name: &str,
    description: &str,
    project_type: ProjectType,
    status: ProjectStatus,
) -> AppResult<(Project, SecretKey)> {
    let id = Uuid::new_v4().to_string();
    let now = crate::utils::now_utc();
    let project_key = SecretKey::generate();

    sqlx::query(
        r#"
        INSERT INTO projects (
            id, owner_id, name, description,
            project_type, status, is_favorite, is_archived,
            created_at, updated_at, visibility, public_key
        )
        VALUES (?, NULL, ?, ?, ?, ?, 0, 0, ?, ?, 'public', ?)
        "#,
    )
    .bind(&id)
    .bind(name)
    .bind(description)
    .bind(project_type.as_str())
    .bind(status.as_str())
    .bind(&now)
    .bind(&now)
    .bind(project_key.to_base64().as_str())
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::database(&e).with_detail(format!("Échec de la création du projet : {e}"))
    })?;

    let project = find_for_viewer(pool, &id, &Viewer::Guest)
        .await?
        .ok_or_else(|| AppError::internal("Le projet créé est introuvable."))?;

    Ok((project, project_key))
}

/// Crée un projet public (accessible sans connexion).
pub async fn create_public_project(
    pool: &SqlitePool,
    name: &str,
    description: &str,
    project_type: ProjectType,
) -> AppResult<(Project, SecretKey)> {
    let name = name.trim();
    let description = description.trim();

    validate_name(name)?;
    validate_description(description)?;

    insert_public_project(pool, name, description, project_type, ProjectStatus::Preparing).await
}

/// Met à jour (partiellement) un projet accessible au visiteur.
///
/// Un projet public garde son nom et sa description en clair ; un projet
/// privé les garde chiffrés avec la clé du compte.
#[allow(clippy::too_many_arguments)]
pub async fn update_for_viewer(
    pool: &SqlitePool,
    project_id: &str,
    viewer: &Viewer,
    name: Option<&str>,
    description: Option<&str>,
    project_type: Option<ProjectType>,
    status: Option<ProjectStatus>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
) -> AppResult<Project> {
    let current = find_for_viewer(pool, project_id, viewer)
        .await?
        .ok_or_else(project_not_found)?;

    let new_name = name.unwrap_or(&current.name).trim();
    let new_description = description.unwrap_or(&current.description).trim();
    let new_project_type = project_type.unwrap_or(current.project_type);
    let new_status = status.unwrap_or(current.status);
    let new_is_favorite = is_favorite.unwrap_or(current.is_favorite);
    let new_is_archived = is_archived.unwrap_or(current.is_archived);

    validate_name(new_name)?;
    validate_description(new_description)?;

    let (clear_name, clear_description, name_sealed, description_sealed) = if current.is_public() {
        (new_name.to_owned(), new_description.to_owned(), None, None)
    } else {
        let key = viewer.account_key().ok_or_else(project_not_found)?;
        let sealed = seal_text(key, project_id, new_name, new_description)?;
        (String::new(), String::new(), Some(sealed.name), Some(sealed.description))
    };

    let now = crate::utils::now_utc();

    // `visibility = ?` : si le projet a changé de visibilité entre la
    // lecture et l'écriture, rien n'est écrit (pas de nom en clair dans un
    // projet devenu privé, ni l'inverse).
    let sql = format!(
        "UPDATE projects SET name = ?, description = ?, name_sealed = ?, \
         description_sealed = ?, project_type = ?, status = ?, is_favorite = ?, \
         is_archived = ?, updated_at = ? \
         WHERE id = ? AND visibility = ? AND {VIEWER_ACCESS}"
    );

    let result = sqlx::query(&sql)
        .bind(&clear_name)
        .bind(&clear_description)
        .bind(&name_sealed)
        .bind(&description_sealed)
        .bind(new_project_type.as_str())
        .bind(new_status.as_str())
        .bind(new_is_favorite)
        .bind(new_is_archived)
        .bind(&now)
        .bind(project_id)
        .bind(current.visibility.as_str())
        .bind(viewer.user_id())
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::database(&e).with_detail(format!("Échec de la mise à jour du projet : {e}"))
        })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    find_for_viewer(pool, project_id, viewer)
        .await?
        .ok_or_else(|| AppError::internal("Projet introuvable après la mise à jour."))
}

/// Enregistre l'ouverture d'un projet accessible au visiteur.
pub async fn mark_opened_for_viewer(
    pool: &SqlitePool,
    project_id: &str,
    viewer: &Viewer,
) -> AppResult<Project> {
    let sql = format!("UPDATE projects SET last_opened_at = ? WHERE id = ? AND {VIEWER_ACCESS}");

    let result = sqlx::query(&sql)
        .bind(crate::utils::now_utc())
        .bind(project_id)
        .bind(viewer.user_id())
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::database(&e).with_detail(format!("Échec de l'ouverture du projet : {e}"))
        })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    find_for_viewer(pool, project_id, viewer)
        .await?
        .ok_or_else(project_not_found)
}

/// Duplique un projet accessible au visiteur. La copie garde la même
/// visibilité que l'original (un projet public donne une copie publique).
pub async fn duplicate_for_viewer(
    pool: &SqlitePool,
    project_id: &str,
    viewer: &Viewer,
) -> AppResult<(Project, SecretKey)> {
    let source = find_for_viewer(pool, project_id, viewer)
        .await?
        .ok_or_else(project_not_found)?;

    let max_base_chars = MAX_NAME_CHARS - COPY_SUFFIX.chars().count();
    let base: String = source.name.chars().take(max_base_chars).collect();
    let copy_name = format!("{base}{COPY_SUFFIX}");

    if source.is_public() {
        return insert_public_project(
            pool,
            &copy_name,
            &source.description,
            source.project_type,
            ProjectStatus::Preparing,
        )
        .await;
    }

    let (Some(owner_id), Some(key)) = (viewer.user_id(), viewer.account_key()) else {
        return Err(project_not_found());
    };

    insert_project(
        pool,
        owner_id,
        key,
        None,
        &copy_name,
        &source.description,
        source.project_type,
        ProjectStatus::Preparing,
    )
    .await
}

/// Supprime un projet accessible au visiteur (sa clé disparaît avec lui).
pub async fn delete_for_viewer(pool: &SqlitePool, project_id: &str, viewer: &Viewer) -> AppResult<()> {
    let sql = format!("DELETE FROM projects WHERE id = ? AND {VIEWER_ACCESS}");

    let result = sqlx::query(&sql)
        .bind(project_id)
        .bind(viewer.user_id())
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::database(&e).with_detail(format!("Échec de la suppression du projet : {e}"))
        })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    Ok(())
}

/// Change la visibilité d'un projet. Réservé à un compte connecté.
///
/// - Public → privé : le projet est rattaché au compte ; son nom et sa
///   description sont chiffrés et sa clé est enfermée par la clé du compte.
/// - Privé → public (projet du compte uniquement) : le projet n'appartient
///   plus à personne ; nom, description et clé sont gardés en clair.
///
/// La base du projet n'est pas touchée : sa clé reste la même, seule la
/// façon de la conserver change. Un projet privé d'avant le chiffrement
/// doit avoir été chiffré avant (ouverture de sa base).
pub async fn set_visibility(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    account_key: &SecretKey,
    target: ProjectVisibility,
) -> AppResult<Project> {
    let viewer = Viewer::Account {
        user_id: owner_id.to_owned(),
        key: account_key.clone(),
    };

    let current = find_stored_for_viewer(pool, project_id, &viewer)
        .await?
        .ok_or_else(project_not_found)?;

    if current.visibility == target {
        return reveal_for_viewer(current, &viewer);
    }

    let now = crate::utils::now_utc();

    let result = match target {
        ProjectVisibility::Private => {
            let project_key = project_key_for_viewer(&current, &viewer)?;
            let wrapped_key = wrap_project_key(account_key, project_id, &project_key)?;
            let sealed = seal_text(account_key, project_id, &current.name, &current.description)?;

            sqlx::query(
                r#"
                UPDATE projects
                SET owner_id = ?, visibility = 'private', public_key = NULL,
                    wrapped_key = ?, name = '', description = '',
                    name_sealed = ?, description_sealed = ?, updated_at = ?
                WHERE id = ? AND visibility = 'public'
                "#,
            )
            .bind(owner_id)
            .bind(&wrapped_key)
            .bind(&sealed.name)
            .bind(&sealed.description)
            .bind(&now)
            .bind(project_id)
            .execute(pool)
            .await
        }
        ProjectVisibility::Public => {
            if current.wrapped_key.is_none() {
                return Err(AppError::internal("Projet pas encore chiffré"));
            }

            let project_key = project_key_for_viewer(&current, &viewer)?;
            let revealed = reveal(current, account_key)?;

            sqlx::query(
                r#"
                UPDATE projects
                SET owner_id = NULL, visibility = 'public', public_key = ?,
                    wrapped_key = NULL, name = ?, description = ?,
                    name_sealed = NULL, description_sealed = NULL, updated_at = ?
                WHERE id = ? AND owner_id = ? AND visibility = 'private'
                "#,
            )
            .bind(project_key.to_base64().as_str())
            .bind(&revealed.name)
            .bind(&revealed.description)
            .bind(&now)
            .bind(project_id)
            .bind(owner_id)
            .execute(pool)
            .await
        }
    }
    .map_err(|e| {
        AppError::database(&e).with_detail(format!("Changement de visibilité impossible : {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err(project_not_found());
    }

    find_for_viewer(pool, project_id, &viewer)
        .await?
        .ok_or_else(project_not_found)
}
