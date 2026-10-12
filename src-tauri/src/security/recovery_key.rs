//! Clé de récupération d'un compte.
//!
//! Six groupes de six caractères, par exemple :
//! `7KQ2MD-X94HTR-B3NW0C-PZ6EAJ-18VYGF-RM5S2K`.
//!
//! Alphabet « Crockford base 32 » : chiffres et majuscules, sans I, L, O
//! ni U, pour éviter les confusions à la relecture d'une clé notée à la
//! main. 36 caractères × 5 bits = 180 bits de hasard : impossible à
//! deviner, même en essayant des milliards de combinaisons.
//!
//! La saisie est tolérante : minuscules, espaces, tirets ou leur absence,
//! et les confusions courantes (O → 0, I et L → 1) sont acceptés.

use crate::error::{AppError, AppResult};
use rand::rngs::OsRng;
use rand::Rng;
use zeroize::Zeroizing;

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Nombre de groupes.
pub const GROUPS: usize = 6;

/// Caractères par groupe.
pub const GROUP_LEN: usize = 6;

const TOTAL_LEN: usize = GROUPS * GROUP_LEN;

/// Clé de récupération, effacée de la mémoire à sa destruction.
pub struct RecoveryKey(Zeroizing<String>);

impl RecoveryKey {
    /// Nouvelle clé aléatoire.
    pub fn generate() -> Self {
        let mut raw = Zeroizing::new(String::with_capacity(TOTAL_LEN));

        for _ in 0..TOTAL_LEN {
            let index = OsRng.gen_range(0..ALPHABET.len());
            raw.push(ALPHABET[index] as char);
        }

        Self(raw)
    }

    /// Lit une clé saisie par l'utilisateur.
    pub fn parse(input: &str) -> AppResult<Self> {
        let mut raw = Zeroizing::new(String::with_capacity(TOTAL_LEN));

        for c in input.chars() {
            if c.is_whitespace() || c == '-' {
                continue;
            }

            let normalized = match c.to_ascii_uppercase() {
                'O' => '0',
                'I' | 'L' => '1',
                other => other,
            };

            if !ALPHABET.contains(&(normalized as u8)) || !normalized.is_ascii() {
                return Err(invalid_format());
            }

            raw.push(normalized);
        }

        if raw.len() != TOTAL_LEN {
            return Err(invalid_format());
        }

        Ok(Self(raw))
    }

    /// Forme utilisée pour la dérivation : 36 caractères sans séparateur.
    pub fn secret_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }

    /// Forme affichée : groupes séparés par des tirets.
    pub fn display(&self) -> String {
        self.0
            .as_bytes()
            .chunks(GROUP_LEN)
            .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
            .collect::<Vec<_>>()
            .join("-")
    }
}

fn invalid_format() -> AppError {
    AppError::validation(
        "La clé de récupération doit contenir 6 groupes de 6 caractères (lettres et chiffres).",
    )
    .with_key("recovery.invalidFormat")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_key_has_expected_shape() {
        let key = RecoveryKey::generate();
        let shown = key.display();

        assert_eq!(shown.len(), TOTAL_LEN + GROUPS - 1);
        assert_eq!(shown.split('-').count(), GROUPS);
        assert!(shown.split('-').all(|g| g.len() == GROUP_LEN));
        assert!(shown
            .chars()
            .all(|c| c == '-' || ALPHABET.contains(&(c as u8))));
    }

    #[test]
    fn generated_keys_differ() {
        assert_ne!(RecoveryKey::generate().display(), RecoveryKey::generate().display());
    }

    #[test]
    fn parsing_is_tolerant() {
        let key = RecoveryKey::generate();
        let shown = key.display();

        let variants = [
            shown.clone(),
            shown.to_lowercase(),
            shown.replace('-', " "),
            shown.replace('-', ""),
            format!("  {}  ", shown.replace('-', " - ")),
        ];

        for variant in variants {
            let parsed = RecoveryKey::parse(&variant).unwrap();
            assert_eq!(parsed.secret_bytes(), key.secret_bytes());
        }
    }

    #[test]
    fn common_confusions_are_corrected() {
        let parsed = RecoveryKey::parse("O0O0O0-IIIIII-LLLLLL-AAAAAA-BBBBBB-CCCCCC").unwrap();
        assert_eq!(parsed.display(), "000000-111111-111111-AAAAAA-BBBBBB-CCCCCC");
    }

    #[test]
    fn invalid_keys_are_rejected() {
        assert!(RecoveryKey::parse("").is_err());
        assert!(RecoveryKey::parse("ABC").is_err());
        // U ne fait pas partie de l'alphabet.
        assert!(RecoveryKey::parse("UUUUUU-AAAAAA-AAAAAA-AAAAAA-AAAAAA-AAAAAA").is_err());
        // Un groupe de trop.
        assert!(RecoveryKey::parse(&"AAAAAA-".repeat(7)).is_err());
        assert!(RecoveryKey::parse("ÉÉÉÉÉÉ-AAAAAA-AAAAAA-AAAAAA-AAAAAA-AAAAAA").is_err());
    }
}
