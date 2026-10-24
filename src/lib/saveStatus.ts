import { create } from "zustand";

/*
 * État réel des enregistrements, affiché dans la barre d'état.
 *
 * Chaque écriture envoyée au noyau Rust (création, modification,
 * suppression, déplacement…) passe par `api.call`, qui la signale ici :
 * - pendant l'écriture : « Enregistrement… » ;
 * - réussie : « Enregistré à 14:32 » ;
 * - refusée : « Échec de l'enregistrement », avec le message de l'erreur,
 *   jusqu'à la prochaine écriture réussie ;
 * - refusée puis masquée (« Masquer l'erreur ») : « Dernier enregistrement
 *   en échec ». Jamais « Enregistré » tant qu'aucune écriture n'a réussi
 *   depuis l'échec.
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
  /** L'échec a été masqué par l'utilisateur : il reste signalé, plus discrètement. */
  errorDismissed: boolean;

  begin: () => void;
  succeed: () => void;
  fail: (message: string) => void;
  dismissError: () => void;
}

export const useSaveStatusStore = create<SaveStatusState>((set, get) => ({
  pending: 0,
  lastSavedAt: null,
  lastError: null,
  errorDismissed: false,

  begin: () => set({ pending: get().pending + 1 }),
  succeed: () =>
    set({
      pending: Math.max(0, get().pending - 1),
      lastSavedAt: new Date().toISOString(),
      lastError: null,
      errorDismissed: false,
    }),
  fail: (message) =>
    set({ pending: Math.max(0, get().pending - 1), lastError: message, errorDismissed: false }),
  // Le message reste connu (bouton « Détails ») : seul l'affichage change.
  dismissError: () => set({ errorDismissed: get().lastError !== null }),
}));

export type SaveState = "saving" | "error" | "unsaved" | "failed" | "saved" | "idle";

/**
 * État à afficher, du plus important au moins important : écriture en
 * cours, échec, modifications non enregistrées, échec masqué (« Dernier
 * enregistrement en échec »), enregistré, prêt.
 *
 * Un échec, même masqué, n'est remplacé par « Enregistré » qu'après une
 * écriture réussie (`succeed` efface alors `lastError`).
 */
export function resolveSaveState(
  pending: number,
  lastError: string | null,
  unsavedCount: number,
  lastSavedAt: string | null,
  errorDismissed = false,
): SaveState {
  if (pending > 0) return "saving";
  if (lastError && !errorDismissed) return "error";
  if (unsavedCount > 0) return "unsaved";
  if (lastError) return "failed";
  if (lastSavedAt) return "saved";
  return "idle";
}
