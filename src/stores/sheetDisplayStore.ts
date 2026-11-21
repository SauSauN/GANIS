import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { SheetDisplay, SheetModule } from "@/types";

/*
 * Affichage des sections « Récit » et « Trame » sur les fiches du projet
 * ouvert (Paramètres du projet › Personnages / Lieux). Seul l'affichage
 * change : les données restent utilisées partout ailleurs. Par défaut, et
 * tant que le réglage n'est pas lu, les sections sont masquées.
 */

interface SheetDisplayState {
  projectId: string | null;
  items: SheetDisplay[] | null;
  fetch: (projectId: string) => Promise<void>;
  save: (projectId: string, module: SheetModule, showStory: boolean, showPlot: boolean) => Promise<void>;
  /** Panneau du milieu en arborescence ou en simple liste. */
  savePanelTree: (projectId: string, module: SheetModule, tree: boolean) => Promise<void>;
  reset: () => void;
}

let latest = 0;

export const useSheetDisplayStore = create<SheetDisplayState>((set, get) => ({
  projectId: null,
  items: null,

  fetch: async (projectId) => {
    const request = ++latest;
    if (get().projectId !== projectId) set({ projectId, items: null });
    try {
      const items = await api.getSheetDisplay(projectId);
      if (request === latest && get().projectId === projectId) set({ items });
    } catch {
      // Réglage illisible : les sections restent masquées (défaut).
      if (request === latest && get().projectId === projectId) set({ items: [] });
    }
  },

  save: async (projectId, module, showStory, showPlot) => {
    const saved = await api.setSheetDisplay(projectId, module, showStory, showPlot);
    if (get().projectId !== projectId) return;
    set((state) => ({ items: [...(state.items ?? []).filter((item) => item.module !== module), saved] }));
  },

  savePanelTree: async (projectId, module, tree) => {
    const saved = await api.setPanelTree(projectId, module, tree);
    if (get().projectId !== projectId) return;
    set((state) => ({ items: [...(state.items ?? []).filter((item) => item.module !== module), saved] }));
  },

  reset: () => {
    latest++;
    set({ projectId: null, items: null });
  },
}));

/** Sections visibles sur les fiches d'un module ; lues au premier besoin. */
export function useSheetDisplay(projectId: string, module: SheetModule) {
  const mine = useSheetDisplayStore((s) => s.projectId === projectId);
  const items = useSheetDisplayStore((s) => (mine ? s.items : null));
  const fetch = useSheetDisplayStore((s) => s.fetch);

  useEffect(() => {
    if (!mine || items === null) void fetch(projectId);
    // Une seule lecture par projet : `items` passe de null à la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, projectId, fetch]);

  const item = items?.find((entry) => entry.module === module);
  // Arborescence par défaut, y compris tant que le réglage n'est pas lu.
  return { showStory: item?.showStory ?? false, showPlot: item?.showPlot ?? false, panelTree: item?.panelTree ?? true, loaded: items !== null };
}
