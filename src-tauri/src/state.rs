//! État partagé de l'application, géré par Tauri.
//!
//! Contient la connexion à la base de données de l'application
//! et la session utilisateur active.

use crate::models::user::User;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Mutex;

/// État global de l'application, accessible depuis toutes les commandes Tauri.
pub struct AppState {
    /// Connexion à la base de données de l'application.
    pub app_db: SqlitePool,
    /// Session utilisateur active. `None` si aucun utilisateur n'est connecté.
    pub current_user: Mutex<Option<User>>,
}

impl AppState {
    /// Crée un nouvel état d'application.
    pub fn new(app_db: SqlitePool) -> Self {
        Self {
            app_db,
            current_user: Mutex::new(None),
        }
    }

    /// Récupère une copie de l'utilisateur actuellement connecté.
    pub async fn current_user(&self) -> Option<User> {
        self.current_user.lock().await.clone()
    }

    /// Définit l'utilisateur connecté.
    pub async fn set_current_user(&self, user: Option<User>) {
        let mut guard = self.current_user.lock().await;
        *guard = user;
    }

    /// Vérifie que l'utilisateur connecté possède le rôle administrateur.
    pub async fn require_admin(&self) -> crate::error::AppResult<User> {
        let user = self
            .current_user()
            .await
            .ok_or_else(crate::error::AppError::unauthorized)?;

        if user.role != crate::models::user::Role::Admin {
            return Err(crate::error::AppError::forbidden());
        }
        Ok(user)
    }
}

/// Type alias pratique pour l'état géré par Tauri.
pub type ManagedState = Arc<AppState>;