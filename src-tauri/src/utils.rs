//! Utilitaires communs : identifiants et dates.

use chrono::{SecondsFormat, Utc};
use uuid::Uuid;

/// Nouvel identifiant unique (UUID v4) sous forme de texte.
pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Date et heure actuelles en UTC, format RFC 3339 (ex. 2026-10-04T09:30:00Z).
pub fn now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Horodatage Unix en secondes (utile pour les expirations de session).
pub fn now_unix() -> i64 {
    Utc::now().timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_uuids() {
        let (a, b) = (new_id(), new_id());
        assert_ne!(a, b);
        assert!(Uuid::parse_str(&a).is_ok());
    }

    #[test]
    fn now_utc_is_rfc3339_utc() {
        let d = now_utc();
        assert!(d.ends_with('Z'));
        assert!(chrono::DateTime::parse_from_rfc3339(&d).is_ok());
    }
}
