import { isTauri } from "@/lib/api";

/**
 * Protections contre les comportements « navigateur » de la WebView.
 *
 * GANIS est une application de bureau : le menu contextuel natif de
 * WebView2 (Actualiser, Retour, Avancer, Imprimer, Inspecter…), ouvert par
 * un clic droit ou un appui à deux doigts sur le pavé tactile, et les
 * raccourcis de navigation (F5, Ctrl+R, Ctrl+P, Alt+←, boutons
 * précédent / suivant de la souris) n'y ont pas leur place : ils
 * rechargeraient l'interface ou changeraient de page sans le vouloir.
 *
 * - Les menus contextuels propres à GANIS (onglets, correcteur
 *   orthographique…) ne sont pas touchés : ils traitent le clic avant ce
 *   garde-fou (écouteur sur `window`, en phase de remontée) et appellent
 *   eux-mêmes `preventDefault`.
 * - Dans un champ de saisie, le menu natif reste disponible : il ne
 *   propose alors que couper, copier, coller.
 * - Le défilement et le zoom du pavé tactile ne passent pas par ces
 *   événements et restent intacts. Le balayage à deux doigts pour
 *   revenir en arrière est déjà désactivé côté natif (wry, Windows :
 *   `IsSwipeNavigationEnabled` à faux par défaut).
 *
 * Actif seulement dans l'application (Tauri) : dans un navigateur de
 * développement, l'inspecteur reste accessible.
 */

/** Vrai si l'élément est un champ où l'on écrit. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const field = target.closest("input, textarea, select, [contenteditable]");
  if (!field) return false;

  if (field instanceof HTMLInputElement) {
    // Cases, boutons, curseurs… : pas de texte à couper ou coller.
    const textual = ["text", "search", "email", "url", "tel", "password", "number", ""];
    return textual.includes(field.type) && !field.readOnly && !field.disabled;
  }

  if (field instanceof HTMLTextAreaElement) {
    return !field.readOnly && !field.disabled;
  }

  if (field instanceof HTMLSelectElement) return false;

  return (field as HTMLElement).isContentEditable;
}

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * Raccourcis du navigateur à neutraliser : rechargement, impression,
 * historique. Les outils de développement restent disponibles en
 * développement (`allowDevTools`).
 */
export function isBrowserShortcut(event: KeyLike, allowDevTools: boolean): boolean {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;

  // Touches dédiées (claviers multimédias).
  if (key === "browserback" || key === "browserforward" || key === "browserrefresh") {
    return true;
  }

  // Rechargement : F5, Ctrl+F5, Ctrl+R, Ctrl+Maj+R.
  if (key === "f5") return true;
  if (ctrl && !event.altKey && key === "r") return true;

  // Impression : Ctrl+P (et Ctrl+Maj+P).
  if (ctrl && !event.altKey && key === "p") return true;

  // Historique : Alt+← / Alt+→.
  if (event.altKey && !ctrl && (key === "arrowleft" || key === "arrowright")) return true;

  // Outils de développement : F12, Ctrl+Maj+I / J / C.
  if (!allowDevTools) {
    if (key === "f12") return true;
    if (ctrl && event.shiftKey && (key === "i" || key === "j" || key === "c")) return true;
  }

  return false;
}

/** Boutons « précédent » (3) et « suivant » (4) de la souris. */
export function isHistoryMouseButton(button: number): boolean {
  return button === 3 || button === 4;
}

let installed = false;

/** Installe les protections (une seule fois, au démarrage). */
export function initNativeGuards(): void {
  if (installed || !isTauri()) return;
  installed = true;

  const allowDevTools = import.meta.env.DEV;

  // Menu contextuel natif : bloqué hors des champs de saisie. Phase de
  // remontée : les menus de GANIS ont déjà traité l'événement.
  window.addEventListener("contextmenu", (event) => {
    if (event.defaultPrevented) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  });

  // Raccourcis du navigateur. Phase de capture : ils sont neutralisés même
  // si un champ arrête la propagation ; seul le comportement natif est
  // empêché, les raccourcis de GANIS continuent de recevoir la touche.
  window.addEventListener(
    "keydown",
    (event) => {
      if (isBrowserShortcut(event, allowDevTools)) event.preventDefault();
    },
    true,
  );

  // Boutons précédent / suivant de la souris : pas de navigation.
  const blockHistoryButton = (event: MouseEvent) => {
    if (isHistoryMouseButton(event.button)) event.preventDefault();
  };
  window.addEventListener("mousedown", blockHistoryButton, true);
  window.addEventListener("mouseup", blockHistoryButton, true);
  window.addEventListener("auxclick", blockHistoryButton, true);
}
