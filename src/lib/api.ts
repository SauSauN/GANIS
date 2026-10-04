import { invoke } from "@tauri-apps/api/core";
import type { ApiErrorPayload, AppInfo, ErrorCode, Project, User } from "@/types";

export class ApiError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const p = e as ApiErrorPayload;
    return new ApiError(p.code, p.message);
  }
  // Erreur brute (commande inconnue, bridge indisponible…) : jamais affichée telle quelle.
  console.error(e);
  return new ApiError("INTERNAL", "Une erreur inattendue est survenue.");
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw normalize(e);
  }
}

/** Vrai quand l'application tourne dans Tauri (faux dans un simple navigateur). */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Seul point d'accès de l'interface au noyau Rust.
 * Les commandes marquées « Phase N » seront implémentées côté Rust plus tard.
 */
export const api = {
  appInfo: () => call<AppInfo>("app_info"),

  // Phase 3
  register: (input: { username: string; password: string; email?: string }) =>
    call<User>("register", { input }),
  login: (input: { username: string; password: string }) => call<User>("login", { input }),
  logout: () => call<void>("logout"),

  // Phase 4
  listProjects: () => call<Project[]>("list_projects"),
};
