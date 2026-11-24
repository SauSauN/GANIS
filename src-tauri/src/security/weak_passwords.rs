//! Mots de passe trop courants.
//!
//! Une personne qui copie `app.db` essaie d'abord les mots de passe les plus
//! répandus, avec quelques chiffres ou symboles ajoutés (« azerty2024! »).
//! Un nouveau mot de passe est donc refusé quand, une fois débarrassé des
//! chiffres et symboles en début et en fin, il est l'un des mots ci-dessous,
//! le nom de l'application, ou contient le nom d'utilisateur.

/// Mots de base les plus utilisés (français et anglais), en minuscules.
const COMMON: &[&str] = &[
    "password", "passw0rd", "motdepasse", "mot de passe", "mot-de-passe", "mdp", "secret",
    "azerty", "azertyuiop", "qwerty", "qwertyuiop", "qwertz", "abc", "abcd", "abcdef",
    "abcdefgh", "abcdefghijkl", "aaaa", "admin", "administrateur", "administrator", "root",
    "user", "utilisateur", "login", "welcome", "bienvenue", "bonjour", "hello", "salut",
    "coucou", "test", "testing", "demo", "default", "changeme", "letmein", "iloveyou",
    "jetaime", "je t'aime", "loulou", "doudou", "chouchou", "nicolas", "julien", "camille",
    "marseille", "paris", "lyon", "france", "football", "soleil", "chocolat", "princesse",
    "dragon", "monkey", "master", "shadow", "sunshine", "superman", "batman", "pokemon",
    "naruto", "starwars", "harrypotter", "minecraft", "freedom", "liberte", "amour",
    "trustno", "zxcvbn", "asdf", "asdfgh", "asdfghjkl", "wxcvbn", "qsdfgh", "ganis",
    "roman", "manga", "auteur", "ecrivain", "histoire", "livre", "chapitre", "scenario",
    "novel", "story", "writer", "author",
];

/// Garde le cœur du mot de passe : minuscules, sans chiffres ni symboles au
/// début et à la fin.
fn core(password: &str) -> String {
    password
        .trim_matches(|c: char| !c.is_alphabetic())
        .to_lowercase()
}

/// Vrai si le mot de passe est trop facile à deviner.
pub fn is_weak(password: &str, username: &str) -> bool {
    let lower = password.to_lowercase();
    let core = core(password);

    // Un seul caractère répété (« aaaaaaaaaaaa1 »).
    let mut letters = core.chars().filter(|c| c.is_alphanumeric());
    let repeated = match letters.next() {
        Some(first) => letters.all(|c| c == first),
        None => true,
    };

    let username = username.trim().to_lowercase();

    repeated
        || core.is_empty()
        || COMMON.contains(&core.as_str())
        || (username.chars().count() >= 3 && lower.contains(&username))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_passwords_are_weak_even_with_digits() {
        assert!(is_weak("motdepasse123", "alice"));
        assert!(is_weak("Azerty2024!", "alice"));
        assert!(is_weak("123password!!", "alice"));
        assert!(is_weak("aaaaaaaaaaaa1", "alice"));
        assert!(is_weak("123456789012", "alice"));
    }

    #[test]
    fn username_is_not_a_password() {
        assert!(is_weak("Alice-2024-xx", "alice"));
        assert!(!is_weak("plume-violette-1", "alice"));
    }

    #[test]
    fn real_passphrases_pass() {
        assert!(!is_weak("plume-violette-1", "bob"));
        assert!(!is_weak("Le chat dort 3 fois", "bob"));
    }
}
