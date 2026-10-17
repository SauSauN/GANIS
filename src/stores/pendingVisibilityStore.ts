import { create } from "zustand";

/**
 * Projet public à rendre privé dès qu'un compte sera connecté.
 *
 * Utilisé quand la connexion ne peut pas se faire sur place (création de
 * compte, configuration initiale, clé de récupération à noter) : le
 * tableau de bord applique la demande à l'arrivée du compte connecté.
 * Gardé en mémoire seulement (oublié en quittant l'application).
 */
interface PendingVisibilityState {
  projectId: string | null;
  request: (projectId: string) => void;
  /** Renvoie la demande en attente et l'efface. */
  take: () => string | null;
}

export const usePendingVisibility = create<PendingVisibilityState>((set, get) => ({
  projectId: null,
  request: (projectId) => set({ projectId }),
  take: () => {
    const projectId = get().projectId;
    if (projectId) set({ projectId: null });
    return projectId;
  },
}));
