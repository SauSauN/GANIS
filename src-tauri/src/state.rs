//! État partagé de l'application, géré par Tauri.
//!
//! Contient la connexion à la base de données de l'application,
//! les connexions aux bases des projets, la session utilisateur active
//! (avec la clé de son compte) et les compteurs de tentatives.

use crate::error::{AppError, AppResult};
use crate::models::user::{Role, User};
use crate::security::crypto::SecretKey;
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

    /// Clé du compte connecté (voir `security`).
    ///
    /// Ouverte à la connexion avec le mot de passe, effacée de la mémoire à
    /// la déconnexion. Sans elle, aucune donnée chiffrée n'est lisible.
    account_key: Mutex<Option<SecretKey>>,

    /// Échecs de connexion récents, par nom d'utilisateur (§8.4).
    pub login_throttle: LoginThrottle,

    /// Échecs de récupération de compte (clé de récupération), par nom
    /// d'utilisateur. Compteur séparé : se tromper de mot de passe ne
    /// doit pas bloquer la récupération, et inversement.
    pub recovery_throttle: LoginThrottle,
}

impl AppState {
    /// Crée un nouvel état d'application.
    pub fn new(app_db: SqlitePool, data_dir: PathBuf) -> Self {
        Self {
            app_db,
            data_dir,
            project_pools: Mutex::new(HashMap::new()),
            current_user: Mutex::new(None),
            account_key: Mutex::new(None),
            login_throttle: LoginThrottle::new(),
            recovery_throttle: LoginThrottle::new(),
        }
    }

    // ------------------------------------------------------------------------
    // Session
    // ------------------------------------------------------------------------

    /// Ouvre une session : utilisateur (e-mail déchiffré) et clé du compte.
    ///
    /// Les connexions aux projets d'une éventuelle session précédente sont
    /// fermées d'abord.
    pub async fn open_session(&self, user: User, account_key: SecretKey) {
        self.close_project_pools().await;

        *self.account_key.lock().await = Some(account_key);
        *self.current_user.lock().await = Some(user);
    }

    /// Ferme la session : oublie l'utilisateur, efface la clé du compte et
    /// ferme les bases des projets ouverts.
    pub async fn close_session(&self) {
        *self.current_user.lock().await = None;
        // La clé est effacée de la mémoire à sa destruction (`Zeroizing`).
        *self.account_key.lock().await = None;

        self.close_project_pools().await;
    }

    /// Ferme toutes les connexions aux bases des projets.
    pub async fn close_project_pools(&self) {
        let pools: Vec<SqlitePool> = self
            .project_pools
            .lock()
            .await
            .drain()
            .map(|(_, pool)| pool)
            .collect();

        for pool in pools {
            pool.close().await;
        }
    }

    /// Clé du compte connecté.
    pub async fn require_account_key(&self) -> AppResult<SecretKey> {
        self.account_key
            .lock()
            .await
            .clone()
            .ok_or_else(AppError::unauthorized)
    }

    /// Utilisateur connecté et clé de son compte.
    pub async fn require_session(&self) -> AppResult<(User, SecretKey)> {
        let user = self.require_user().await?;
        let key = self.require_account_key().await?;

        Ok((user, key))
    }

    /// Remplace l'utilisateur de la session par sa version relue en base,
    /// après une modification (rôle, e-mail…). L'e-mail est déchiffré.
    pub async fn refresh_current_user(&self, stored: User) -> AppResult<User> {
        let key = self.require_account_key().await?;
        let user = crate::services::user_service::reveal(stored, &key)?;

        self.set_current_user(Some(user.clone())).await;

        Ok(user)
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
    pub async fn require_user(&self) -> AppResult<User> {
        self.current_user()
            .await
            .ok_or_else(AppError::unauthorized)
    }

    /// Vérifie que l'utilisateur connecté est administrateur.
    pub async fn require_admin(&self) -> AppResult<User> {
        let user = self.require_user().await?;

        if user.role != Role::Admin {
            return Err(AppError::forbidden());
        }

        Ok(user)
    }

    /// Vérifie que l'utilisateur connecté possède le rôle
    /// administrateur ou développeur.
    ///
    /// Utile pour les outils de diagnostic et les fonctionnalités
    /// réservées aux rôles techniques.
    pub async fn require_developer(&self) -> AppResult<User> {
        let user = self.require_user().await?;

        if !matches!(user.role, Role::Admin | Role::Developer) {
            return Err(AppError::forbidden());
        }

        Ok(user)
    }
}

/// Type alias pratique pour l'état géré par Tauri.
pub type ManagedState = Arc<AppState>;
