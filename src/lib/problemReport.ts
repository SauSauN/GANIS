import { getActiveColorThemeId } from "@/lib/colorTheme";
import { getAutoSave, getTextSize } from "@/lib/preferences";
import { getThemeMode } from "@/lib/theme";

/*
 * « Aide › Signaler un problème » : informations techniques à copier dans
 * un message.
 *
 * Rien ne part tout seul (GANIS est hors ligne) : l'utilisateur copie le
 * texte, le relit et le colle où il veut. Aucune donnée de projet n'y
 * figure : ni nom de compte, ni titre, ni contenu. Seuls la version, le
 * système, les réglages d'affichage et les derniers messages d'erreur sont
 * repris (un message d'erreur peut citer un nom de type ou de fichier :
 * l'aperçu permet de le vérifier avant l'envoi).
 */

/** Nombre de messages d'erreur gardés en mémoire (les plus récents). */
export const MAX_RECENT_ERRORS = 10;

/** Longueur maximale d'un message gardé (le reste est coupé). */
const MAX_MESSAGE_LENGTH = 300;

export interface RecentError {
  /** Heure ISO. */
  at: string;
  message: string;
}

let recent: RecentError[] = [];

/** Première ligne d'un message, sans espaces superflus, bornée. */
function firstLine(message: string): string {
  const line = message.split("\n")[0].trim();

  return line.length > MAX_MESSAGE_LENGTH ? `${line.slice(0, MAX_MESSAGE_LENGTH)}…` : line;
}

/** Garde un message d'erreur pour le rapport (en mémoire seulement). */
export function recordError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

  const clean = firstLine(message ?? "");
  if (!clean) return;

  recent = [...recent, { at: new Date().toISOString(), message: clean }].slice(-MAX_RECENT_ERRORS);
}

/** Derniers messages d'erreur, du plus ancien au plus récent. */
export function recentErrors(): RecentError[] {
  return recent;
}

/** Vide la liste (tests). */
export function clearRecentErrors() {
  recent = [];
}

let installed = false;

/** Suit les erreurs non rattrapées de l'interface (une seule fois, au démarrage). */
export function initErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => recordError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => recordError(event.reason));
}

export interface ReportContext {
  /** Version de GANIS (`null` si le moteur ne répond pas). */
  version: string | null;
  language: string;
  /** Session : compte connecté ou espace public (jamais le nom du compte). */
  signedIn: boolean;
  /** Dernier échec d'enregistrement affiché par la barre d'état. */
  lastSaveError: string | null;
  /** Ce que faisait l'utilisateur (facultatif, saisi dans la fenêtre). */
  description: string;
  /** Libellés des rubriques, dans la langue de l'interface. */
  labels: {
    title: string;
    description: string;
    version: string;
    system: string;
    language: string;
    session: string;
    signedIn: string;
    guest: string;
    display: string;
    lastSaveError: string;
    recentErrors: string;
    none: string;
    unknown: string;
    /** Description laissée vide. */
    notGiven: string;
    /** Deux-points de la langue (« : » en français, « : » collé en anglais). */
    colon: string;
  };
}

/** Texte complet du rapport, prêt à copier. */
export function buildReport(context: ReportContext, now: Date = new Date()): string {
  const { labels } = context;
  const nav = typeof navigator === "undefined" ? null : navigator;
  const screenInfo =
    typeof window === "undefined"
      ? labels.unknown
      : `${window.innerWidth}×${window.innerHeight}, ×${window.devicePixelRatio || 1}`;
  const autoSave = getAutoSave();
  const c = labels.colon;

  const session = context.signedIn ? labels.signedIn : labels.guest;
  const saving = autoSave.enabled ? `auto-save ${autoSave.delay} s` : "auto-save off";
  const display = [getThemeMode(), getActiveColorThemeId(), getTextSize(), screenInfo, saving].join(" / ");
  const saveError = context.lastSaveError ? firstLine(context.lastSaveError) : labels.none;
  const errors = recent.length === 0 ? [labels.none] : recent.map((error) => `- ${error.at} ${error.message}`);

  const lines = [
    `# ${labels.title}`,
    "",
    `${labels.description}${c}`,
    context.description.trim() || labels.notGiven,
    "",
    `${labels.version}${c} GANIS ${context.version ?? labels.unknown}`,
    `${labels.system}${c} ${nav?.userAgent ?? labels.unknown}`,
    `${labels.language}${c} ${context.language}`,
    `${labels.session}${c} ${session}`,
    `${labels.display}${c} ${display}`,
    `${labels.lastSaveError}${c} ${saveError}`,
    "",
    `${labels.recentErrors}${c}`,
    ...errors,
    "",
    `(${now.toISOString()})`,
  ];

  return lines.join("\n");
}
