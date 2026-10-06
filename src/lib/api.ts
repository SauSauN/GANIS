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
 * Utilise les codes de `ErrorCode` (voir types/index.ts et error.rs).
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
 * Normalise toute erreur remontée par Tauri en `ApiError`.
 * Les erreurs inattendues sont loguées en console et remplacées
 * par un message générique (aucune fuite d'information technique).
 */
function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const p = e as ApiErrorPayload;
    return new ApiError(p.code, p.message);
  }
  console.error(e);
  return new ApiError("INTERNAL", "Une erreur inattendue est survenue.");
}

/**
 * Wrapper bas niveau autour de `invoke`.
 * Toutes les commandes passent par ici pour garantir une erreur normalisée.
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

/** Vrai quand l'application tourne dans Tauri (faux dans un simple navigateur). */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Seul point d'accès de l'interface au noyau Rust.
 * Les commandes marquées « Phase N » seront implémentées côté Rust plus tard.
 */
export const api = {
  // -------------------------------------------------------------------------
  // Général
  // -------------------------------------------------------------------------
  appInfo: () => call<AppInfo>("app_info"),

  // -------------------------------------------------------------------------
  // Phase 2 — Configuration initiale & administration
  // -------------------------------------------------------------------------
  /** Crée le premier compte administrateur (uniquement si aucun utilisateur n'existe). */
  setupAdmin: (input: { username: string; password: string; email?: string }) =>
    call<User>("setup_admin", { input }),

  /** Liste tous les comptes utilisateurs locaux (réservé aux administrateurs). */
  listUsers: () => call<User[]>("list_users"),

  /** Indique si un compte administrateur existe déjà (pour afficher /setup). */
  hasAnyUser: () => call<boolean>("has_any_user"),

  // -------------------------------------------------------------------------
  // Phase 3 — Authentification
  // -------------------------------------------------------------------------
  register: (input: { username: string; password: string; email?: string }) =>
    call<User>("register", { input }),

  login: (input: { username: string; password: string }) =>
    call<User>("login", { input }),

  logout: () => call<void>("logout"),

  // -------------------------------------------------------------------------
  // Phase 4 — Projets
  // -------------------------------------------------------------------------
  listProjects: () => call<Project[]>("list_projects"),
};