import { create } from "zustand";
import type { CommandId } from "@/lib/commands";

/*
 * Raccourcis clavier de GANIS.
 *
 * `SHORTCUTS` : raccourcis qui exécutent une commande (voir `commands.ts`),
 * traités par `ShortcutHandler`. `REFERENCE` : raccourcis déjà gérés
 * ailleurs (éditeur de note, onglets, fenêtres), seulement listés dans la
 * fenêtre « Raccourcis clavier ».
 */

export interface KeyCombo {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** `event.key` en minuscules (« s », « tab », « f1 », « / »). */
  key: string;
}

export type AppAction = CommandId | "guide" | "shortcuts" | "center";

export interface Shortcut {
  action: AppAction;
  combos: KeyCombo[];
  /** Vrai : actif même pendant la saisie dans un champ. */
  inFields: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { action: "new", combos: [{ ctrl: true, key: "n" }], inFields: true },
  { action: "save", combos: [{ ctrl: true, key: "s" }], inFields: true },
  // Ctrl+Maj+S est déjà « Barré » dans l'éditeur de note.
  { action: "saveAll", combos: [{ ctrl: true, alt: true, key: "s" }], inFields: true },
  { action: "closeTab", combos: [{ ctrl: true, key: "w" }, { ctrl: true, key: "f4" }], inFields: true },
  { action: "nextTab", combos: [{ ctrl: true, key: "tab" }, { ctrl: true, key: "pagedown" }], inFields: true },
  {
    action: "previousTab",
    combos: [{ ctrl: true, shift: true, key: "tab" }, { ctrl: true, key: "pageup" }],
    inFields: true,
  },
  { action: "palette", combos: [{ ctrl: true, key: "k" }], inFields: true },
  { action: "center", combos: [{ key: "f1" }], inFields: true },
  // F5 : « lancer » le projet, comme le bouton ▶ de la barre de titre.
  { action: "readStory", combos: [{ key: "f5" }], inFields: true },
  { action: "shortcuts", combos: [{ ctrl: true, key: "/" }, { ctrl: true, key: ":" }], inFields: true },
];

/** Le raccourci correspond-il à cet appui ? (Maj est ignorée pour « / ».) */
export function matches(combo: KeyCombo, event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  if (key !== combo.key) return false;
  if (ctrl !== Boolean(combo.ctrl)) return false;
  if (event.altKey !== Boolean(combo.alt)) return false;
  // « / » s'obtient avec Maj sur certains claviers (AZERTY) : Maj ignorée.
  if (combo.key === "/" || combo.key === ":") return true;
  return event.shiftKey === Boolean(combo.shift);
}

export function findShortcut(event: KeyboardEvent): Shortcut | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.combos.some((combo) => matches(combo, event)));
}

/**
 * Noms des touches dans la langue de l'interface (`common.json` › `keys`),
 * par exemple « Maj », « Échap », « PgSuiv » en français, « Shift », « Esc »,
 * « PgDn » en anglais. Voir `useKeyLabels` (`keyLabels.ts`).
 */
export interface KeyLabels {
  ctrl: string;
  alt: string;
  shift: string;
  escape: string;
  tab: string;
  pageDown: string;
  pageUp: string;
  delete: string;
  backspace: string;
  enter: string;
  space: string;
}

/** Texte d'un raccourci (« Ctrl+Maj+S », « Ctrl+Shift+S »). */
export function formatCombo(combo: KeyCombo, labels: KeyLabels): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push(labels.ctrl);
  if (combo.alt) parts.push(labels.alt);
  if (combo.shift) parts.push(labels.shift);
  const named: Record<string, string> = {
    tab: labels.tab,
    pagedown: labels.pageDown,
    pageup: labels.pageUp,
    escape: labels.escape,
    delete: labels.delete,
    backspace: labels.backspace,
    enter: labels.enter,
    " ": labels.space,
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    arrowdown: "↓",
  };
  parts.push(named[combo.key] ?? combo.key.toUpperCase());
  return parts.join("+");
}

/** Premier raccourci d'une action, pour l'afficher dans les menus. */
export function shortcutOf(action: AppAction): KeyCombo | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)?.combos[0];
}

/**
 * Raccourcis listés pour information (gérés par l'éditeur ou les
 * composants). Décrits comme des combinaisons, pas comme du texte : leurs
 * noms de touches suivent la langue de l'interface (`formatCombo`).
 */
export const REFERENCE: Array<{ group: "general" | "tabs" | "editor"; id: string; keys: KeyCombo[] }> = [
  { group: "general", id: "undoDeletion", keys: [{ ctrl: true, key: "z" }] },
  { group: "general", id: "escape", keys: [{ key: "escape" }] },
  { group: "general", id: "quit", keys: [{ alt: true, key: "f4" }] },
  { group: "tabs", id: "moveTab", keys: [{ alt: true, key: "arrowleft" }, { alt: true, key: "arrowright" }] },
  { group: "tabs", id: "tabMenu", keys: [{ shift: true, key: "f10" }] },
  { group: "editor", id: "undo", keys: [{ ctrl: true, key: "z" }] },
  { group: "editor", id: "redo", keys: [{ ctrl: true, key: "y" }, { ctrl: true, shift: true, key: "z" }] },
  { group: "editor", id: "bold", keys: [{ ctrl: true, key: "b" }] },
  { group: "editor", id: "italic", keys: [{ ctrl: true, key: "i" }] },
  { group: "editor", id: "underline", keys: [{ ctrl: true, key: "u" }] },
  { group: "editor", id: "strike", keys: [{ ctrl: true, shift: true, key: "s" }] },
  { group: "editor", id: "highlight", keys: [{ ctrl: true, shift: true, key: "h" }] },
  { group: "editor", id: "code", keys: [{ ctrl: true, key: "e" }] },
  {
    group: "editor",
    id: "headings",
    keys: [{ ctrl: true, alt: true, key: "1" }, { ctrl: true, alt: true, key: "2" }, { ctrl: true, alt: true, key: "3" }],
  },
  { group: "editor", id: "paragraph", keys: [{ ctrl: true, alt: true, key: "0" }] },
  { group: "editor", id: "orderedList", keys: [{ ctrl: true, shift: true, key: "7" }] },
  { group: "editor", id: "bulletList", keys: [{ ctrl: true, shift: true, key: "8" }] },
  { group: "editor", id: "taskList", keys: [{ ctrl: true, shift: true, key: "9" }] },
  { group: "editor", id: "quote", keys: [{ ctrl: true, shift: true, key: "b" }] },
  {
    group: "editor",
    id: "align",
    keys: [
      { ctrl: true, shift: true, key: "l" },
      { ctrl: true, shift: true, key: "e" },
      { ctrl: true, shift: true, key: "r" },
      { ctrl: true, shift: true, key: "j" },
    ],
  },
  { group: "editor", id: "indent", keys: [{ key: "tab" }, { shift: true, key: "tab" }] },
];

// ----------------------------------------------------------------------------
// Fenêtres d'aide
// ----------------------------------------------------------------------------

export type HelpDialog = "guide" | "shortcuts" | "about" | "center" | "whatsNew" | "report";

interface HelpState {
  open: HelpDialog | null;
  show: (dialog: HelpDialog) => void;
  close: () => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  open: null,
  show: (dialog) => set({ open: dialog }),
  close: () => set({ open: null }),
}));

const GUIDE_SEEN_KEY = "ganis-guide-seen";

/**
 * Le guide de démarrage s'ouvre seul une fois, à la première arrivée sur
 * le tableau de bord (avec ou sans compte). Ensuite : Aide › Guide de
 * démarrage.
 */
export function showGuideOnce() {
  try {
    if (localStorage.getItem(GUIDE_SEEN_KEY)) return;
    localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    return; // stockage indisponible : pas d'ouverture automatique
  }
  useHelpStore.getState().show("guide");
}
