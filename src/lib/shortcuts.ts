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

/** Texte d'un raccourci (« Ctrl+Maj+S »). `shiftLabel` : « Maj » ou « Shift ». */
export function formatCombo(combo: KeyCombo, shiftLabel: string): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push(shiftLabel);
  const named: Record<string, string> = { tab: "Tab", pagedown: "PgSuiv", pageup: "PgPréc" };
  parts.push(named[combo.key] ?? combo.key.toUpperCase());
  return parts.join("+");
}

/** Premier raccourci d'une action, pour l'afficher dans les menus. */
export function shortcutOf(action: AppAction): KeyCombo | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.action === action)?.combos[0];
}

/** Raccourcis listés pour information (gérés par l'éditeur ou les composants). */
export const REFERENCE: Array<{ group: "general" | "tabs" | "editor"; id: string; keys: string[] }> = [
  { group: "general", id: "undoDeletion", keys: ["Ctrl+Z"] },
  { group: "general", id: "escape", keys: ["Échap"] },
  { group: "general", id: "quit", keys: ["Alt+F4"] },
  { group: "tabs", id: "moveTab", keys: ["Alt+←", "Alt+→"] },
  { group: "tabs", id: "tabMenu", keys: ["Maj+F10"] },
  { group: "editor", id: "undo", keys: ["Ctrl+Z"] },
  { group: "editor", id: "redo", keys: ["Ctrl+Y", "Ctrl+Maj+Z"] },
  { group: "editor", id: "bold", keys: ["Ctrl+B"] },
  { group: "editor", id: "italic", keys: ["Ctrl+I"] },
  { group: "editor", id: "underline", keys: ["Ctrl+U"] },
  { group: "editor", id: "strike", keys: ["Ctrl+Maj+S"] },
  { group: "editor", id: "highlight", keys: ["Ctrl+Maj+H"] },
  { group: "editor", id: "code", keys: ["Ctrl+E"] },
  { group: "editor", id: "headings", keys: ["Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3"] },
  { group: "editor", id: "paragraph", keys: ["Ctrl+Alt+0"] },
  { group: "editor", id: "orderedList", keys: ["Ctrl+Maj+7"] },
  { group: "editor", id: "bulletList", keys: ["Ctrl+Maj+8"] },
  { group: "editor", id: "taskList", keys: ["Ctrl+Maj+9"] },
  { group: "editor", id: "quote", keys: ["Ctrl+Maj+B"] },
  { group: "editor", id: "align", keys: ["Ctrl+Maj+L", "Ctrl+Maj+E", "Ctrl+Maj+R", "Ctrl+Maj+J"] },
  { group: "editor", id: "indent", keys: ["Tab", "Maj+Tab"] },
];

// ----------------------------------------------------------------------------
// Fenêtres d'aide
// ----------------------------------------------------------------------------

export type HelpDialog = "guide" | "shortcuts" | "about" | "center";

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

/** Le guide de démarrage s'ouvre seul la première fois qu'un projet est ouvert. */
export function showGuideOnce() {
  try {
    if (localStorage.getItem(GUIDE_SEEN_KEY)) return;
    localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    return; // stockage indisponible : pas d'ouverture automatique
  }
  useHelpStore.getState().show("guide");
}
