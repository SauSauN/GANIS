/**
 * Validateurs pour les formulaires d'authentification.
 * Ces règles sont également vérifiées côté Rust pour la sécurité.
 *
 * `checkX` renvoie un code de problème, traduit par l'interface
 * (`t(\`validation.${code}\`)`, espace de noms `common`).
 */

export type UsernameIssue =
  | "usernameTooShort"
  | "usernameTooLong"
  | "usernameInvalidChars";

export type PasswordIssue =
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordNeedsLetterAndDigit"
  | "passwordWeak";

export type EmailIssue = "emailInvalid";

export type ValidationIssue =
  | UsernameIssue
  | PasswordIssue
  | EmailIssue
  | "passwordMismatch";

// ----------------------------------------------------------------------------
// Règles (codes)
// ----------------------------------------------------------------------------

export function checkUsername(username: string): UsernameIssue | null {
  const trimmed = username.trim();
  if (trimmed.length < 3) return "usernameTooShort";
  if (trimmed.length > 50) return "usernameTooLong";
  // Lettres, chiffres, tirets et underscores uniquement
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return "usernameInvalidChars";
  return null;
}

/** Longueur minimale d'un nouveau mot de passe (comme dans Rust). */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Mots de passe les plus courants (comme `security/weak_passwords.rs`) :
 * refusés même entourés de chiffres ou de symboles (« azerty2024! »).
 */
const COMMON_PASSWORDS = new Set([
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
]);

/** Vrai si le mot de passe est trop facile à deviner (voir Rust). */
export function isWeakPassword(password: string, username = ""): boolean {
  const lower = password.toLowerCase();
  const core = password.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase();
  const chars = [...core].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const repeated = chars.length === 0 || chars.every((c) => c === chars[0]);
  const name = username.trim().toLowerCase();

  return repeated || COMMON_PASSWORDS.has(core) || ([...name].length >= 3 && lower.includes(name));
}

/**
 * Règles d'un nouveau mot de passe : 12 caractères au moins, une lettre et
 * un chiffre, ni trop courant ni construit sur le nom d'utilisateur.
 */
export function checkPassword(password: string, username = ""): PasswordIssue | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if ([...password].length > 128) return "passwordTooLong";
  // Au moins une lettre et un chiffre
  if (!/\p{L}/u.test(password) || !/[0-9]/.test(password)) {
    return "passwordNeedsLetterAndDigit";
  }
  if (isWeakPassword(password, username)) return "passwordWeak";
  return null;
}

export function checkEmail(email: string): EmailIssue | null {
  if (!email.trim()) return null; // L'email est facultatif
  // Regex simple pour la validation d'email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "emailInvalid";
  return null;
}
