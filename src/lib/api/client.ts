import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import i18n from "@/i18n";
import { isWriteCommand, useSaveStatusStore } from "@/lib/saveStatus";
import type { ApiErrorPayload, ErrorCode } from "@/types";

/** `t` sans typage des clés : les clés d'erreur viennent de Rust, à l'exécution. */
const translate = i18n.t.bind(i18n) as unknown as (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * Message d'une erreur Rust dans la langue de l'interface.
 *
 * 1. Rust a fourni une clé connue de `errors.json` → message traduit ;
 * 2. sinon, en français → le message d'origine de Rust (le plus précis) ;
 * 3. sinon → un message générique selon le code (`errors.codes.*`).
 */
export function translateApiError(error: ApiError): string {
  const message = translateMessage(error);

  // Piste de solution, quand il y en a une (`errors.json` › `hints`).
  const hintKey = error.key && i18n.exists(`errors:hints.${error.key}`)
    ? `errors:hints.${error.key}`
    : !error.key && i18n.exists(`errors:hints.codes.${error.code}`)
      ? `errors:hints.codes.${error.code}`
      : null;

  return hintKey ? `${message} ${translate(hintKey)}` : message;
}

function translateMessage(error: ApiError): string {
  if (error.key && i18n.exists(`errors:${error.key}`)) {
    const params: Record<string, unknown> = { ...error.params };

    // Nom de champ (ex. `genres`) : traduit lui aussi.
    if (typeof params.field === "string") {
      params.field = translate(`errors:fields.${params.field}`, {
        defaultValue: params.field,
      });
    }

    return translate(`errors:${error.key}`, params);
  }

  if (i18n.resolvedLanguage === "fr") {
    return error.rawMessage;
  }

  return translate(`errors:codes.${error.code}`);
}

/**
 * Erreur normalisée renvoyée par le pont Rust.
 *
 * Utilise les codes de `ErrorCode` définis dans `types/index.ts`
 * et correspondant aux codes du backend Rust.
 *
 * `message` est traduit à chaque lecture (voir `translateApiError`) :
 * tout le code existant qui affiche `e.message` obtient donc le texte
 * dans la langue de l'interface, sans modification.
 */
export class ApiError extends Error {
  code: ErrorCode;
  /** Message d'origine, en français, tel que renvoyé par Rust. */
  readonly rawMessage: string;
  /** Clé de traduction fournie par Rust (`errors.json`). */
  readonly key?: string;
  /** Valeurs à insérer dans le message traduit. */
  readonly params?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    message: string,
    key?: string,
    params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.rawMessage = message;
    this.key = key;
    this.params = params;

    Object.defineProperty(this, "message", {
      get: () => translateApiError(this),
      configurable: true,
      enumerable: false,
    });
  }
}

/** Construit une `ApiError` à partir de la réponse de Rust. */
function fromPayload(payload: ApiErrorPayload): ApiError {
  return new ApiError(
    payload.code,
    payload.message,
    payload.key,
    payload.params,
  );
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
      return fromPayload(parsed);
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
    return fromPayload(e);
  }

  if (typeof e === "string") {
    const parsed = parseErrorString(e);

    if (parsed) {
      return parsed;
    }

    console.error("Erreur Tauri :", e);

    return unexpected();
  }

  if (e instanceof Error) {
    console.error("Erreur Tauri :", e);

    return unexpected();
  }

  console.error("Erreur Tauri inconnue :", e);

  return unexpected();
}

/**
 * Erreur sans message exploitable (texte brut de Tauri, exception) : le
 * détail technique reste dans la console, l'utilisateur lit un message
 * clair dans sa langue.
 */
function unexpected(): ApiError {
  return new ApiError("INTERNAL", i18n.t("errors:unexpected"));
}

/**
 * Wrapper bas niveau autour de `invoke`.
 *
 * Toutes les commandes Tauri passent par cette fonction afin
 * de garantir une gestion uniforme des erreurs.
 */
export async function call<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  // Les écritures sont signalées à la barre d'état (voir `saveStatus.ts`).
  const writes = isWriteCommand(command);
  const status = useSaveStatusStore.getState();

  if (writes) status.begin();

  try {
    const result = await invoke<T>(command, args, options);
    if (writes) status.succeed();
    return result;
  } catch (e) {
    const error = normalize(e);
    if (writes) status.fail(error.message);
    throw error;
  }
}

/** Corps binaire d'une commande (Tauri l'envoie sans le convertir en JSON). */
export function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Vrai lorsque l'application tourne dans Tauri.
 * Faux lorsque le frontend est exécuté dans un navigateur classique.
 */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
