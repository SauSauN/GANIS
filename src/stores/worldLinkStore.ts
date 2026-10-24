import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { announceDeletion, worldLinkLabel } from "@/lib/trash";
import type { WorldLink, WorldLinkInput } from "@/types";

/*
 * Liens entre éléments (objets, espèces, personnages, lieux) du projet
 * ouvert. Vidé en quittant le projet (voir `projectStore`).
 */

interface WorldLinkState {
  projectId: string | null;
  links: WorldLink[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchLinks: (projectId: string) => Promise<void>;
  createLink: (projectId: string, input: WorldLinkInput) => Promise<WorldLink>;
  updateLink: (projectId: string, id: string, input: WorldLinkInput) => Promise<WorldLink>;
  deleteLink: (projectId: string, id: string) => Promise<void>;
  /** Un élément a été supprimé : Rust a supprimé ses liens. */
  forget: (projectId: string, elementId: string) => void;
  reset: () => void;
}

let latestFetch = 0;

export const useWorldLinkStore = create<WorldLinkState>((set, get) => {
  function upsert(projectId: string, link: WorldLink) {
    if (get().projectId !== projectId) return;
    set({ links: [...get().links.filter((item) => item.id !== link.id), link] });
  }

  return {
    projectId: null,
    links: [],
    loaded: false,
    loading: false,
    error: null,

    fetchLinks: async (projectId) => {
      const request = ++latestFetch;
      const sameProject = get().projectId === projectId;

      set({
        projectId,
        links: sameProject ? get().links : [],
        loaded: sameProject && get().loaded,
        loading: true,
        error: null,
      });

      try {
        const links = await api.listWorldLinks(projectId);
        if (request !== latestFetch) return;
        set({ links, loaded: true, loading: false });
      } catch (error) {
        if (request !== latestFetch) return;
        set({ loading: false, error: errorText(error, "errors:load.worldLinks") });
      }
    },

    createLink: async (projectId, input) => {
      const created = await api.createWorldLink(projectId, input);
      upsert(projectId, created);
      return created;
    },

    updateLink: async (projectId, id, input) => {
      const saved = await api.updateWorldLink(projectId, id, input);
      upsert(projectId, saved);
      return saved;
    },

    deleteLink: async (projectId, id) => {
      const before = get().links.find((item) => item.id === id);
      const trashId = await api.deleteWorldLink(projectId, id);
      announceDeletion(projectId, trashId, "worldLink", worldLinkLabel(projectId, before));
      if (get().projectId !== projectId) return;
      set({ links: get().links.filter((item) => item.id !== id) });
    },

    forget: (projectId, elementId) => {
      if (get().projectId !== projectId) return;
      set({ links: get().links.filter((link) => link.sourceId !== elementId && link.targetId !== elementId) });
    },

    reset: () => {
      latestFetch++;
      set({ projectId: null, links: [], loaded: false, loading: false, error: null });
    },
  };
});

const EMPTY: WorldLink[] = [];

/** Liens d'un projet ; chargés au premier besoin. */
export function useProjectWorldLinks(projectId: string) {
  const mine = useWorldLinkStore((state) => state.projectId === projectId);
  const links = useWorldLinkStore((state) => (mine ? state.links : EMPTY));
  const loaded = useWorldLinkStore((state) => mine && state.loaded);
  const loading = useWorldLinkStore((state) => mine && state.loading);
  const error = useWorldLinkStore((state) => (mine ? state.error : null));
  const fetchLinks = useWorldLinkStore((state) => state.fetchLinks);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchLinks(projectId);
  }, [needsFetch, fetchLinks, projectId]);

  return { links, loaded, error, reload: () => fetchLinks(projectId) };
}
