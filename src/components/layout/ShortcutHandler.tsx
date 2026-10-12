import { useEffect } from "react";
import { runCommand } from "@/lib/commands";
import { isEditable, trackEditableFocus } from "@/lib/editCommands";
import { findShortcut, useHelpStore } from "@/lib/shortcuts";
import { undoLastDeletion } from "@/lib/trash";

/** Une fenêtre modale est ouverte : les raccourcis de l'application attendent. */
function modalOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]') !== null;
}

/**
 * Raccourcis clavier de toute l'application (voir `shortcuts.ts`).
 *
 * Écoute en phase de capture : Ctrl+N, Ctrl+W… ne doivent jamais atteindre
 * le moteur web (nouvelle fenêtre, fermeture). Ctrl+Z hors d'un champ de
 * saisie annule la dernière suppression.
 */
export function ShortcutHandler() {
  useEffect(() => trackEditableFocus(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      const ctrl = event.ctrlKey || event.metaKey;

      // Ctrl+Z hors d'un champ : annuler la dernière suppression.
      if (ctrl && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
        if (!isEditable(document.activeElement) && !modalOpen() && undoLastDeletion()) {
          event.preventDefault();
        }
        return;
      }

      const shortcut = findShortcut(event);
      if (!shortcut) return;

      if (!shortcut.inFields && isEditable(document.activeElement)) return;

      // Le moteur web ne doit pas traiter Ctrl+N, Ctrl+W, Ctrl+S, F1…
      event.preventDefault();

      if (modalOpen()) return;

      if (shortcut.action === "guide" || shortcut.action === "shortcuts" || shortcut.action === "center") {
        useHelpStore.getState().show(shortcut.action);
        return;
      }

      runCommand(shortcut.action);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
