//! État partagé de l'application, géré par Tauri.
//!
//! Contient la connexion à la base de données de l'application,
//! les connexions aux bases des projets, la session utilisateur active
//! et le compteur des tentatives de connexion.

use crate::models::user::{Role, User};
use crate::services::login_throttle::LoginThrottle;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// État global de l'application, accessible depuis toutes
/// les commandes Tauri.
pub struct AppState {
    /// Connexion à la base de données de l'application.
    pub app_db: SqlitePool,

    /// Dossier de données de l'application.
    ///
    /// Les bases des projets y sont rangées dans `projets/<id>/`.
    pub data_dir: PathBuf,

    /// Connexions ouvertes aux bases des projets, par identifiant de projet.
    ///
    /// Une seule connexion par projet, partagée entre toutes les commandes.
    /// Ce cache est géré uniquement par `services::project_storage`.
    pub project_pools: Mutex<HashMap<String, SqlitePool>>,

    /// Session utilisateur active.
    ///
    /// `None` lorsqu'aucun utilisateur n'est connecté.
    pub current_user: Mutex<Option<User>>,

    /// Échecs de connexion récents, par nom d'utilisateur (§8.4).
    pub login_throttle: LoginThrottle,
}

impl AppState {
    /// Crée un nouvel état d'application.
    pub fn new(app_db: SqlitePool, data_dir: PathBuf) -> Self {
        Self {
            app_db,
            data_dir,
            project_pools: Mutex::new(HashMap::new()),
            current_user: Mutex::new(None),
            login_throttle: LoginThrottle::new(),
        }
    }

    /// Récupère une copie de l'utilisateur actuellement connecté.
    pub async fn current_user(&self) -> Option<User> {
        self.current_user.lock().await.clone()
    }

    /// Définit l'utilisateur actuellement connecté.
    ///
    /// `Some(user)` ouvre une session.
    /// `None` ferme la session.
    pub async fn set_current_user(&self, user: Option<User>) {
        let mut guard = self.current_user.lock().await;
        *guard = user;
    }

    /// Vérifie qu'un utilisateur est connecté.
    ///
    /// Retourne l'utilisateur courant si une session existe.
    pub async fn require_user(&self) -> crate::error::AppResult<User> {
        self.current_user()
            .await
            .ok_or_else(crate::error::AppError::unauthorized)
    }

    /// Vérifie que l'utilisateur connecté est administrateur.
    pub async fn require_admin(&self) -> crate::error::AppResult<User> {
        let user = self.require_user().await?;

        if user.role != Role::Admin {
            return Err(crate::error::AppError::forbidden());
        }

        Ok(user)
    }

    /// Vérifie que l'utilisateur connecté possède le rôle
    /// administrateur ou développeur.
    ///
    /// Utile pour les outils de diagnostic et les fonctionnalités
    /// réservées aux rôles techniques.
    pub async fn require_developer(&self) -> crate::error::AppResult<User> {
        let user = self.require_user().await?;

        if !matches!(user.role, Role::Admin | Role::Developer) {
            return Err(crate::error::AppError::forbidden());
        }

        Ok(user)
    }
}

/// Type alias pratique pour l'état géré par Tauri.
pub type ManagedState = Arc<AppState>;
