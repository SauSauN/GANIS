// ============================================================================
// GANIS — Types partagés entre le frontend et le backend Rust.
// ============================================================================
// Ces types doivent rester synchronisés avec les structs Rust exposés
// via #[derive(Serialize)] dans src-tauri/src/models/.
// ============================================================================

// ----------------------------------------------------------------------------
// Utilisateurs & authentification
// ----------------------------------------------------------------------------

export type Role = "admin" | "developer" | "user";

/**
 * Utilisateur tel qu'exposé par le backend (correspond à `UserPublic` en Rust).
 * Le hash et le sel du mot de passe ne sont jamais transmis à l'interface.
 */
export interface User {
  id: string;
  username: string;
  email?: string | null;
  role: Role;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/**
 * Compte créé (inscription, configuration initiale).
 *
 * `recoveryKey` n'est transmise qu'à cet instant : elle n'est stockée nulle
 * part en clair et ne pourra plus jamais être relue. Elle vaut `null` tant
 * que les clés de récupération sont désactivées (`RECOVERY_KEY_ENABLED`).
 */
export interface AccountCreated {
  user: User;
  recoveryKey: string | null;
}

/**
 * Connexion réussie.
 *
 * `recoveryKey` n'est présente que si le compte vient d'être chiffré à
 * cette connexion (compte créé avant le chiffrement) : elle doit être
 * montrée une seule fois.
 */
export interface LoginResult {
  user: User;
  recoveryKey: string | null;
}

// ----------------------------------------------------------------------------
// Projets narratifs
// ----------------------------------------------------------------------------

export type ProjectType =
  | "manga"
  | "novel"
  | "film"
  | "series"
  | "game"
  | "rpg"
  | "custom";

export type ProjectStatus = "preparing" | "in_progress" | "paused" | "done";

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
  /** Dernière ouverture du projet ; `null` s'il n'a jamais été ouvert. */
  lastOpenedAt?: string | null; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Synopsis
// ----------------------------------------------------------------------------

/**
 * Synopsis d'un projet narratif.
 *
 * Un projet n'a qu'un seul synopsis, stocké dans la base de données
 * propre au projet. Il contient :
 *   - le contenu textuel du synopsis (éditeur riche, HTML) ;
 *   - les genres associés (ex. "Fantasy", "Aventure") ;
 *   - les sous-genres associés (ex. "Dark Fantasy") ;
 *   - les tons associés (ex. "Sombre", "Épique").
 */
export interface Synopsis {
  id: string;
  content: string;
  genres: string[];
  subgenres: string[];
  tone: string[];
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Découpage du récit
// ----------------------------------------------------------------------------

/**
 * Modèle de découpage : il donne un nom à chacun des trois niveaux
 * (ex. roman : Partie › Chapitre › Scène). Voir `lib/structure.ts`.
 */
export type StructureTemplateId =
  | "novel"
  | "manga"
  | "film"
  | "series"
  | "game"
  | "rpg"
  | "generic";

/** Élément du découpage (correspond à `StructureNode` en Rust). */
export interface StructureNode {
  id: string;
  /** `null` : élément à la racine. */
  parentId: string | null;
  /** Niveau : 0, 1 ou 2. Son nom dépend du modèle. */
  level: number;
  title: string;
  summary: string;
  /** Ordre parmi les éléments de même parent. */
  position: number;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/** Découpage complet d'un projet. */
export interface Structure {
  template: StructureTemplateId;
  /** Faux : le modèle suit le type du projet. */
  templateChosen: boolean;
  /** Tous les éléments, triés par parent puis par position. */
  nodes: StructureNode[];
}

// ----------------------------------------------------------------------------
// Packages (§20) — pour l'instant, uniquement les thèmes
// ----------------------------------------------------------------------------

/** Type technique d'un package (correspond à `PackageType` en Rust). */
export type PackageType = "theme";

/**
 * Couleurs modifiables d'un thème, pour un mode (clair ou sombre).
 * Chaque valeur est une couleur `#RRGGBB` (vérifiée par Rust).
 * Les autres variables de l'interface en sont dérivées (`lib/colorTheme.ts`).
 */
export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  sidebar: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  success: string;
  warning: string;
}

/** Données d'un package de type `theme` (correspond à `ThemeData`). */
export interface ThemeData {
  light: ThemePalette;
  dark: ThemePalette;
  /** Arrondi des coins, en rem (0 à 1,5). */
  radius: number;
}

/** Package créé par l'utilisateur connecté (correspond à `UserPackage`). */
export interface UserPackage {
  id: string;
  /** Identifiant public, de la forme `auteur.nom`. */
  packageId: string;
  type: PackageType;
  name: string;
  description: string;
  version: string;
  author: string;
  theme: ThemeData;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Informations sur l'application
// ----------------------------------------------------------------------------

export interface AppInfo {
  name: string;
  version: string;
  offline: boolean;
}

/**
 * Rapport de diagnostic (correspond à `Diagnostics` en Rust).
 * Réservé aux rôles administrateur et développeur.
 */
export interface Diagnostics {
  appVersion: string;
  os: string;
  arch: string;
  generatedAt: string; // RFC 3339, UTC
  database: {
    sqliteVersion: string;
    sizeBytes: number;
    /** "ok" si la base est saine, sinon le message de SQLite. */
    integrity: string;
    foreignKeyViolations: number;
    appliedMigrations: number;
  };
  counts: {
    users: number;
    admins: number;
    developers: number;
    activeSessions: number;
    projects: number;
  };
}

// ----------------------------------------------------------------------------
// Gestion des erreurs
// ----------------------------------------------------------------------------

/**
 * Codes d'erreur renvoyés par Rust (voir `error.rs`, enum `ErrorCode`).
 * Toute valeur hors de cette liste doit être traitée comme `INTERNAL`.
 */
export type ErrorCode =
  | "INTERNAL"
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DATABASE"
  | "IO";

/** Forme exacte de l'erreur renvoyée par Rust (voir `error.rs`). */
export interface ApiErrorPayload {
  code: ErrorCode;
  /** Message français, toujours présent (secours et journal). */
  message: string;
  /** Clé de traduction (`errors.json`), quand Rust en fournit une. */
  key?: string;
  /** Valeurs à insérer dans le message traduit. */
  params?: Record<string, string | number>;
}

// ----------------------------------------------------------------------------
// Libellés pour l'interface
// ----------------------------------------------------------------------------

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  manga: "Manga",
  novel: "Roman",
  film: "Film",
  series: "Série",
  game: "Jeu vidéo",
  rpg: "Jeu de rôle",
  custom: "Personnalisé",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "En préparation",
  in_progress: "En cours",
  paused: "En pause",
  done: "Terminé",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  developer: "Développeur",
  user: "Utilisateur",
};
