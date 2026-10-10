//! Primitives cryptographiques de GANIS.
//!
//! - **Clés** : 256 bits, tirées du générateur aléatoire du système, effacées
//!   de la mémoire dès qu'elles ne servent plus (`Zeroizing`).
//! - **Dérivation** : Argon2id transforme un secret saisi (mot de passe ou
//!   clé de récupération) en clé de chiffrement. Ses paramètres sont
//!   enregistrés avec chaque verrou, pour pouvoir les renforcer plus tard
//!   sans casser les comptes existants.
//! - **Chiffrement** : XChaCha20-Poly1305. Chaque message chiffré a son
//!   propre nonce aléatoire et un « contexte » (AAD) qui l'attache à un
//!   usage précis : une donnée chiffrée pour un projet ne peut pas être
//!   recopiée sur un autre sans être rejetée.
//!
//! Format texte d'une donnée chiffrée (« enveloppe ») :
//! `v1.<nonce en base64>.<texte chiffré en base64>`.

use crate::error::{AppError, AppResult};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD_NO_PAD as B64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use zeroize::Zeroizing;

/// Taille d'une clé, en octets (256 bits).
pub const KEY_LEN: usize = 32;

/// Taille du nonce XChaCha20, en octets.
const NONCE_LEN: usize = 24;

/// Taille d'un sel Argon2, en octets.
const SALT_LEN: usize = 16;

/// Préfixe de version des enveloppes.
const ENVELOPE_VERSION: &str = "v1";

/// Clé secrète de 256 bits, effacée de la mémoire à sa destruction.
#[derive(Clone)]
pub struct SecretKey(Zeroizing<[u8; KEY_LEN]>);

impl SecretKey {
    /// Nouvelle clé aléatoire.
    pub fn generate() -> Self {
        let mut bytes = Zeroizing::new([0u8; KEY_LEN]);
        OsRng.fill_bytes(bytes.as_mut());
        Self(bytes)
    }

    fn from_slice(bytes: &[u8]) -> AppResult<Self> {
        if bytes.len() != KEY_LEN {
            return Err(AppError::internal("Taille de clé invalide"));
        }

        let mut key = Zeroizing::new([0u8; KEY_LEN]);
        key.copy_from_slice(bytes);
        Ok(Self(key))
    }

    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }

    /// Clé au format « clé brute » de SQLCipher : `x'<64 chiffres hexa>'`.
    ///
    /// Avec ce format, SQLCipher n'applique pas sa propre dérivation : la
    /// clé est déjà aléatoire et complète. C'est la forme attendue par
    /// `ATTACH DATABASE … KEY ?`.
    pub fn sqlcipher_raw_key(&self) -> Zeroizing<String> {
        let mut raw = Zeroizing::new(String::with_capacity(KEY_LEN * 2 + 3));
        raw.push_str("x'");
        for byte in self.0.iter() {
            raw.push_str(&format!("{byte:02x}"));
        }
        raw.push('\'');
        raw
    }

    /// Valeur à donner à `PRAGMA key` : la clé brute entre guillemets.
    pub fn sqlcipher_pragma(&self) -> Zeroizing<String> {
        Zeroizing::new(format!("\"{}\"", self.sqlcipher_raw_key().as_str()))
    }
}

impl std::fmt::Debug for SecretKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Ne jamais afficher une clé, même dans un journal de débogage.
        f.write_str("SecretKey(***)")
    }
}

// ----------------------------------------------------------------------------
// Dérivation (Argon2id)
// ----------------------------------------------------------------------------

/// Paramètres Argon2id enregistrés avec chaque verrou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    /// Mémoire utilisée, en Kio.
    pub memory_kib: u32,
    /// Nombre de passes.
    pub iterations: u32,
    /// Degré de parallélisme.
    pub parallelism: u32,
}

impl KdfParams {
    /// Paramètres actuels : 64 Mio, 3 passes, 1 fil (environ une demi-seconde
    /// sur un ordinateur récent). Volontairement coûteux pour freiner
    /// les essais de mots de passe sur un fichier volé.
    #[cfg(not(test))]
    pub const CURRENT: Self = Self {
        memory_kib: 64 * 1024,
        iterations: 3,
        parallelism: 1,
    };

    /// Paramètres allégés pour que les tests restent rapides.
    #[cfg(test)]
    pub const CURRENT: Self = Self {
        memory_kib: 1024,
        iterations: 1,
        parallelism: 1,
    };
}

/// Nouveau sel aléatoire, encodé en base64.
pub fn generate_salt() -> String {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    B64.encode(salt)
}

/// Dérive une clé de 256 bits d'un secret saisi par l'utilisateur.
pub fn derive_key(secret: &[u8], salt_b64: &str, params: KdfParams) -> AppResult<SecretKey> {
    let salt = B64
        .decode(salt_b64)
        .map_err(|e| AppError::internal(e).with_detail("Sel de dérivation illisible"))?;

    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| AppError::internal(e).with_detail("Paramètres de dérivation invalides"))?;

    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);

    let mut out = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(secret, &salt, out.as_mut())
        .map_err(|e| AppError::internal(e).with_detail("Échec de la dérivation de clé"))?;

    Ok(SecretKey(out))
}

// ----------------------------------------------------------------------------
// Chiffrement authentifié (XChaCha20-Poly1305)
// ----------------------------------------------------------------------------

/// Chiffre `plaintext` avec `key`, lié au contexte `aad`.
pub fn seal(key: &SecretKey, aad: &str, plaintext: &[u8]) -> AppResult<String> {
    let cipher = XChaCha20Poly1305::new(key.as_bytes().into());

    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);

    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| AppError::internal("Échec du chiffrement"))?;

    Ok(format!(
        "{ENVELOPE_VERSION}.{}.{}",
        B64.encode(nonce),
        B64.encode(ciphertext)
    ))
}

/// Déchiffre une enveloppe produite par [`seal`].
///
/// Retourne `None` si la clé est mauvaise, si le contexte ne correspond
/// pas ou si la donnée a été modifiée. Une enveloppe mal formée est une
/// erreur interne (donnée corrompue).
pub fn open(key: &SecretKey, aad: &str, envelope: &str) -> AppResult<Option<Zeroizing<Vec<u8>>>> {
    let mut parts = envelope.split('.');

    let (Some(version), Some(nonce_b64), Some(ct_b64), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(AppError::internal("Donnée chiffrée mal formée"));
    };

    if version != ENVELOPE_VERSION {
        return Err(AppError::internal(format!(
            "Version de chiffrement inconnue : {version}"
        )));
    }

    let nonce = B64
        .decode(nonce_b64)
        .map_err(|_| AppError::internal("Nonce illisible"))?;
    let ciphertext = B64
        .decode(ct_b64)
        .map_err(|_| AppError::internal("Donnée chiffrée illisible"))?;

    if nonce.len() != NONCE_LEN {
        return Err(AppError::internal("Taille de nonce invalide"));
    }

    let cipher = XChaCha20Poly1305::new(key.as_bytes().into());

    Ok(cipher
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: aad.as_bytes(),
            },
        )
        .ok()
        .map(Zeroizing::new))
}

/// Chiffre un texte.
pub fn seal_text(key: &SecretKey, aad: &str, text: &str) -> AppResult<String> {
    seal(key, aad, text.as_bytes())
}

/// Déchiffre un texte. Toute impossibilité est une erreur : à ce stade,
/// la clé est forcément la bonne, un échec signale une donnée corrompue.
pub fn open_text(key: &SecretKey, aad: &str, envelope: &str) -> AppResult<String> {
    let bytes = open(key, aad, envelope)?
        .ok_or_else(|| AppError::internal("Donnée chiffrée impossible à déchiffrer"))?;

    String::from_utf8(bytes.to_vec())
        .map_err(|_| AppError::internal("Donnée déchiffrée invalide"))
}

/// Enferme une clé dans une autre.
pub fn wrap_key(kek: &SecretKey, aad: &str, key: &SecretKey) -> AppResult<String> {
    seal(kek, aad, key.as_bytes())
}

/// Ouvre une clé enfermée. `None` : mauvaise clé d'ouverture.
pub fn unwrap_key(kek: &SecretKey, aad: &str, wrapped: &str) -> AppResult<Option<SecretKey>> {
    match open(kek, aad, wrapped)? {
        Some(bytes) => Ok(Some(SecretKey::from_slice(&bytes)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_and_open_roundtrip() {
        let key = SecretKey::generate();
        let sealed = seal_text(&key, "ctx", "Bonjour").unwrap();

        assert!(sealed.starts_with("v1."));
        assert!(!sealed.contains("Bonjour"));
        assert_eq!(open_text(&key, "ctx", &sealed).unwrap(), "Bonjour");
    }

    #[test]
    fn same_text_gives_different_envelopes() {
        let key = SecretKey::generate();
        assert_ne!(
            seal_text(&key, "ctx", "a").unwrap(),
            seal_text(&key, "ctx", "a").unwrap()
        );
    }

    #[test]
    fn wrong_key_or_context_is_rejected() {
        let key = SecretKey::generate();
        let other = SecretKey::generate();
        let sealed = seal(&key, "projet:1", b"secret").unwrap();

        assert!(open(&other, "projet:1", &sealed).unwrap().is_none());
        assert!(open(&key, "projet:2", &sealed).unwrap().is_none());
    }

    #[test]
    fn tampered_data_is_rejected() {
        let key = SecretKey::generate();
        let sealed = seal(&key, "ctx", b"secret").unwrap();
        let mut bytes = sealed.into_bytes();
        let last = bytes.len() - 2;
        bytes[last] = if bytes[last] == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(bytes).unwrap();

        assert!(open(&key, "ctx", &tampered).unwrap().is_none());
    }

    #[test]
    fn malformed_envelope_is_an_error() {
        let key = SecretKey::generate();
        assert!(open(&key, "ctx", "pas-une-enveloppe").is_err());
        assert!(open(&key, "ctx", "v9.AAAA.BBBB").is_err());
    }

    #[test]
    fn derivation_is_deterministic_per_salt() {
        let salt = generate_salt();
        let a = derive_key(b"motdepasse1", &salt, KdfParams::CURRENT).unwrap();
        let b = derive_key(b"motdepasse1", &salt, KdfParams::CURRENT).unwrap();
        let c = derive_key(b"motdepasse1", &generate_salt(), KdfParams::CURRENT).unwrap();

        assert_eq!(a.as_bytes(), b.as_bytes());
        assert_ne!(a.as_bytes(), c.as_bytes());
    }

    #[test]
    fn key_wrapping_roundtrip() {
        let kek = SecretKey::generate();
        let key = SecretKey::generate();
        let wrapped = wrap_key(&kek, "slot", &key).unwrap();

        let back = unwrap_key(&kek, "slot", &wrapped).unwrap().unwrap();
        assert_eq!(back.as_bytes(), key.as_bytes());
        assert!(unwrap_key(&SecretKey::generate(), "slot", &wrapped)
            .unwrap()
            .is_none());
    }

    #[test]
    fn sqlcipher_pragma_format() {
        let key = SecretKey::generate();
        let pragma = key.sqlcipher_pragma();
        assert!(pragma.starts_with("\"x'") && pragma.ends_with("'\""));
        assert_eq!(pragma.len(), 3 + 64 + 2);
    }

    #[test]
    fn debug_never_shows_key() {
        assert_eq!(format!("{:?}", SecretKey::generate()), "SecretKey(***)");
    }
}
