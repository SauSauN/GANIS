import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { CharacterLocation, CharacterLocationInput } from "@/types";

/*
 * Liens personnage ↔ lieu du projet ouvert. Comme les autres stores du
 * projet, il sait à quel projet appartiennent ses données et il est vidé
 * en quittant le projet (voir `projectStore`).
 */

interface PlaceLinkState {
  projectId: string | null;
  links: CharacterLocation[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchLinks: (projectId: string) => Promise<void>;
  createLink: (projectId: string, input: CharacterLocationInput) => Promise<CharacterLocation>;
  updateLink: (projectId: string, id: string, input: CharacterLocationInput) => Promise<CharacterLocation>;
  deleteLink: (projectId: string, id: string) => Promise<void>;
  /** Le personnage ou le lieu a été supprimé : Rust a supprimé ses liens. */
  forget: (projectId: string, side: "character" | "location", id: string) => void;
  reset: () => void;
}

let latestFetch = 0;

export const usePlaceLinkStore = create<PlaceLinkState>((set, get) => {
  function upsert(projectId: string, link: CharacterLocation) {
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
        const links = await api.listCharacterLocations(projectId);
        if (request !== latestFetch) return;
        set({ links, loaded: true, loading: false });
      } catch (error) {
        if (request !== latestFetch) return;
        set({
          loading: false,
          error: error instanceof ApiError ? error.message : String(error),
        });
      }
    },

    createLink: async (projectId, input) => {
      const created = await api.createCharacterLocation(projectId, input);
      upsert(projectId, created);
      return created;
    },

    updateLink: async (projectId, id, input) => {
      const saved = await api.updateCharacterLocation(projectId, id, input);
      upsert(projectId, saved);
      return saved;
    },

    deleteLink: async (projectId, id) => {
      await api.deleteCharacterLocation(projectId, id);
      if (get().projectId !== projectId) return;
      set({ links: get().links.filter((item) => item.id !== id) });
    },

    forget: (projectId, side, id) => {
      if (get().projectId !== projectId) return;
      set({
        links: get().links.filter((link) => (side === "character" ? link.characterId : link.locationId) !== id),
      });
    },

    reset: () => {
      latestFetch++;
      set({ projectId: null, links: [], loaded: false, loading: false, error: null });
    },
  };
});

const EMPTY: CharacterLocation[] = [];

/** Liens d'un projet ; chargés au premier besoin. */
export function useProjectPlaceLinks(projectId: string) {
  const mine = usePlaceLinkStore((state) => state.projectId === projectId);
  const links = usePlaceLinkStore((state) => (mine ? state.links : EMPTY));
  const loaded = usePlaceLinkStore((state) => mine && state.loaded);
  const loading = usePlaceLinkStore((state) => mine && state.loading);
  const error = usePlaceLinkStore((state) => (mine ? state.error : null));
  const fetchLinks = usePlaceLinkStore((state) => state.fetchLinks);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchLinks(projectId);
  }, [needsFetch, fetchLinks, projectId]);

  return { links, loaded, error, reload: () => fetchLinks(projectId) };
}
