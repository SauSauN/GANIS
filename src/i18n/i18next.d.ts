import "i18next";

import type { defaultNS, resources } from "@/i18n";

/**
 * Typage des clés de traduction : `t("login.titre")` (faute de frappe)
 * devient une erreur de compilation au lieu d'une clé brute à l'écran.
 * Le français sert de référence.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)["fr"];
  }
}
