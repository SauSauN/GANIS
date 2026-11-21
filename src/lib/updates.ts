import { useSyncExternalStore } from "react";
import { isTauri } from "@/lib/api";

/*
 * Vérification des mises à jour.
 *
 * GANIS fonctionne hors ligne : c'est la seule connexion réseau de
 * l'application, et elle n'a lieu que si l'utilisateur la demande
 * (« Vérifier les mises à jour » dans « Aide › À propos ») ou l'a activée
 * (« Vérifier au démarrage », désactivé par défaut). Elle ne fait que lire
 * le numéro de la dernière version publiée : rien n'est envoyé sur le
 * compte ni sur les projets, et rien n'est installé tout seul — la page de
 * téléchargement s'ouvre dans le navigateur.
 *
 * Source : la dernière « release » du dépôt GitHub de GANIS. Pour une autre
 * diffusion, il suffit de changer `RELEASES_API` / `RELEASES_PAGE` (et la
 * ligne `connect-src` de `tauri.conf.json`).
 */

export const RELEASES_API = "https://api.github.com/repos/SauSauN/GANIS/releases/latest";
export const RELEASES_PAGE = "https://github.com/SauSauN/GANIS/releases/latest";

/** Hôte contacté, affiché tel quel à l'utilisateur (transparence). */
export const UPDATE_HOST = new URL(RELEASES_API).host;

export type UpdateCheck =
  | { status: "upToDate"; latest: string }
  | { status: "available"; latest: string; url: string }
  /** Aucune version publiée pour l'instant. */
  | { status: "none" };

/**
 * Compare deux numéros de version (« 1.2.0 », « v1.10 », « 1.0.0-beta »).
 * Négatif si `a` est plus ancien que `b`, 0 si égaux, positif sinon.
 * Une préversion (« -beta ») passe avant la version finale.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core, pre = ""] = version.trim().replace(/^v/i, "").split("-", 2);
    return { parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre };
  };
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.parts.length, right.parts.length);

  for (let i = 0; i < length; i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

/** Interroge la dernière version publiée. Lève une erreur hors connexion. */
export async function checkForUpdate(current: string, fetcher: typeof fetch = fetch): Promise<UpdateCheck> {
  const response = await fetcher(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
    // Pas de cookie ni d'identifiant : seule la version est demandée.
    credentials: "omit",
    cache: "no-store",
  });

  if (response.status === 404) return { status: "none" };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const release = (await response.json()) as { tag_name?: string; html_url?: string };
  const latest = (release.tag_name ?? "").replace(/^v/i, "");
  if (!latest) return { status: "none" };

  return compareVersions(latest, current) > 0
    ? { status: "available", latest, url: release.html_url || RELEASES_PAGE }
    : { status: "upToDate", latest };
}

/** Ouvre la page de téléchargement dans le navigateur par défaut. */
export async function openReleasePage(url: string = RELEASES_PAGE): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

// ----------------------------------------------------------------------------
// Option « Vérifier au démarrage » (propre à l'appareil, désactivée par défaut)
// ----------------------------------------------------------------------------

const AUTO_KEY = "ganis-update-auto-check";
const LAST_KEY = "ganis-update-last-check";
const AUTO_EVENT = "ganis:update-auto-check-change";

/** Une vérification automatique au plus par jour. */
const AUTO_INTERVAL = 24 * 60 * 60 * 1000;

export function getAutoUpdateCheck(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoUpdateCheck(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? "1" : "0");
  } catch {
    /* stockage indisponible : l'option reste désactivée */
  }
  window.dispatchEvent(new Event(AUTO_EVENT));
}

export function useAutoUpdateCheck(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(AUTO_EVENT, onChange);
      return () => window.removeEventListener(AUTO_EVENT, onChange);
    },
    getAutoUpdateCheck,
    () => false,
  );
}

/**
 * Vrai si la vérification automatique doit avoir lieu maintenant (option
 * activée, dernière vérification il y a plus d'un jour). Note l'heure.
 */
export function shouldAutoCheck(now: number = Date.now()): boolean {
  if (!getAutoUpdateCheck()) return false;
  try {
    const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
    if (now - last < AUTO_INTERVAL) return false;
    localStorage.setItem(LAST_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
