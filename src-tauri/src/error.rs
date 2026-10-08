//! Type d'erreur commun renvoyé à l'interface.
//! Seuls `code` et `message` sortent de Rust ; `detail` ne va que dans le journal.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::fmt;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Internal,
    Validation,
    NotFound,
    Unauthorized,
    Forbidden,
    Conflict,
    Database,
    Io,
}

#[derive(Debug)]
pub struct AppError {
    pub code: ErrorCode,
    /// Message affichable à l'utilisateur (aucune donnée sensible).
    pub message: String,
    /// Détail technique : journalisé, jamais envoyé à l'interface.
    detail: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: impl fmt::Display) -> Self {
        self.detail = Some(detail.to_string());
        self
    }

    pub fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }

    pub fn internal(detail: impl fmt::Display) -> Self {
        Self::new(ErrorCode::Internal, "Une erreur interne est survenue.").with_detail(detail)
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Validation, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Conflict, message)
    }

    /// Aucune session ouverte : la commande exige d'être connecté.
    pub fn unauthorized() -> Self {
        Self::new(ErrorCode::Unauthorized, "Authentification requise.")
    }

    /// Connexion refusée.
    ///
    /// Le même message est utilisé que le nom d'utilisateur soit inconnu ou
    /// que le mot de passe soit faux, pour ne pas révéler quels comptes existent.
    pub fn invalid_credentials() -> Self {
        Self::new(
            ErrorCode::Unauthorized,
            "Nom d'utilisateur ou mot de passe incorrect.",
        )
    }

    /// Trop de tentatives de connexion : l'utilisateur doit patienter.
    pub fn too_many_attempts(retry_after: Duration) -> Self {
        // Arrondi à la seconde supérieure, au moins une seconde.
        let seconds = (retry_after.as_secs()
            + u64::from(retry_after.subsec_nanos() > 0))
        .max(1);

        let wait = if seconds < 60 {
            format!("{seconds} s")
        } else {
            format!("{} min", seconds.div_ceil(60))
        };

        Self::new(
            ErrorCode::Forbidden,
            format!("Trop de tentatives de connexion. Réessayez dans {wait}."),
        )
    }

    pub fn forbidden() -> Self {
        Self::new(ErrorCode::Forbidden, "Vous n'avez pas les droits nécessaires.")
    }

    pub fn database(detail: impl fmt::Display) -> Self {
        Self::new(ErrorCode::Database, "Erreur d'accès aux données.").with_detail(detail)
    }

    pub fn io(detail: impl fmt::Display) -> Self {
        Self::new(ErrorCode::Io, "Erreur de lecture ou d'écriture.").with_detail(detail)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // Le détail technique est écrit dans le journal au moment de l'envoi.
        if let Some(detail) = &self.detail {
            tracing::error!(code = ?self.code, detail = %detail, "{}", self.message);
        }
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", &self.code)?;
        s.serialize_field("message", &self.message)?;
        s.end()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::io(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::internal(e)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::database(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialization_hides_technical_detail() {
        let err = AppError::internal("chemin secret C:\\Users\\x");
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("INTERNAL"));
        assert!(!json.contains("secret"));
    }

    #[test]
    fn too_many_attempts_rounds_up() {
        let err = AppError::too_many_attempts(Duration::from_millis(29_100));
        assert!(err.message.contains("30 s"));

        let err = AppError::too_many_attempts(Duration::from_secs(61));
        assert!(err.message.contains("2 min"));

        let err = AppError::too_many_attempts(Duration::ZERO);
        assert!(err.message.contains("1 s"));
    }
}
