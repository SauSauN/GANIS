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
  | "passwordNeedsLetterAndDigit";

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

export function checkPassword(password: string): PasswordIssue | null {
  if (password.length < 8) return "passwordTooShort";
  if (password.length > 128) return "passwordTooLong";
  // Au moins une lettre et un chiffre
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "passwordNeedsLetterAndDigit";
  }
  return null;
}

export function checkEmail(email: string): EmailIssue | null {
  if (!email.trim()) return null; // L'email est facultatif
  // Regex simple pour la validation d'email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "emailInvalid";
  return null;
}
