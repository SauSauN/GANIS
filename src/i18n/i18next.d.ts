import "i18next";

import type { defaultNS, resources } from "@/i18n";

/**
 * Typage des clés de traduction : `t("login.titre")` (faute de frappe)
 * devient une erreur de compilation au lieu d'une clé brute à l'écran.
 * Le français sert de référence.
 *
 * `tutorials` n'en fait pas partie : ses clés sont composées à l'exécution
 * (voir `tutorialText`), et l'ajouter dépasse la profondeur de types de TypeScript.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: Omit<(typeof resources)["fr"], "tutorials">;
  }
}
