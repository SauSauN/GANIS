export type Role = "admin" | "developer" | "user";

export interface User {
  id: string;
  username: string;
  email?: string | null;
  role: Role;
}

export type ProjectType = "manga" | "novel" | "film" | "series" | "game" | "rpg" | "custom";
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
  updatedAt: string;
}

export interface AppInfo {
  name: string;
  version: string;
  offline: boolean;
}

export type ErrorCode =
  | "INTERNAL"
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DATABASE"
  | "IO";

/** Forme exacte de l'erreur renvoyée par Rust (error.rs). */
export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
}

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
