//! Limitation des tentatives de connexion (§8.4 du cahier des charges).
//!
//! Règles :
//! - 5 échecs consécutifs pour un même nom d'utilisateur sont tolérés ;
//! - au 5e échec, la connexion est bloquée 30 s, puis 1 min, 2 min, 4 min…
//!   à chaque nouvel échec, jusqu'à 15 min au maximum ;
//! - une connexion réussie remet le compteur à zéro ;
//! - les échecs de plus d'une heure sont oubliés.
//!
//! Les noms d'utilisateur inconnus sont comptés comme les autres, pour ne pas
//! révéler quels comptes existent. La casse est ignorée (« Alice » = « alice »).
//!
//! Les compteurs sont gardés en mémoire et disparaissent à la fermeture de
//! l'application. Pour un logiciel local, le but est de freiner un essai
//! automatisé de mots de passe, pas de résister à un redémarrage.

use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Nombre d'échecs tolérés avant le premier blocage.
const FREE_ATTEMPTS: u32 = 5;

/// Durée du premier blocage.
const BASE_LOCK: Duration = Duration::from_secs(30);

/// Durée maximale d'un blocage.
const MAX_LOCK: Duration = Duration::from_secs(15 * 60);

/// Délai au-delà duquel les échecs passés sont oubliés.
const FORGET_AFTER: Duration = Duration::from_secs(60 * 60);

/// Nombre maximal de noms suivis en mémoire.
const MAX_ENTRIES: usize = 1_000;

#[derive(Debug, Clone, Copy)]
struct Entry {
    failures: u32,
    last_failure: Instant,
    locked_until: Option<Instant>,
}

/// Compteur des échecs de connexion, partagé dans l'état de l'application.
#[derive(Debug, Default)]
pub struct LoginThrottle {
    entries: Mutex<HashMap<String, Entry>>,
}

fn key(username: &str) -> String {
    username.trim().to_lowercase()
}

/// Durée du blocage après `failures` échecs consécutifs.
fn lock_duration(failures: u32) -> Option<Duration> {
    if failures < FREE_ATTEMPTS {
        return None;
    }

    let doublings = (failures - FREE_ATTEMPTS).min(16);

    Some(BASE_LOCK.saturating_mul(1u32 << doublings).min(MAX_LOCK))
}

fn is_locked(entry: &Entry, now: Instant) -> bool {
    entry.locked_until.is_some_and(|until| until > now)
}

/// Retire les entrées devenues inutiles quand la table est pleine.
fn prune(entries: &mut HashMap<String, Entry>, now: Instant) {
    entries.retain(|_, entry| {
        is_locked(entry, now) || now.duration_since(entry.last_failure) < FORGET_AFTER
    });

    // Table encore pleine (essais massifs sur des noms différents) :
    // seuls les blocages en cours sont conservés.
    if entries.len() >= MAX_ENTRIES {
        entries.retain(|_, entry| is_locked(entry, now));
    }
}

impl LoginThrottle {
    pub fn new() -> Self {
        Self::default()
    }

    fn entries(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        // Un verrou « empoisonné » (panique ailleurs) ne doit pas bloquer
        // définitivement la connexion : on récupère les données.
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Vérifie qu'une tentative de connexion est autorisée pour ce nom.
    pub fn check(&self, username: &str) -> AppResult<()> {
        self.check_at(username, Instant::now())
    }

    /// Enregistre un échec de connexion.
    pub fn record_failure(&self, username: &str) {
        self.record_failure_at(username, Instant::now());
    }

    /// Enregistre une connexion réussie : le compteur est remis à zéro.
    pub fn record_success(&self, username: &str) {
        self.entries().remove(&key(username));
    }

    fn check_at(&self, username: &str, now: Instant) -> AppResult<()> {
        let mut entries = self.entries();
        let key = key(username);

        let Some(entry) = entries.get(&key).copied() else {
            return Ok(());
        };

        if let Some(until) = entry.locked_until {
            if until > now {
                return Err(AppError::too_many_attempts(until - now));
            }
        }

        if now.duration_since(entry.last_failure) >= FORGET_AFTER {
            entries.remove(&key);
        }

        Ok(())
    }

    fn record_failure_at(&self, username: &str, now: Instant) {
        let mut entries = self.entries();

        if entries.len() >= MAX_ENTRIES {
            prune(&mut entries, now);
        }

        let entry = entries.entry(key(username)).or_insert(Entry {
            failures: 0,
            last_failure: now,
            locked_until: None,
        });

        if now.duration_since(entry.last_failure) >= FORGET_AFTER {
            entry.failures = 0;
        }

        entry.failures = entry.failures.saturating_add(1);
        entry.last_failure = now;
        entry.locked_until = lock_duration(entry.failures).map(|lock| now + lock);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn fail(throttle: &LoginThrottle, username: &str, times: u32, now: Instant) {
        for _ in 0..times {
            throttle.record_failure_at(username, now);
        }
    }

    #[test]
    fn allows_the_first_attempts() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS - 1, now);

        assert!(throttle.check_at("alice", now).is_ok());
    }

    #[test]
    fn locks_after_too_many_failures() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS, now);

        let error = throttle.check_at("alice", now).unwrap_err();
        assert_eq!(error.code, ErrorCode::Forbidden);

        assert!(throttle
            .check_at("alice", now + BASE_LOCK + Duration::from_secs(1))
            .is_ok());
    }

    #[test]
    fn lock_grows_with_each_new_failure() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS + 1, now);

        assert!(throttle.check_at("alice", now + Duration::from_secs(31)).is_err());
        assert!(throttle.check_at("alice", now + Duration::from_secs(61)).is_ok());
    }

    #[test]
    fn lock_is_capped() {
        assert_eq!(lock_duration(1_000), Some(MAX_LOCK));
    }

    #[test]
    fn success_resets_the_counter() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS, now);
        throttle.record_success("alice");

        assert!(throttle.check_at("alice", now).is_ok());
    }

    #[test]
    fn ignores_case_and_spaces() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, " Alice ", FREE_ATTEMPTS, now);

        assert!(throttle.check_at("alice", now).is_err());
    }

    #[test]
    fn other_users_are_not_affected() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS, now);

        assert!(throttle.check_at("bob", now).is_ok());
    }

    #[test]
    fn old_failures_are_forgotten() {
        let throttle = LoginThrottle::new();
        let now = Instant::now();

        fail(&throttle, "alice", FREE_ATTEMPTS - 1, now);
        throttle.record_failure_at("alice", now + FORGET_AFTER);

        assert!(throttle.check_at("alice", now + FORGET_AFTER).is_ok());
    }
}
