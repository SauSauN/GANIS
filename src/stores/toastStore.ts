import { create } from "zustand";

/*
 * Messages temporaires en bas de l'écran (« Personnage supprimé — Annuler »).
 *
 * Un message reste affiché quelques secondes (plus longtemps s'il propose
 * une action ou signale une erreur), et pas de disparition tant que la
 * souris est dessus ou que le clavier est sur l'un de ses boutons (voir
 * `Toaster`).
 *
 * Tous les retours d'enregistrement (« Note enregistrée », « Échec de
 * l'enregistrement »…) passent par ici plutôt que par un texte dans
 * l'écran : l'interface ne bouge plus à chaque message. `key` regroupe
 * les messages d'une même source : un nouvel enregistrement remplace le
 * message précédent au lieu de s'empiler.
 */

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  action?: ToastAction;
  /** Seconde action, plus discrète (ex. « Ouvrir le manuscrit »). */
  secondary?: ToastAction;
  /** Durée d'affichage (ms). */
  duration: number;
  /** Source du message : un nouveau message de même clé remplace l'ancien. */
  key?: string;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id" | "duration" | "tone"> & Partial<Pick<Toast, "duration" | "tone">>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 0;

/** Au plus trois messages à la fois : le plus ancien laisse sa place. */
const MAX_TOASTS = 3;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (toast) => {
    const id = ++nextId;
    const full: Toast = {
      tone: "info",
      duration: toast.action || toast.tone === "error" ? 8000 : 4000,
      ...toast,
      id,
    };
    const current = get().toasts;
    const index = full.key ? current.findIndex((item) => item.key === full.key) : -1;

    if (index >= 0) {
      // Même source : remplacé sur place (pas de pile, pas de saut).
      const next = [...current];
      next[index] = full;
      set({ toasts: next });
    } else {
      set({ toasts: [...current, full].slice(-MAX_TOASTS) });
    }
    return id;
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  clear: () => set({ toasts: [] }),
}));

/** Raccourci pour afficher un message. */
export const toast = (input: Parameters<ToastState["show"]>[0]) => useToastStore.getState().show(input);
