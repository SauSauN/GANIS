/**
 * Validateurs pour les formulaires d'authentification.
 * Ces règles sont également vérifiées côté Rust pour la sécurité.
 */

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return "Le nom d'utilisateur doit contenir au moins 3 caractères.";
  }
  if (trimmed.length > 50) {
    return "Le nom d'utilisateur ne doit pas dépasser 50 caractères.";
  }
  // Lettres, chiffres, tirets et underscores uniquement
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (password.length > 128) {
    return "Le mot de passe ne doit pas dépasser 128 caractères.";
  }
  // Au moins une lettre et un chiffre
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) return null; // L'email est facultatif
  // Regex simple pour la validation d'email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "L'adresse e-mail n'est pas valide.";
  }
  return null;
}