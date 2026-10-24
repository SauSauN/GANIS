import i18n from "@/i18n";
import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { announceDeletion } from "@/lib/trash";
import { useCharacterStore } from "@/stores/characterStore";
import { useWorldLinkStore } from "@/stores/worldLinkStore";
import type {
  Character,
  CharacterDetailLevel,
  CustomLocationType,
  SpeciesNature,
  WorldEntry,
  WorldEntryInput,
  WorldModule,
  WorldSettings,
} from "@/types";

/*
 * Objets, faune et flore du projet ouvert : une « tranche » par module
 * (`item`, `species`), chacune avec ses fiches et ses réglages (activé,
 * catégories choisies, types ajoutés, statuts, niveau de détail).
 *
 * Comme les autres stores du projet, chaque tranche sait à quel projet
 * appartiennent ses données ; elle est vidée en quittant le projet et à la
 * déconnexion (voir `projectStore`). Les images principales sont chargées
 * à la demande, identifiées par leur date.
 */

interface PortraitEntry {
  version: string;
  url: string | null;
}

/** Préremplissage du formulaire de création (« Ajouter ici »). */
export interface WorldCreatePreset {
  parentId: string | null;
  type?: string;
  nature?: SpeciesNature;
}

interface Slice {
  projectId: string | null;
  entries: WorldEntry[];
  settings: WorldSettings;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  portraits: Record<string, PortraitEntry>;
  createPreset: WorldCreatePreset | null;
}

type CustomTypeInput = Omit<CustomLocationType, "id"> & { id?: string };

interface WorldState {
  item: Slice;
  species: Slice;

  fetchEntries: (projectId: string, module: WorldModule) => Promise<void>;
  createEntry: (projectId: string, module: WorldModule, input: WorldEntryInput) => Promise<WorldEntry>;
  updateEntry: (projectId: string, module: WorldModule, id: string, input: WorldEntryInput) => Promise<WorldEntry>;
  deleteEntry: (projectId: string, module: WorldModule, id: string) => Promise<void>;

  setEnabled: (projectId: string, module: WorldModule, enabled: boolean) => Promise<void>;
  setCategories: (projectId: string, module: WorldModule, categories: string[]) => Promise<void>;
  setCustomTypes: (projectId: string, module: WorldModule, types: CustomTypeInput[]) => Promise<void>;
  setStatusList: (projectId: string, module: WorldModule, values: string[] | null) => Promise<void>;
  setDetailLevel: (projectId: string, module: WorldModule, level: CharacterDetailLevel) => Promise<void>;

  setPortrait: (projectId: string, module: WorldModule, id: string, data: string) => Promise<WorldEntry>;
  removePortrait: (projectId: string, module: WorldModule, id: string) => Promise<WorldEntry>;
  loadPortrait: (projectId: string, module: WorldModule, entry: WorldEntry) => Promise<void>;
  adjustGalleryCount: (projectId: string, module: WorldModule, id: string, delta: number) => void;

  /** Animal précis ↔ fiche de personnage (`null` : retire le lien). */
  setCharacter: (projectId: string, id: string, characterId: string | null) => Promise<WorldEntry>;
  /** Crée la fiche de personnage d'un animal précis. */
  createCharacter: (projectId: string, id: string) => Promise<Character>;
  /** Un personnage a été supprimé : l'animal qui l'était redevient un animal tout court. */
  forgetCharacter: (projectId: string, characterId: string) => void;

  setCreatePreset: (module: WorldModule, preset: WorldCreatePreset | null) => void;
  reset: () => void;
}

export const EMPTY_WORLD_SETTINGS: WorldSettings = {
  enabled: false,
  categories: [],
  detailLevel: null,
  customTypes: [],
  lists: {},
};

const emptySlice = (): Slice => ({
  projectId: null,
  entries: [],
  settings: EMPTY_WORLD_SETTINGS,
  loaded: false,
  loading: false,
  error: null,
  portraits: {},
  createPreset: null,
});

const latestFetch: Record<WorldModule, number> = { item: 0, species: 0 };
const loadingPortraits = new Set<string>();

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

function sortByName(list: WorldEntry[]): WorldEntry[] {
  return [...list].sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.createdAt.localeCompare(b.createdAt),
  );
}

export const useWorldStore = create<WorldState>((set, get) => {
  /** Modifie la tranche d'un module, si elle appartient bien à ce projet. */
  function patch(module: WorldModule, projectId: string, change: (slice: Slice) => Partial<Slice>) {
    const slice = get()[module];
    if (slice.projectId !== projectId) return;
    set({ [module]: { ...slice, ...change(slice) } } as Pick<WorldState, typeof module>);
  }

  function upsert(projectId: string, module: WorldModule, entry: WorldEntry) {
    patch(module, projectId, (slice) => ({
      entries: sortByName([...slice.entries.filter((item) => item.id !== entry.id), entry]),
    }));
  }

  function setSettings(projectId: string, module: WorldModule, settings: WorldSettings) {
    patch(module, projectId, () => ({ settings }));
  }

  return {
    item: emptySlice(),
    species: emptySlice(),

    fetchEntries: async (projectId, module) => {
      const request = ++latestFetch[module];
      const current = get()[module];
      const sameProject = current.projectId === projectId;

      set({
        [module]: {
          ...(sameProject ? current : emptySlice()),
          projectId,
          loaded: sameProject && current.loaded,
          loading: true,
          error: null,
        },
      } as Pick<WorldState, typeof module>);

      try {
        const [entries, settings] = await Promise.all([
          api.listWorldEntries(projectId, module),
          api.getWorldSettings(projectId, module),
        ]);
        if (request !== latestFetch[module]) return;
        patch(module, projectId, () => ({ entries, settings, loaded: true, loading: false }));
      } catch (error) {
        if (request !== latestFetch[module]) return;
        patch(module, projectId, () => ({ loading: false, error: messageOf(error, i18n.t("errors:load.world")) }));
      }
    },

    createEntry: async (projectId, module, input) => {
      const created = await api.createWorldEntry(projectId, module, input);
      upsert(projectId, module, created);
      return created;
    },

    updateEntry: async (projectId, module, id, input) => {
      const saved = await api.updateWorldEntry(projectId, module, id, input);
      upsert(projectId, module, saved);
      return saved;
    },

    deleteEntry: async (projectId, module, id) => {
      const before = get()[module].entries.find((item) => item.id === id);
      const trashId = await api.deleteWorldEntry(projectId, module, id);
      announceDeletion(projectId, trashId, module, before?.name ?? "");

      // Rust a supprimé ses liens (corbeille).
      useWorldLinkStore.getState().forget(projectId, id);

      // Comme Rust : ce qu'il contenait remonte d'un niveau.
      patch(module, projectId, (slice) => {
        const portraits = { ...slice.portraits };
        delete portraits[id];
        return {
          entries: slice.entries
            .filter((item) => item.id !== id)
            .map((item) => (item.parentId === id ? { ...item, parentId: before?.parentId ?? null } : item)),
          portraits,
        };
      });
    },

    setEnabled: async (projectId, module, enabled) => {
      setSettings(projectId, module, await api.setWorldEnabled(projectId, module, enabled));
    },

    setCategories: async (projectId, module, categories) => {
      setSettings(projectId, module, await api.setWorldCategories(projectId, module, categories));
    },

    setCustomTypes: async (projectId, module, types) => {
      setSettings(projectId, module, await api.setWorldCustomTypes(projectId, module, types));
    },

    setStatusList: async (projectId, module, values) => {
      setSettings(projectId, module, await api.setWorldList(projectId, module, "status", values));
    },

    setDetailLevel: async (projectId, module, level) => {
      setSettings(projectId, module, await api.setWorldDetailLevel(projectId, module, level));
    },

    setPortrait: async (projectId, module, id, data) => {
      const saved = await api.setWorldEntryPortrait(projectId, module, id, data);
      upsert(projectId, module, saved);
      return saved;
    },

    removePortrait: async (projectId, module, id) => {
      const saved = await api.removeWorldEntryPortrait(projectId, module, id);
      upsert(projectId, module, saved);
      return saved;
    },

    loadPortrait: async (projectId, module, entry) => {
      const version = entry.portraitUpdatedAt;
      if (!version || get()[module].portraits[entry.id]?.version === version) return;

      const key = `${projectId}/${module}/${entry.id}@${version}`;
      if (loadingPortraits.has(key)) return;
      loadingPortraits.add(key);

      try {
        const portrait = await api.getWorldEntryPortrait(projectId, module, entry.id);
        patch(module, projectId, (slice) => ({
          portraits: {
            ...slice.portraits,
            [entry.id]: { version, url: portrait ? `data:${portrait.mime};base64,${portrait.data}` : null },
          },
        }));
      } catch {
        patch(module, projectId, (slice) => ({ portraits: { ...slice.portraits, [entry.id]: { version, url: null } } }));
      } finally {
        loadingPortraits.delete(key);
      }
    },

    adjustGalleryCount: (projectId, module, id, delta) => {
      patch(module, projectId, (slice) => ({
        entries: slice.entries.map((item) =>
          item.id === id ? { ...item, galleryCount: Math.max(0, item.galleryCount + delta) } : item,
        ),
      }));
    },

    setCharacter: async (projectId, id, characterId) => {
      const saved = await api.setSpeciesCharacter(projectId, id, characterId);
      upsert(projectId, "species", saved);
      return saved;
    },

    createCharacter: async (projectId, id) => {
      const { entry, character } = await api.createSpeciesCharacter(projectId, id);
      upsert(projectId, "species", entry);

      const characters = useCharacterStore.getState();
      if (characters.projectId === projectId) await characters.fetchCharacters(projectId);

      return character;
    },

    forgetCharacter: (projectId, characterId) => {
      patch("species", projectId, (slice) => ({
        entries: slice.entries.map((item) => (item.characterId === characterId ? { ...item, characterId: null } : item)),
      }));
    },

    setCreatePreset: (module, preset) => set({ [module]: { ...get()[module], createPreset: preset } } as Pick<WorldState, typeof module>),

    reset: () => {
      latestFetch.item++;
      latestFetch.species++;
      loadingPortraits.clear();
      set({ item: emptySlice(), species: emptySlice() });
    },
  };
});

const EMPTY: WorldEntry[] = [];

/**
 * Fiches et réglages d'un module pour un projet ; chargés au premier
 * besoin. Si le store contient un autre projet, l'état renvoyé est vide.
 */
export function useWorldEntries(projectId: string, module: WorldModule) {
  const mine = useWorldStore((state) => state[module].projectId === projectId);
  const entries = useWorldStore((state) => (mine ? state[module].entries : EMPTY));
  const settings = useWorldStore((state) => (mine ? state[module].settings : EMPTY_WORLD_SETTINGS));
  const loaded = useWorldStore((state) => mine && state[module].loaded);
  const loading = useWorldStore((state) => mine && state[module].loading);
  const error = useWorldStore((state) => (mine ? state[module].error : null));
  const fetchEntries = useWorldStore((state) => state.fetchEntries);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchEntries(projectId, module);
  }, [needsFetch, fetchEntries, projectId, module]);

  return { entries, settings, loaded, loading, error, reload: () => fetchEntries(projectId, module) };
}

/**
 * Modules activés pour ce projet (barre de gauche) ; faux tant qu'ils ne
 * sont pas lus (`loaded` dit quand les deux réglages le sont).
 */
export function useEnabledWorldModules(projectId: string): Record<WorldModule, boolean> & { loaded: boolean } {
  const item = useWorldEntries(projectId, "item");
  const species = useWorldEntries(projectId, "species");
  return {
    item: item.loaded && item.settings.enabled,
    species: species.loaded && species.settings.enabled,
    loaded: item.loaded && species.loaded,
  };
}

export function useWorldEntry(projectId: string, module: WorldModule, id: string): WorldEntry | undefined {
  return useWorldStore((state) =>
    state[module].projectId === projectId ? state[module].entries.find((item) => item.id === id) : undefined,
  );
}

/** Image principale d'une fiche (`data:`), chargée à la demande. */
export function useWorldImageUrl(projectId: string, module: WorldModule, entry: WorldEntry | undefined): string | null {
  const loadPortrait = useWorldStore((state) => state.loadPortrait);
  const version = entry?.portraitUpdatedAt ?? null;

  const url = useWorldStore((state) => {
    if (!entry || !version || state[module].projectId !== projectId) return null;
    const cached = state[module].portraits[entry.id];
    return cached && cached.version === version ? cached.url : null;
  });

  useEffect(() => {
    if (entry && version) void loadPortrait(projectId, module, entry);
    // Seule l'image compte ici, pas le reste de la fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, module, entry?.id, version, loadPortrait]);

  return url;
}
