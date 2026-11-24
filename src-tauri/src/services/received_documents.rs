//! Documents reçus avec un projet importé (`.ganix`).
//!
//! Un document venu d'ailleurs peut être piégé (macro, script…). Sa première
//! ouverture dans une autre application demande donc une confirmation ;
//! une fois confirmée, ou si l'utilisateur remplace le fichier par le sien,
//! il redevient un document ordinaire.
//!
//! La liste est dans `app.db` (table `received_documents`) : rien de ce que
//! contient le `.ganix` ne peut la modifier. Les documents cachés dans la
//! corbeille du projet importé sont marqués aussi, pour le jour où ils
//! seraient restaurés.

use crate::error::{AppError, AppResult};
use crate::services::trash_service;
use crate::utils::now_utc;
use sqlx::SqlitePool;

fn db_error(context: &'static str) -> impl FnOnce(sqlx::Error) -> AppError {
    move |e| AppError::database(&e).with_detail(format!("{context} : {e}"))
}

/// Marque comme reçus tous les documents d'un projet qui vient d'être
/// importé (corbeille comprise). Les marques précédentes du projet sont
/// remplacées.
pub async fn mark_project(app_db: &SqlitePool, project_id: &str, project_pool: &SqlitePool) -> AppResult<usize> {
    let mut ids: Vec<String> = sqlx::query_scalar("SELECT id FROM structure_documents")
        .fetch_all(project_pool)
        .await
        .map_err(db_error("Liste des documents reçus"))?;

    ids.extend(trash_service::document_ids_in_trash(project_pool).await?);
    ids.sort();
    ids.dedup();

    let now = now_utc();
    let mut tx = app_db.begin().await?;

    sqlx::query("DELETE FROM received_documents WHERE project_id = ?")
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error("Effacement des documents reçus"))?;

    for id in &ids {
        sqlx::query("INSERT INTO received_documents (project_id, document_id, received_at) VALUES (?, ?, ?)")
            .bind(project_id)
            .bind(id)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(db_error("Marque d'un document reçu"))?;
    }

    tx.commit().await?;
    Ok(ids.len())
}

/// Vrai si le document est arrivé avec un projet importé et n'a pas encore
/// été ouvert ailleurs avec confirmation.
pub async fn is_received(app_db: &SqlitePool, project_id: &str, document_id: &str) -> AppResult<bool> {
    let found: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM received_documents WHERE project_id = ? AND document_id = ?")
            .bind(project_id)
            .bind(document_id)
            .fetch_optional(app_db)
            .await
            .map_err(db_error("Lecture des documents reçus"))?;

    Ok(found.is_some())
}

/// Le document devient ordinaire (ouverture confirmée, ou contenu remplacé
/// par un fichier de l'utilisateur).
pub async fn clear(app_db: &SqlitePool, project_id: &str, document_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM received_documents WHERE project_id = ? AND document_id = ?")
        .bind(project_id)
        .bind(document_id)
        .execute(app_db)
        .await
        .map_err(db_error("Effacement d'une marque de document reçu"))?;

    Ok(())
}

/// Oublie les marques d'un projet supprimé.
pub async fn forget_project(app_db: &SqlitePool, project_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM received_documents WHERE project_id = ?")
        .bind(project_id)
        .execute(app_db)
        .await
        .map_err(db_error("Effacement des documents reçus"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{run_migrations, APP_MIGRATOR, PROJECT_MIGRATOR};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory(migrator: &sqlx::migrate::Migrator) -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool, migrator).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn imported_documents_are_marked_until_confirmed() {
        let app_db = memory(&APP_MIGRATOR).await;
        let project = memory(&PROJECT_MIGRATOR).await;

        sqlx::query(
            "INSERT INTO structure_nodes (id, parent_id, level, title, summary, position, created_at, updated_at) \
             VALUES ('n1', NULL, 0, 'Chapitre', '', 0, 'now', 'now')",
        )
        .execute(&project)
        .await
        .unwrap();
        let doc = crate::services::document_service::add(&project, "n1", "piege.docx", b"PK").await.unwrap();

        // Un document caché dans la corbeille du .ganix compte aussi.
        let payload = r#"{"rows":[{"table":"structure_documents","columns":["id","name"],"values":[{"t":"text","v":"cache"},{"t":"text","v":"x.docx"}]}],"undo":[]}"#;
        sqlx::query("INSERT INTO trash (id, kind, item_id, label, payload, deleted_at) VALUES ('t1', 'document', 'cache', 'x', ?, 'now')")
            .bind(payload)
            .execute(&project)
            .await
            .unwrap();

        assert_eq!(mark_project(&app_db, "p1", &project).await.unwrap(), 2);
        assert!(is_received(&app_db, "p1", &doc.id).await.unwrap());
        assert!(is_received(&app_db, "p1", "cache").await.unwrap());
        assert!(!is_received(&app_db, "p2", &doc.id).await.unwrap());

        clear(&app_db, "p1", &doc.id).await.unwrap();
        assert!(!is_received(&app_db, "p1", &doc.id).await.unwrap());

        forget_project(&app_db, "p1").await.unwrap();
        assert!(!is_received(&app_db, "p1", "cache").await.unwrap());
    }
}
