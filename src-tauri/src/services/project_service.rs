//! Service de gestion des projets narratifs.
//!
//! Les métadonnées des projets sont stockées dans la base applicative.
//! Les données narratives détaillées restent dans la base SQLite propre
//! à chaque projet.
//!
//! Chaque requête filtre sur `owner_id` : un utilisateur ne peut jamais
//! lire ni modifier le projet d'un autre compte.

use crate::error::{AppError, AppResult};
use crate::models::project::{Project, ProjectStatus, ProjectType};
use sqlx::SqlitePool;
use uuid::Uuid;

const MAX_NAME_CHARS: usize = 200;
const MAX_DESCRIPTION_CHARS: usize = 5000;

/// Colonnes lues pour construire un `Project`.
const COLUMNS: &str = "id, name, description, project_type, status, \
    is_favorite, is_archived, created_at, updated_at, last_opened_at";

/// Suffixe ajouté au nom d'un projet dupliqué.
const COPY_SUFFIX: &str = " (copie)";

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

/// Crée un nouveau projet appartenant à l'utilisateur indiqué.
pub async fn create_project(
    pool: &SqlitePool,
    owner_id: &str,
    name: &str,
    description: &str,
    project_type: ProjectType,
) -> AppResult<Project> {
    let name = name.trim();
    let description = description.trim();

    validate_name(name)?;
    validate_description(description)?;

    insert_project(
        pool,
        owner_id,
        name,
        description,
        project_type,
        ProjectStatus::Preparing,
    )
    .await
}

/// Insère une ligne dans `projects` et retourne le projet créé.
async fn insert_project(
    pool: &SqlitePool,
    owner_id: &str,
    name: &str,
    description: &str,
    project_type: ProjectType,
    status: ProjectStatus,
) -> AppResult<Project> {
    let id = Uuid::new_v4().to_string();
    let now = crate::utils::now_utc();

    sqlx::query(
        r#"
        INSERT INTO projects (
            id,
            owner_id,
            name,
            description,
            project_type,
            status,
            is_favorite,
            is_archived,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(owner_id)
    .bind(name)
    .bind(description)
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

    find_by_id_for_user(pool, &id, owner_id)
        .await?
        .ok_or_else(|| AppError::internal("Le projet créé est introuvable."))
}

/// Récupère un projet uniquement s'il appartient à l'utilisateur.
pub async fn find_by_id_for_user(
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

/// Liste uniquement les projets appartenant à l'utilisateur.
pub async fn list_projects_for_user(
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

/// Met à jour un projet existant de manière partielle.
///
/// Seuls les champs fournis (`Some(...)`) sont modifiés.
/// Les champs `None` conservent leur valeur actuelle en base.
pub async fn update_project(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
    name: Option<&str>,
    description: Option<&str>,
    project_type: Option<ProjectType>,
    status: Option<ProjectStatus>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
) -> AppResult<Project> {
    // La lecture vérifie aussi que le projet appartient à l'utilisateur.
    let current_project = find_by_id_for_user(pool, project_id, owner_id)
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

    let now = crate::utils::now_utc();

    let result = sqlx::query(
        r#"
        UPDATE projects
        SET
            name = ?,
            description = ?,
            project_type = ?,
            status = ?,
            is_favorite = ?,
            is_archived = ?,
            updated_at = ?
        WHERE id = ? AND owner_id = ?
        "#,
    )
    .bind(new_name)
    .bind(new_description)
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

    find_by_id_for_user(pool, project_id, owner_id)
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

    find_by_id_for_user(pool, project_id, owner_id)
        .await?
        .ok_or_else(project_not_found)
}

/// Duplique un projet appartenant à l'utilisateur.
///
/// La copie reprend le type et la description, avec le statut
/// « en préparation », sans favori ni archivage.
pub async fn duplicate_project(
    pool: &SqlitePool,
    project_id: &str,
    owner_id: &str,
) -> AppResult<Project> {
    let source = find_by_id_for_user(pool, project_id, owner_id)
        .await?
        .ok_or_else(project_not_found)?;

    let max_base_chars = MAX_NAME_CHARS - COPY_SUFFIX.chars().count();
    let base: String = source.name.chars().take(max_base_chars).collect();
    let copy_name = format!("{base}{COPY_SUFFIX}");

    insert_project(
        pool,
        owner_id,
        &copy_name,
        &source.description,
        source.project_type,
        ProjectStatus::Preparing,
    )
    .await
}

/// Supprime un projet de la base des métadonnées.
///
/// Les données narratives du projet restent séparées dans leur propre
/// base SQLite et seront gérées par le mécanisme de suppression de projet
/// lorsqu'il sera intégré à la gestion des fichiers du workspace.
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
