import { create } from "zustand";

/*
 * État réel des enregistrements, affiché dans la barre d'état.
 *
 * Chaque écriture envoyée au noyau Rust (création, modification,
 * suppression, déplacement…) passe par `api.call`, qui la signale ici :
 * - pendant l'écriture : « Enregistrement… » ;
 * - réussie : « Enregistré à 14:32 » ;
 * - refusée : « Échec de l'enregistrement », avec le message de l'erreur,
 *   jusqu'à la prochaine écriture réussie.
 *
 * Les modifications pas encore envoyées (formulaire modifié, note en cours
 * de frappe) sont, elles, connues du registre `unsavedChanges`.
 */

/** Commandes qui écrivent dans la base (le reste ne fait que lire). */
const WRITE_PREFIXES = [
  "add_",
  "clear_",
  "create_",
  "delete_",
  "duplicate_",
  "empty_",
  "link_",
  "move_",
  "purge_",
  "raise_",
  "remove_",
  "rename_",
  "renumber_",
  "reorder_",
  "restore_",
  "save_graph_",
  "set_",
  "unlink_",
  "update_",
];

/** Commandes du compte (connexion…) : jamais signalées comme un enregistrement. */
const IGNORED = new Set(["save_recovery_key_file"]);

export function isWriteCommand(command: string): boolean {
  return !IGNORED.has(command) && WRITE_PREFIXES.some((prefix) => command.startsWith(prefix));
}

interface SaveStatusState {
  /** Écritures en cours. */
  pending: number;
  /** Heure (ISO) de la dernière écriture réussie. */
  lastSavedAt: string | null;
  /** Message de la dernière écriture refusée (effacé par la suivante réussie). */
  lastError: string | null;

  begin: () => void;
  succeed: () => void;
  fail: (message: string) => void;
  dismissError: () => void;
}

export const useSaveStatusStore = create<SaveStatusState>((set, get) => ({
  pending: 0,
  lastSavedAt: null,
  lastError: null,

  begin: () => set({ pending: get().pending + 1 }),
  succeed: () =>
    set({ pending: Math.max(0, get().pending - 1), lastSavedAt: new Date().toISOString(), lastError: null }),
  fail: (message) => set({ pending: Math.max(0, get().pending - 1), lastError: message }),
  dismissError: () => set({ lastError: null }),
}));

export type SaveState = "saving" | "error" | "unsaved" | "saved" | "idle";

/**
 * État à afficher, du plus important au moins important : écriture en
 * cours, échec, modifications non enregistrées, enregistré, prêt.
 */
export function resolveSaveState(pending: number, lastError: string | null, unsavedCount: number, lastSavedAt: string | null): SaveState {
  if (pending > 0) return "saving";
  if (lastError) return "error";
  if (unsavedCount > 0) return "unsaved";
  if (lastSavedAt) return "saved";
  return "idle";
}
