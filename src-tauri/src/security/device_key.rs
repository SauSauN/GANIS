//! Clé d'appareil : chiffre la base de l'application (`app.db`).
//!
//! `app.db` contient les verrous des comptes et les clés des projets
//! publics. Copiée sur une autre machine, elle permettait d'essayer des
//! mots de passe sans limite. Elle est donc chiffrée (SQLCipher) avec une
//! clé aléatoire propre à cet ordinateur.
//!
//! Sous Windows, cette clé est enfermée par DPAPI : seul le même compte
//! Windows, sur le même ordinateur, peut la relire. Le fichier
//! `device.key` copié ailleurs ne sert à rien.
//!
//! Ailleurs (macOS, Linux), DPAPI n'existe pas : la clé est écrite telle
//! quelle, lisible par le seul utilisateur (droits 0600).
//!
//! # Clé de secours
//!
//! Une réinstallation de Windows ou un changement de compte Windows rend
//! la clé illisible, donc `app.db` aussi. Une **clé de secours** (fichier
//! texte) peut être enregistrée depuis les paramètres : elle permet de
//! rouvrir les données sur un nouvel ordinateur. Elle doit être rangée hors
//! de cet ordinateur, car elle suffit à déchiffrer `app.db`.

use crate::error::{AppError, AppResult};
use crate::security::crypto::SecretKey;
use std::path::{Path, PathBuf};
use zeroize::Zeroizing;

/// Fichier de la clé d'appareil, dans le dossier de données.
pub const DEVICE_KEY_FILE: &str = "device.key";

/// En-tête du fichier `device.key`.
#[cfg(windows)]
const HEADER: &str = "ganis-device-key/v1/dpapi";
#[cfg(not(windows))]
const HEADER: &str = "ganis-device-key/v1/plain";

/// Préfixe de la ligne qui porte la clé dans un fichier de secours.
const BACKUP_PREFIX: &str = "GANIS-DEVICE-KEY-V1:";

pub fn key_path(data_dir: &Path) -> PathBuf {
    data_dir.join(DEVICE_KEY_FILE)
}

/// Pourquoi la clé d'appareil ne peut pas être utilisée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceKeyIssue {
    /// `app.db` est chiffrée mais `device.key` a disparu.
    Missing,
    /// `device.key` existe mais ne s'ouvre pas (autre compte Windows,
    /// autre ordinateur, fichier abîmé).
    Unreadable,
    /// La clé s'ouvre mais ne déchiffre pas `app.db`.
    WrongKey,
}

impl DeviceKeyIssue {
    pub fn as_str(self) -> &'static str {
        match self {
            DeviceKeyIssue::Missing => "missing",
            DeviceKeyIssue::Unreadable => "unreadable",
            DeviceKeyIssue::WrongKey => "wrongKey",
        }
    }
}

// ----------------------------------------------------------------------------
// Protection par le système
// ----------------------------------------------------------------------------

#[cfg(windows)]
mod system {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };
    use zeroize::Zeroizing;

    /// Lie le secret à l'application, en plus du compte Windows.
    const ENTROPY: &[u8] = b"GANIS device key v1";

    fn blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    /// Copie le résultat de DPAPI puis l'efface et le libère.
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Zeroizing<Vec<u8>> {
        let bytes = Zeroizing::new(std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec());
        std::ptr::write_bytes(out.pbData, 0, out.cbData as usize);
        LocalFree(out.pbData as _);
        bytes
    }

    pub fn protect(secret: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(secret);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };

        // SAFETY : les blobs pointent vers des tampons vivants pendant
        // l'appel ; `out` est alloué par Windows puis libéré par `take`.
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };

        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }

        Ok(unsafe { take(out) }.to_vec())
    }

    pub fn unprotect(protected: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
        let input = blob(protected);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };

        // SAFETY : voir `protect`.
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };

        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }

        Ok(unsafe { take(out) })
    }
}

#[cfg(not(windows))]
mod system {
    use zeroize::Zeroizing;

    pub fn protect(secret: &[u8]) -> Result<Vec<u8>, String> {
        Ok(secret.to_vec())
    }

    pub fn unprotect(protected: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
        Ok(Zeroizing::new(protected.to_vec()))
    }
}

// ----------------------------------------------------------------------------
// Lecture et écriture de `device.key`
// ----------------------------------------------------------------------------

/// Lit la clé d'appareil.
///
/// - `Ok(None)` : aucun fichier ;
/// - `Err(Unreadable)` : fichier présent mais illisible ici.
pub fn load(data_dir: &Path) -> Result<Option<SecretKey>, DeviceKeyIssue> {
    use base64::Engine;

    let path = key_path(data_dir);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => Zeroizing::new(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            tracing::error!(error = %e, "Clé d'appareil illisible");
            return Err(DeviceKeyIssue::Unreadable);
        }
    };

    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some(HEADER) {
        tracing::error!("Clé d'appareil : en-tête inattendu");
        return Err(DeviceKeyIssue::Unreadable);
    }

    let protected = lines
        .next()
        .and_then(|line| base64::engine::general_purpose::STANDARD.decode(line.trim()).ok())
        .ok_or(DeviceKeyIssue::Unreadable)?;

    let raw = system::unprotect(&protected).map_err(|e| {
        tracing::error!(error = %e, "Clé d'appareil impossible à ouvrir sur ce compte Windows");
        DeviceKeyIssue::Unreadable
    })?;

    let encoded = Zeroizing::new(base64::engine::general_purpose::STANDARD_NO_PAD.encode(&*raw));
    SecretKey::from_base64(&encoded)
        .map(Some)
        .map_err(|_| DeviceKeyIssue::Unreadable)
}

/// Enregistre la clé d'appareil (protégée par le système).
///
/// Écriture dans un fichier temporaire puis renommage : un arrêt brutal ne
/// laisse jamais un `device.key` à moitié écrit. Un fichier existant est
/// gardé à côté (`device.key.old`) plutôt qu'effacé.
pub fn save(data_dir: &Path, key: &SecretKey) -> AppResult<()> {
    use base64::Engine;

    let protected = system::protect(key.as_bytes())
        .map_err(|e| AppError::internal("Protection de la clé d'appareil impossible").with_detail(e))?;

    let text = format!(
        "{HEADER}\n{}\n",
        base64::engine::general_purpose::STANDARD.encode(protected)
    );

    std::fs::create_dir_all(data_dir)
        .map_err(|e| AppError::io(&e).with_detail(format!("Dossier de données : {e}")))?;

    let path = key_path(data_dir);
    let temp = data_dir.join(format!("{DEVICE_KEY_FILE}.tmp"));

    write_private(&temp, text.as_bytes())?;

    if path.exists() {
        let _ = std::fs::rename(&path, data_dir.join(format!("{DEVICE_KEY_FILE}.old")));
    }

    std::fs::rename(&temp, &path)
        .map_err(|e| AppError::io(&e).with_detail(format!("Enregistrement de la clé d'appareil : {e}")))?;

    Ok(())
}

/// Écrit un fichier lisible par le seul utilisateur (Unix : 0600 ; sous
/// Windows, le dossier de données est déjà réservé au compte).
fn write_private(path: &Path, bytes: &[u8]) -> AppResult<()> {
    use std::io::Write;

    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    options
        .open(path)
        .and_then(|mut file| {
            file.write_all(bytes)?;
            file.sync_all()
        })
        .map_err(|e| AppError::io(&e).with_detail(format!("Écriture de {} : {e}", path.display())))
}

// ----------------------------------------------------------------------------
// Clé de secours
// ----------------------------------------------------------------------------

/// Texte du fichier de secours.
pub fn backup_text(key: &SecretKey, language: &str, date: &str) -> Zeroizing<String> {
    let encoded = key.to_base64();

    let body = if language == "en" {
        format!(
            "GANIS — Backup key for this computer's data\n\
             \n\
             Created: {date}\n\
             \n\
             {BACKUP_PREFIX} {}\n\
             \n\
             GANIS encrypts its data folder with a key tied to this computer and\n\
             Windows account. If Windows is reinstalled or your data folder is\n\
             moved to another computer, this file lets GANIS open it again.\n\
             \n\
             Keep it away from this computer (USB stick, password manager).\n\
             Your private projects stay protected by your password.\n",
            encoded.as_str()
        )
    } else {
        format!(
            "GANIS — Clé de secours des données de cet ordinateur\n\
             \n\
             Créée le : {date}\n\
             \n\
             {BACKUP_PREFIX} {}\n\
             \n\
             GANIS chiffre son dossier de données avec une clé liée à cet\n\
             ordinateur et à ce compte Windows. Si Windows est réinstallé ou si\n\
             le dossier de données est copié sur un autre ordinateur, ce fichier\n\
             permet à GANIS de l'ouvrir à nouveau.\n\
             \n\
             Rangez-le hors de cet ordinateur (clé USB, gestionnaire de mots de\n\
             passe). Vos projets privés restent protégés par votre mot de passe.\n",
            encoded.as_str()
        )
    };

    Zeroizing::new(body)
}

/// Lit la clé d'un fichier de secours.
pub fn parse_backup(text: &str) -> AppResult<SecretKey> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix(BACKUP_PREFIX))
        .and_then(|encoded| SecretKey::from_base64(encoded.trim()).ok())
        .ok_or_else(|| {
            AppError::validation("Ce fichier n'est pas une clé de secours GANIS.")
                .with_key("deviceKey.invalidBackup")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ganis-device-key-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn key_survives_save_and_load() {
        let dir = temp_dir("roundtrip");
        assert!(load(&dir).unwrap().is_none());

        let key = SecretKey::generate();
        save(&dir, &key).unwrap();

        let loaded = load(&dir).unwrap().unwrap();
        assert_eq!(loaded.as_bytes(), key.as_bytes());

        // La clé n'est pas écrite en clair.
        let text = std::fs::read_to_string(key_path(&dir)).unwrap();
        #[cfg(windows)]
        assert!(!text.contains(key.to_base64().as_str()));
        assert!(text.starts_with(HEADER));

        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn damaged_file_is_unreadable() {
        let dir = temp_dir("damaged");
        std::fs::write(key_path(&dir), format!("{HEADER}\nAAAA\n")).unwrap();
        assert_eq!(load(&dir).err(), Some(DeviceKeyIssue::Unreadable));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn backup_file_roundtrip() {
        let key = SecretKey::generate();
        let text = backup_text(&key, "fr", "2026-11-23");
        assert_eq!(parse_backup(&text).unwrap().as_bytes(), key.as_bytes());
        assert!(parse_backup("bonjour").is_err());
    }
}
