/*
 * « Aide › Nouveautés » : ce qui a changé, version par version.
 *
 * Textes : `help.json` › `whatsNew.releases.<id>` (`title` et `items`).
 * L'identifiant est la version sans points (« 0.1.0 » → « v0_1_0 ») :
 * i18next lit les points comme des niveaux de clés.
 *
 * Après une mise à jour, la fenêtre s'ouvre seule une fois (version vue
 * gardée sur cet appareil). À la toute première installation, elle ne
 * s'ouvre pas : le guide de démarrage suffit.
 */

/** Versions décrites, de la plus récente à la plus ancienne. */
export const RELEASES = ["0.1.0"] as const;

const SEEN_KEY = "ganis-whats-new-seen";

/** Clé de traduction d'une version. */
export function releaseId(version: string): string {
  return `v${version.replace(/[^0-9A-Za-z]+/g, "_")}`;
}

/** Vrai si des nouveautés sont décrites pour cette version. */
export function hasReleaseNotes(version: string): boolean {
  return (RELEASES as readonly string[]).includes(version);
}

/**
 * Faut-il montrer les nouveautés de `version` ? Enregistre la version comme
 * vue dans tous les cas : la fenêtre ne s'ouvre qu'une fois.
 */
export function shouldShowWhatsNew(version: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): boolean {
  if (!storage) return false;

  let seen: string | null = null;
  try {
    seen = storage.getItem(SEEN_KEY);
    storage.setItem(SEEN_KEY, version);
  } catch {
    return false; // stockage indisponible : pas d'ouverture automatique
  }

  // Première installation : rien de « nouveau », le guide s'en charge.
  if (seen === null) return false;

  return seen !== version && hasReleaseNotes(version);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
