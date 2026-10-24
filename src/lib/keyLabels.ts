import { useTranslation } from "react-i18next";
import type { KeyLabels } from "@/lib/shortcuts";

/**
 * Noms des touches dans la langue de l'interface, pour `formatCombo`
 * (« Maj », « Échap », « PgSuiv » ; « Shift », « Esc », « PgDn »).
 */
export function useKeyLabels(): KeyLabels {
  const { t } = useTranslation("common");

  return {
    ctrl: t("keys.ctrl"),
    alt: t("keys.alt"),
    shift: t("keys.shift"),
    escape: t("keys.escape"),
    tab: t("keys.tab"),
    pageDown: t("keys.pageDown"),
    pageUp: t("keys.pageUp"),
    delete: t("keys.delete"),
    backspace: t("keys.backspace"),
    enter: t("keys.enter"),
    space: t("keys.space"),
  };
}
