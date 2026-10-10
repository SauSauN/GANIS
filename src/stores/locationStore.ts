import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { useCharacterStore } from "@/stores/characterStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import type {
  CustomLocationType,
  Location,
  LocationInput,
  LocationSettings,
} from "@/types";

/*
 * Lieux du projet ouvert et leurs réglages (types ajoutés, statuts).
 *
 * Comme pour les personnages, le store sait à quel projet appartiennent
 * ses données : un composant ne voit que les lieux de SON projet (voir
 * `useProjectLocations`). Il est vidé en quittant le projet et à la
 * déconnexion (voir `projectStore`).
 *
 * Les images principales sont chargées à la demande et gardées en mémoire
 * tant que le projet est ouvert, identifiées par leur date.
 */

interface PortraitEntry {
  version: string;
  url: string | null;
}

/** Préremplissage du formulaire de création (« Ajouter un lieu dans… »). */
export interface CreatePreset {
  parentId: string | null;
  type?: string;
}

interface LocationState {
  projectId: string | null;
  locations: Location[];
  settings: LocationSettings;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  portraits: Record<string, PortraitEntry>;
  /** Préremplissage demandé pour le prochain formulaire de création. */
  createPreset: CreatePreset | null;

  fetchLocations: (projectId: string) => Promise<void>;
  createLocation: (projectId: string, input: LocationInput) => Promise<Location>;
  updateLocation: (projectId: string, id: string, input: LocationInput) => Promise<Location>;
  deleteLocation: (projectId: string, id: string) => Promise<void>;

  setCustomTypes: (
    projectId: string,
    types: Array<Omit<CustomLocationType, "id"> & { id?: string }>,
  ) => Promise<LocationSettings>;
  setStatusList: (projectId: string, values: string[] | null) => Promise<void>;

  setPortrait: (projectId: string, id: string, data: string) => Promise<Location>;
  removePortrait: (projectId: string, id: string) => Promise<Location>;
  loadPortrait: (projectId: string, location: Location) => Promise<void>;
  adjustGalleryCount: (projectId: string, id: string, delta: number) => void;

  setCreatePreset: (preset: CreatePreset | null) => void;
  reset: () => void;
}

const EMPTY_SETTINGS: LocationSettings = { customTypes: [], lists: {} };

let latestFetch = 0;
const loadingPortraits = new Set<string>();

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

function sortByName(list: Location[]): Location[] {
  return [...list].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export const useLocationStore = create<LocationState>((set, get) => {
  function upsert(projectId: string, location: Location) {
    if (get().projectId !== projectId) return;

    const others = get().locations.filter((item) => item.id !== location.id);
    set({ locations: sortByName([...others, location]) });
  }

  return {
    projectId: null,
    locations: [],
    settings: EMPTY_SETTINGS,
    loaded: false,
    loading: false,
    error: null,
    portraits: {},
    createPreset: null,

    fetchLocations: async (projectId) => {
      const request = ++latestFetch;
      const sameProject = get().projectId === projectId;

      set({
        projectId,
        locations: sameProject ? get().locations : [],
        settings: sameProject ? get().settings : EMPTY_SETTINGS,
        portraits: sameProject ? get().portraits : {},
        createPreset: sameProject ? get().createPreset : null,
        loaded: sameProject && get().loaded,
        loading: true,
        error: null,
      });

      try {
        const [locations, settings] = await Promise.all([
          api.listLocations(projectId),
          api.getLocationSettings(projectId),
        ]);

        if (request !== latestFetch) return;

        set({ locations, settings, loaded: true, loading: false });
      } catch (error) {
        if (request !== latestFetch) return;

        set({ loading: false, error: messageOf(error, "Impossible de charger les lieux.") });
      }
    },

    createLocation: async (projectId, input) => {
      const created = await api.createLocation(projectId, input);
      upsert(projectId, created);
      return created;
    },

    updateLocation: async (projectId, id, input) => {
      const saved = await api.updateLocation(projectId, id, input);
      upsert(projectId, saved);
      return saved;
    },

    deleteLocation: async (projectId, id) => {
      await api.deleteLocation(projectId, id);

      // Rust a supprimé ses liens avec des personnages, et remplacé
      // l'« Origine » qui le désignait par son nom : relue.
      usePlaceLinkStore.getState().forget(projectId, "location", id);

      const characters = useCharacterStore.getState();
      if (characters.projectId === projectId && characters.loaded) {
        void characters.fetchCharacters(projectId);
      }

      if (get().projectId !== projectId) return;

      // Comme Rust : les lieux contenus remontent d'un niveau.
      const deleted = get().locations.find((item) => item.id === id);
      const portraits = { ...get().portraits };
      delete portraits[id];

      set({
        locations: get()
          .locations.filter((item) => item.id !== id)
          .map((item) =>
            item.parentId === id ? { ...item, parentId: deleted?.parentId ?? null } : item,
          ),
        portraits,
      });
    },

    setCustomTypes: async (projectId, types) => {
      const settings = await api.setLocationCustomTypes(projectId, types);
      if (get().projectId === projectId) set({ settings });
      return settings;
    },

    setStatusList: async (projectId, values) => {
      const settings = await api.setLocationList(projectId, "status", values);
      if (get().projectId === projectId) set({ settings });
    },

    setPortrait: async (projectId, id, data) => {
      const saved = await api.setLocationPortrait(projectId, id, data);
      upsert(projectId, saved);
      return saved;
    },

    removePortrait: async (projectId, id) => {
      const saved = await api.removeLocationPortrait(projectId, id);
      upsert(projectId, saved);
      return saved;
    },

    loadPortrait: async (projectId, location) => {
      const version = location.portraitUpdatedAt;

      if (!version || get().portraits[location.id]?.version === version) return;

      const key = `${projectId}/${location.id}@${version}`;
      if (loadingPortraits.has(key)) return;
      loadingPortraits.add(key);

      try {
        const portrait = await api.getLocationPortrait(projectId, location.id);
        if (get().projectId !== projectId) return;

        set({
          portraits: {
            ...get().portraits,
            [location.id]: {
              version,
              url: portrait ? `data:${portrait.mime};base64,${portrait.data}` : null,
            },
          },
        });
      } catch {
        if (get().projectId !== projectId) return;
        set({ portraits: { ...get().portraits, [location.id]: { version, url: null } } });
      } finally {
        loadingPortraits.delete(key);
      }
    },

    adjustGalleryCount: (projectId, id, delta) => {
      if (get().projectId !== projectId) return;

      set({
        locations: get().locations.map((item) =>
          item.id === id ? { ...item, galleryCount: Math.max(0, item.galleryCount + delta) } : item,
        ),
      });
    },

    setCreatePreset: (preset) => set({ createPreset: preset }),

    reset: () => {
      latestFetch++;
      loadingPortraits.clear();

      set({
        projectId: null,
        locations: [],
        settings: EMPTY_SETTINGS,
        loaded: false,
        loading: false,
        error: null,
        portraits: {},
        createPreset: null,
      });
    },
  };
});

const EMPTY: Location[] = [];

/**
 * Lieux d'un projet ; la liste est chargée au premier besoin.
 * Si le store contient un autre projet, l'état renvoyé est vide.
 */
export function useProjectLocations(projectId: string) {
  const mine = useLocationStore((state) => state.projectId === projectId);
  const locations = useLocationStore((state) => (mine ? state.locations : EMPTY));
  const settings = useLocationStore((state) => (mine ? state.settings : EMPTY_SETTINGS));
  const loaded = useLocationStore((state) => mine && state.loaded);
  const loading = useLocationStore((state) => mine && state.loading);
  const error = useLocationStore((state) => (mine ? state.error : null));
  const fetchLocations = useLocationStore((state) => state.fetchLocations);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) {
      void fetchLocations(projectId);
    }
  }, [needsFetch, fetchLocations, projectId]);

  return {
    locations,
    settings,
    loaded,
    loading,
    error,
    reload: () => fetchLocations(projectId),
  };
}

/** Lieu d'un projet par son identifiant (`undefined` s'il n'est pas chargé). */
export function useProjectLocation(projectId: string, id: string): Location | undefined {
  return useLocationStore((state) =>
    state.projectId === projectId ? state.locations.find((item) => item.id === id) : undefined,
  );
}

/** Image principale d'un lieu (`data:`), chargée à la demande. */
export function useLocationImageUrl(projectId: string, location: Location | undefined): string | null {
  const loadPortrait = useLocationStore((state) => state.loadPortrait);
  const version = location?.portraitUpdatedAt ?? null;

  const url = useLocationStore((state) => {
    if (!location || !version || state.projectId !== projectId) return null;

    const entry = state.portraits[location.id];
    return entry && entry.version === version ? entry.url : null;
  });

  useEffect(() => {
    if (location && version) {
      void loadPortrait(projectId, location);
    }
    // Seule l'image compte ici, pas le reste de la fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, location?.id, version, loadPortrait]);

  return url;
}
