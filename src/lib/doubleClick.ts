import type { MouseEvent } from "react";
import i18n from "@/i18n";

/*
 * Double-clic dans le panneau central.
 *
 * Il n'est ajouté que là où le simple clic fait autre chose qu'ouvrir
 * (renommer, déplier, sélectionner) : sur une ligne du plan, une ligne
 * d'avancement, une entrée de l'historique, un en-tête de piste… Ailleurs,
 * le simple clic ouvre déjà l'élément et le double-clic ne fait rien de
 * plus. Chaque action reste aussi accessible par un bouton (clavier).
 */

/** Éléments qui ont leur propre comportement au clic : le double-clic de la ligne les ignore. */
const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable="true"], [role="button"], [role="checkbox"]';

/** Vrai si le double-clic vient d'un bouton, d'un champ… à l'intérieur de la ligne. */
export function fromInteractive(event: Pick<MouseEvent, "target" | "currentTarget">): boolean {
  const target = event.target as Element | null;
  const row = event.currentTarget as Element | null;
  const hit = target?.closest?.(INTERACTIVE);

  return Boolean(hit && hit !== row && row?.contains(hit));
}

/**
 * Gestionnaire de double-clic pour une ligne : `action` n'est lancée que
 * si le double-clic tombe sur la ligne elle-même (pas sur l'un de ses
 * boutons ou champs). La sélection de texte créée par le double-clic est
 * retirée.
 */
export function onRowDoubleClick(action: () => void) {
  return (event: MouseEvent) => {
    if (fromInteractive(event)) return;
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges();
    action();
  };
}

/**
 * Infobulle qui signale le double-clic (« Double-cliquez pour ouvrir la
 * fiche »). Lue à chaque affichage : elle suit la langue de l'interface.
 */
export function doubleClickHint(kind: "openSheet" | "openItem" | "renameLane"): string {
  return i18n.t(`common:doubleClick.${kind}`);
}
