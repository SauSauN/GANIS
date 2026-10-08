import { invoke } from "@tauri-apps/api/core";
import type {
  ApiErrorPayload,
  AppInfo,
  Diagnostics,
  ErrorCode,
  Project,
  Role,
  Synopsis,
  User,
} from "@/types";

/**
 * Erreur normalisée renvoyée par le pont Rust.
 *
 * Utilise les codes de `ErrorCode` définis dans `types/index.ts`
 * et correspondant aux codes du backend Rust.
 */
export class ApiError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * Vérifie qu'une valeur possède la structure d'une erreur API.
 */
function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("code" in value) || !("message" in value)) {
    return false;
  }

  const payload = value as {
    code?: unknown;
    message?: unknown;
  };

  const validCodes: ErrorCode[] = [
    "INTERNAL",
    "VALIDATION",
    "NOT_FOUND",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "CONFLICT",
    "DATABASE",
    "IO",
  ];

  return (
    typeof payload.code === "string" &&
    validCodes.includes(payload.code as ErrorCode) &&
    typeof payload.message === "string" &&
    payload.message.length > 0
  );
}

/**
 * Essaie de convertir une chaîne en payload d'erreur API.
 */
function parseErrorString(value: string): ApiError | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (isApiErrorPayload(parsed)) {
      return new ApiError(parsed.code, parsed.message);
    }
  } catch {
    // La chaîne n'est pas du JSON.
  }

  return null;
}

/**
 * Normalise toute erreur remontée par Tauri en `ApiError`.
 */
function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }

  if (isApiErrorPayload(e)) {
    return new ApiError(e.code, e.message);
  }

  if (typeof e === "string") {
    const parsed = parseErrorString(e);

    if (parsed) {
      return parsed;
    }

    console.error("Erreur Tauri :", e);

    return new ApiError("INTERNAL", e);
  }

  if (e instanceof Error) {
    console.error("Erreur Tauri :", e);

    return new ApiError("INTERNAL", e.message);
  }

  console.error("Erreur Tauri inconnue :", e);

  return new ApiError(
    "INTERNAL",
    "Une erreur inattendue est survenue.",
  );
}

/**
 * Wrapper bas niveau autour de `invoke`.
 *
 * Toutes les commandes Tauri passent par cette fonction afin
 * de garantir une gestion uniforme des erreurs.
 */
async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw normalize(e);
  }
}

/**
 * Vrai lorsque l'application tourne dans Tauri.
 * Faux lorsque le frontend est exécuté dans un navigateur classique.
 */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Point d'accès unique de l'interface au noyau Rust.
 */
export const api = {
  // -------------------------------------------------------------------------
  // Général
  // -------------------------------------------------------------------------

  appInfo: () => call<AppInfo>("app_info"),

  // -------------------------------------------------------------------------
  // Phase 2 — Configuration initiale & administration
  // -------------------------------------------------------------------------

  /**
   * Crée le premier compte administrateur.
   */
  setupAdmin: (input: {
    username: string;
    password: string;
    email?: string;
  }) => call<User>("setup_admin", { input }),

  /**
   * Liste les comptes utilisateurs locaux.
   *
   * La protection administrateur est effectuée côté Rust.
   */
  listUsers: () => call<User[]>("list_users"),

  /**
   * Modifie le rôle d'un utilisateur.
   *
   * La vérification des droits administrateur est effectuée
   * côté backend Rust.
   */
  updateUserRole: (userId: string, role: User["role"]) =>
    call<User>("update_user_role", {
      userId,
      role,
    }),

  /**
   * Crée un compte avec un rôle précis (administrateur uniquement).
   */
  createUser: (input: {
    username: string;
    password: string;
    email?: string;
    role: Role;
  }) => call<User>("create_user", { input }),

  /**
   * Supprime un compte local, avec ses projets (administrateur uniquement).
   */
  deleteUser: (userId: string) => call<void>("delete_user", { userId }),

  /**
   * Indique si au moins un compte utilisateur existe.
   */
  hasAnyUser: () => call<boolean>("has_any_user"),

  // -------------------------------------------------------------------------
  // Phase 3 — Authentification
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau compte utilisateur local.
   */
  register: (input: {
    username: string;
    password: string;
    email?: string;
  }) => call<User>("register", { input }),

  /**
   * Authentifie un utilisateur existant.
   */
  login: (input: {
    username: string;
    password: string;
  }) => call<User>("login", { input }),

  /**
   * Ferme la session locale courante.
   */
  logout: () => call<void>("logout"),

  // -------------------------------------------------------------------------
  // Phase 4 — Profil et diagnostics
  // -------------------------------------------------------------------------

  /**
   * Met à jour l'adresse e-mail du compte connecté.
   * Une valeur vide supprime l'adresse.
   */
  updateProfile: (input: { email?: string }) =>
    call<User>("update_profile", { input }),

  /**
   * Change le mot de passe du compte connecté.
   */
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => call<void>("change_password", { input }),

  /**
   * Rapport de diagnostic (administrateur ou développeur).
   */
  getDiagnostics: () => call<Diagnostics>("get_diagnostics"),

  // -------------------------------------------------------------------------
  // Phase 4 — Projets
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau projet.
   *
   * `projectType` est volontairement en camelCase côté frontend.
   */
  createProject: (input: {
    name: string;
    description: string;
    projectType: Project["type"];
  }) => call<Project>("create_project", { input }),

  /**
   * Liste les projets accessibles à l'utilisateur courant.
   */
  listProjects: () => call<Project[]>("list_projects"),

  /**
   * Récupère un projet précis.
   */
  getProject: (projectId: string) =>
    call<Project>("get_project", { projectId }),

  /**
   * Ouvre un projet : enregistre la date d'ouverture et retourne le projet.
   */
  openProject: (projectId: string) =>
    call<Project>("open_project", { projectId }),

  /**
   * Met à jour un projet existant.
   *
   * Les champs sont optionnels afin de permettre des mises à jour
   * partielles depuis l'interface.
   */
  updateProject: (
    projectId: string,
    input: {
      name?: string;
      description?: string;
      projectType?: Project["type"];
      status?: Project["status"];
      isFavorite?: boolean;
      isArchived?: boolean;
    },
  ) =>
    call<Project>("update_project", {
      projectId,
      input,
    }),

  /**
   * Duplique un projet (métadonnées uniquement).
   */
  duplicateProject: (projectId: string) =>
    call<Project>("duplicate_project", { projectId }),

  /**
   * Supprime définitivement un projet.
   */
  deleteProject: (projectId: string) =>
    call<void>("delete_project", { projectId }),

  // -------------------------------------------------------------------------
  // Synopsis
  // -------------------------------------------------------------------------

  /**
   * Récupère le synopsis d'un projet.
   */
  getSynopsis: (projectId: string) =>
    call<Synopsis>("get_synopsis", { projectId }),

  /**
   * Met à jour le synopsis d'un projet.
   */
  updateSynopsis: (
    projectId: string,
    input: {
      content: string;
      genres: string[];
      subgenres: string[];
      tone: string[];
    },
  ) =>
    call<Synopsis>("update_synopsis", {
      projectId,
      input,
    }),
};