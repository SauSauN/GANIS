import { create } from "zustand";
import { api } from "@/lib/api";

/*
 * Logo des projets (image `data:`), partagé entre l'accueil du projet, qui
 * l'affiche, et la Galerie, où on l'ajoute : un changement dans l'une se
 * voit aussitôt dans l'autre.
 *
 * Rangé par projet : un composant ne lit jamais le logo d'un autre projet.
 * Vidé en quittant un projet et à la déconnexion (voir `projectStore`).
 */

interface ProjectLogoState {
  /** `undefined` : pas encore chargé ; `null` : pas de logo. */
  logos: Record<string, string | null>;
  fetchLogo: (projectId: string) => Promise<void>;
  setLogo: (projectId: string, url: string | null) => void;
  reset: () => void;
}

export const useProjectLogoStore = create<ProjectLogoState>((set, get) => ({
  logos: {},

  fetchLogo: async (projectId) => {
    if (projectId in get().logos) return;

    const logo = await api.getProjectLogo(projectId);
    const url = logo ? `data:${logo.mime};base64,${logo.data}` : null;
    set((state) => ({ logos: { ...state.logos, [projectId]: url } }));
  },

  setLogo: (projectId, url) => set((state) => ({ logos: { ...state.logos, [projectId]: url } })),

  reset: () => set({ logos: {} }),
}));

/** Logo d'un projet (`undefined` tant qu'il n'est pas chargé). */
export function useProjectLogo(projectId: string): string | null | undefined {
  return useProjectLogoStore((state) => state.logos[projectId]);
}
