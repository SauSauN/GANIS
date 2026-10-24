import { create } from "zustand";

/**
 * Projet public à rendre privé dès qu'un compte sera connecté.
 *
 * Utilisé quand la connexion ne peut pas se faire sur place (création de
 * compte, configuration initiale, clé de récupération à noter) : le
 * tableau de bord applique la demande à l'arrivée du compte connecté.
 * Gardé en mémoire seulement (oublié en quittant l'application).
 *
 * `confirmName` : le nom du projet, retapé par l'utilisateur dans la
 * confirmation (exigé par Rust pour retirer un projet de l'espace public).
 */
export interface PendingVisibility {
  projectId: string;
  confirmName: string;
}

interface PendingVisibilityState {
  pending: PendingVisibility | null;
  request: (projectId: string, confirmName: string) => void;
  /** Renvoie la demande en attente et l'efface. */
  take: () => PendingVisibility | null;
}

export const usePendingVisibility = create<PendingVisibilityState>((set, get) => ({
  pending: null,
  request: (projectId, confirmName) => set({ pending: { projectId, confirmName } }),
  take: () => {
    const pending = get().pending;
    if (pending) set({ pending: null });
    return pending;
  },
}));
