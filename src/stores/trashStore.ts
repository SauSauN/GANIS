import { create } from "zustand";
import { api } from "@/lib/api";
import type { TrashItem } from "@/types";
import { errorText } from "@/lib/errors";

/*
 * Contenu de la corbeille du projet ouvert. Relu à l'ouverture de la vue
 * « Corbeille » et après chaque suppression (`invalidate`).
 */

interface TrashState {
  projectId: string | null;
  items: TrashItem[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchTrash: (projectId: string) => Promise<void>;
  /** Une suppression a ajouté une entrée : la liste sera relue. */
  invalidate: (projectId: string) => void;
  remove: (projectId: string, id: string) => void;
  purge: (projectId: string, id: string) => Promise<void>;
  empty: (projectId: string) => Promise<void>;
  reset: () => void;
}

let latest = 0;

export const useTrashStore = create<TrashState>((set, get) => ({
  projectId: null,
  items: [],
  loaded: false,
  loading: false,
  error: null,

  fetchTrash: async (projectId) => {
    const request = ++latest;
    const same = get().projectId === projectId;
    set({ projectId, items: same ? get().items : [], loading: true, error: null, loaded: same && get().loaded });
    try {
      const items = await api.listTrash(projectId);
      if (request !== latest) return;
      set({ items, loaded: true, loading: false });
    } catch (error) {
      if (request !== latest) return;
      set({ loading: false, error: errorText(error, "errors:load.trash") });
    }
  },

  invalidate: (projectId) => {
    if (get().projectId === projectId && get().loaded) void get().fetchTrash(projectId);
  },

  remove: (projectId, id) => {
    if (get().projectId === projectId) set({ items: get().items.filter((item) => item.id !== id) });
  },

  purge: async (projectId, id) => {
    await api.purgeTrash(projectId, id);
    get().remove(projectId, id);
  },

  empty: async (projectId) => {
    await api.emptyTrash(projectId);
    if (get().projectId === projectId) set({ items: [] });
  },

  reset: () => {
    latest++;
    set({ projectId: null, items: [], loaded: false, loading: false, error: null });
  },
}));