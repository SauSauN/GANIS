/**
 * Validateurs pour les formulaires d'authentification.
 * Ces règles sont également vérifiées côté Rust pour la sécurité.
 *
 * Deux niveaux :
 * - `checkX` renvoie un code de problème, traduit par l'interface
 *   (`t(\`validation.${code}\`)`, espace de noms `common`) ;
 * - `validateX` renvoie directement le message français, pour les écrans
 *   pas encore traduits. À supprimer quand tous l'auront été.
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

// ----------------------------------------------------------------------------
// Messages français (écrans pas encore traduits)
// ----------------------------------------------------------------------------

const MESSAGES_FR: Record<ValidationIssue, string> = {
  usernameTooShort: "Le nom d'utilisateur doit contenir au moins 3 caractères.",
  usernameTooLong: "Le nom d'utilisateur ne doit pas dépasser 50 caractères.",
  usernameInvalidChars:
    "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores.",
  passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
  passwordTooLong: "Le mot de passe ne doit pas dépasser 128 caractères.",
  passwordNeedsLetterAndDigit:
    "Le mot de passe doit contenir au moins une lettre et un chiffre.",
  passwordMismatch: "Les deux mots de passe ne correspondent pas.",
  emailInvalid: "L'adresse e-mail n'est pas valide.",
};

const toMessage = (issue: ValidationIssue | null) =>
  issue ? MESSAGES_FR[issue] : null;

export function validateUsername(username: string): string | null {
  return toMessage(checkUsername(username));
}

export function validatePassword(password: string): string | null {
  return toMessage(checkPassword(password));
}

export function validateEmail(email: string): string | null {
  return toMessage(checkEmail(email));
}