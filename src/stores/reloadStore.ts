import { create } from "zustand";

/*
 * Rechargement d'un onglet après une restauration de version : son écran
 * est recréé (`key`), et relit l'élément depuis les stores fraîchement
 * relus. Évite à chaque écran de savoir se « réhydrater » lui-même.
 */

interface ReloadState {
  counts: Record<string, number>;
  bump: (tabId: string) => void;
}

export const useReloadStore = create<ReloadState>((set, get) => ({
  counts: {},
  bump: (tabId) => set({ counts: { ...get().counts, [tabId]: (get().counts[tabId] ?? 0) + 1 } }),
}));
