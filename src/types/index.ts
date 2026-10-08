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
  message: string;
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