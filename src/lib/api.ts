import { invoke } from "@tauri-apps/api/core";
import type {
  ApiErrorPayload,
  AppInfo,
  ErrorCode,
  Project,
  User,
} from "@/types";

/**
 * Erreur normalisée renvoyée par le pont Rust.
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
 *
 * Tauri peut transmettre certaines erreurs sous forme de chaîne JSON,
 * par exemple :
 *
 * {"code":"DATABASE","message":"Une erreur est survenue."}
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
    // La chaîne n'est pas du JSON : on la traite plus bas.
  }

  return null;
}

/**
 * Normalise toute erreur remontée par Tauri en `ApiError`.
 *
 * Les formats pris en charge sont :
 * - une instance de `ApiError` ;
 * - un objet `{ code, message }` ;
 * - une chaîne contenant un objet JSON `{ code, message }` ;
 * - une Error JavaScript classique ;
 * - une chaîne d'erreur simple.
 *
 * Une erreur réellement inconnue est journalisée et remplacée
 * par un message générique.
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
 * Vrai quand l'application tourne dans Tauri.
 * Faux lorsque le frontend est exécuté dans un navigateur classique.
 */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Seul point d'accès de l'interface au noyau Rust.
 *
 * Les commandes non encore implémentées côté Rust sont conservées
 * ici afin de garder l'API frontend centralisée.
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
   *
   * Le backend vérifie qu'aucun utilisateur n'existe déjà.
   */
  setupAdmin: (
    input: {
      username: string;
      password: string;
      email?: string;
    },
  ) => call<User>("setup_admin", { input }),

  /**
   * Liste les comptes utilisateurs locaux.
   *
   * Cette commande est réservée au rôle administrateur côté backend.
   */
  listUsers: () => call<User[]>("list_users"),

  /**
   * Indique si au moins un compte utilisateur existe déjà.
   */
  hasAnyUser: () => call<boolean>("has_any_user"),

  // -------------------------------------------------------------------------
  // Phase 3 — Authentification
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau compte utilisateur local.
   */
  register: (
    input: {
      username: string;
      password: string;
      email?: string;
    },
  ) => call<User>("register", { input }),

  /**
   * Authentifie un utilisateur existant.
   */
  login: (
    input: {
      username: string;
      password: string;
    },
  ) => call<User>("login", { input }),

  /**
   * Ferme la session locale courante.
   */
  logout: () => call<void>("logout"),

  // -------------------------------------------------------------------------
  // Phase 4 — Projets
  // -------------------------------------------------------------------------

  /**
   * Liste les projets accessibles à l'utilisateur courant.
   */
  listProjects: () => call<Project[]>("list_projects"),
};