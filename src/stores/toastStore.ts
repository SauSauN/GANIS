import { create } from "zustand";

/*
 * Messages temporaires en bas de l'écran (« Personnage supprimé — Annuler »).
 *
 * Un message reste affiché quelques secondes (plus longtemps s'il propose
 * une action), et pas de disparition tant que la souris est dessus ou que
 * le clavier est sur l'un de ses boutons (voir `Toaster`).
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
  /** Durée d'affichage (ms). */
  duration: number;
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
      duration: toast.action ? 8000 : 4000,
      ...toast,
      id,
    };
    set({ toasts: [...get().toasts, full].slice(-MAX_TOASTS) });
    return id;
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  clear: () => set({ toasts: [] }),
}));

/** Raccourci pour afficher un message. */
export const toast = (input: Parameters<ToastState["show"]>[0]) => useToastStore.getState().show(input);
