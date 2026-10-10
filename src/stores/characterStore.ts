import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { useLocationStore } from "@/stores/locationStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import { useRelationStore } from "@/stores/relationStore";
import type {
  Character,
  CharacterDetailLevel,
  CharacterInput,
  CharacterListKey,
  CharacterSettings,
} from "@/types";

/*
 * Personnages du projet ouvert, et niveau de détail de leurs fiches
 * (réglé pour tout le projet ; `null` tant qu'il n'a pas été choisi).
 *
 * Comme pour le synopsis, le store sait à quel projet appartiennent ses
 * données (`projectId`) : un composant ne voit que les personnages de SON
 * projet (voir `useProjectCharacters`). Il est vidé en quittant le projet
 * et à la déconnexion (voir `projectStore`).
 *
 * Les photos sont chargées à la demande, une par une, et gardées en mémoire
 * tant que le projet est ouvert. Elles sont identifiées par leur date
 * (`portraitUpdatedAt`) : une nouvelle photo remplace l'ancienne.
 */

interface PortraitEntry {
  /** `portraitUpdatedAt` du personnage au moment du chargement. */
  version: string;
  /** Image (`data:`), ou `null` si le chargement a échoué. */
  url: string | null;
}

interface CharacterState {
  projectId: string | null;
  characters: Character[];
  detailLevel: CharacterDetailLevel | null;
  /** Listes personnalisées du projet (absente : valeurs par défaut). */
  lists: CharacterSettings["lists"];
  /** Vrai une fois la liste et les réglages chargés pour `projectId`. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  portraits: Record<string, PortraitEntry>;

  fetchCharacters: (projectId: string) => Promise<void>;
  /** Choisit le niveau de détail de toutes les fiches du projet. */
  setDetailLevel: (projectId: string, level: CharacterDetailLevel) => Promise<void>;
  /** Met à jour le nombre d'images de la galerie (après ajout ou retrait). */
  adjustGalleryCount: (projectId: string, id: string, delta: number) => void;
  /** Remplace une liste personnalisable (`null` : valeurs par défaut). */
  setList: (projectId: string, list: CharacterListKey, values: string[] | null) => Promise<void>;
  createCharacter: (projectId: string, input: CharacterInput) => Promise<Character>;
  updateCharacter: (projectId: string, id: string, input: CharacterInput) => Promise<Character>;
  deleteCharacter: (projectId: string, id: string) => Promise<void>;

  /** Remplace la photo (`data` : image en base64, voir `preparePortrait`). */
  setPortrait: (projectId: string, id: string, data: string) => Promise<Character>;
  removePortrait: (projectId: string, id: string) => Promise<Character>;
  /** Charge la photo d'un personnage si elle n'est pas déjà en mémoire. */
  loadPortrait: (projectId: string, character: Character) => Promise<void>;

  reset: () => void;
}

/** Numéro du dernier chargement de liste : seule la dernière réponse compte. */
let latestFetch = 0;

/** Photos en cours de chargement (`id@version`) : pas de demande en double. */
const loadingPortraits = new Set<string>();

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

/** Liste triée comme Rust la renvoie : par nom, sans tenir compte de la casse. */
function sortByName(list: Character[]): Character[] {
  return [...list].sort(
    (a, b) =>
      fullName(a).localeCompare(fullName(b), undefined, { sensitivity: "base" }) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export const useCharacterStore = create<CharacterState>((set, get) => {
  /** Remplace (ou ajoute) un personnage, si l'on est toujours sur ce projet. */
  function upsert(projectId: string, character: Character) {
    if (get().projectId !== projectId) return;

    const others = get().characters.filter((item) => item.id !== character.id);
    set({ characters: sortByName([...others, character]) });
  }

  return {
    projectId: null,
    characters: [],
    detailLevel: null,
    lists: {},
    loaded: false,
    loading: false,
    error: null,
    portraits: {},

    fetchCharacters: async (projectId) => {
      const request = ++latestFetch;
      const sameProject = get().projectId === projectId;

      set({
        projectId,
        characters: sameProject ? get().characters : [],
        detailLevel: sameProject ? get().detailLevel : null,
        lists: sameProject ? get().lists : {},
        portraits: sameProject ? get().portraits : {},
        loaded: sameProject && get().loaded,
        loading: true,
        error: null,
      });

      try {
        const [characters, settings] = await Promise.all([
          api.listCharacters(projectId),
          api.getCharacterSettings(projectId),
        ]);

        if (request !== latestFetch) return;

        set({
          characters,
          detailLevel: settings.detailLevel,
          lists: settings.lists,
          loaded: true,
          loading: false,
        });
      } catch (error) {
        if (request !== latestFetch) return;

        set({
          loading: false,
          error: messageOf(error, "Impossible de charger les personnages."),
        });
      }
    },

    setDetailLevel: async (projectId, level) => {
      const settings = await api.setCharacterDetailLevel(projectId, level);

      if (get().projectId === projectId) {
        set({ detailLevel: settings.detailLevel });
      }
    },

    adjustGalleryCount: (projectId, id, delta) => {
      if (get().projectId !== projectId) return;

      set({
        characters: get().characters.map((item) =>
          item.id === id
            ? { ...item, galleryCount: Math.max(0, item.galleryCount + delta) }
            : item,
        ),
      });
    },

    setList: async (projectId, list, values) => {
      const settings = await api.setCharacterList(projectId, list, values);

      if (get().projectId === projectId) {
        set({ lists: settings.lists });
      }
    },

    createCharacter: async (projectId, input) => {
      const created = await api.createCharacter(projectId, input);
      upsert(projectId, created);
      return created;
    },

    updateCharacter: async (projectId, id, input) => {
      const saved = await api.updateCharacter(projectId, id, input);
      upsert(projectId, saved);
      return saved;
    },

    deleteCharacter: async (projectId, id) => {
      await api.deleteCharacter(projectId, id);

      // Rust a supprimé ses relations et ses liens avec des lieux, et vidé
      // les champs de lieux qui le désignaient (« Dirigeant ») : relus.
      useRelationStore.getState().forgetCharacter(projectId, id);
      usePlaceLinkStore.getState().forget(projectId, "character", id);

      const locations = useLocationStore.getState();
      if (locations.projectId === projectId && locations.loaded) {
        void locations.fetchLocations(projectId);
      }

      if (get().projectId !== projectId) return;

      const portraits = { ...get().portraits };
      delete portraits[id];

      set({
        characters: get().characters.filter((item) => item.id !== id),
        portraits,
      });
    },

    setPortrait: async (projectId, id, data) => {
      const saved = await api.setCharacterPortrait(projectId, id, data);
      upsert(projectId, saved);
      return saved;
    },

    removePortrait: async (projectId, id) => {
      const saved = await api.removeCharacterPortrait(projectId, id);
      upsert(projectId, saved);
      return saved;
    },

    loadPortrait: async (projectId, character) => {
      const version = character.portraitUpdatedAt;

      if (!version || get().portraits[character.id]?.version === version) return;

      const key = `${projectId}/${character.id}@${version}`;

      if (loadingPortraits.has(key)) return;

      loadingPortraits.add(key);

      try {
        const portrait = await api.getCharacterPortrait(projectId, character.id);

        if (get().projectId !== projectId) return;

        set({
          portraits: {
            ...get().portraits,
            [character.id]: {
              version,
              url: portrait ? `data:${portrait.mime};base64,${portrait.data}` : null,
            },
          },
        });
      } catch {
        if (get().projectId !== projectId) return;

        // Pas de nouvel essai en boucle : les initiales restent affichées.
        set({ portraits: { ...get().portraits, [character.id]: { version, url: null } } });
      } finally {
        loadingPortraits.delete(key);
      }
    },

    reset: () => {
      latestFetch++;
      loadingPortraits.clear();

      set({
        projectId: null,
        characters: [],
        detailLevel: null,
        lists: {},
        loaded: false,
        loading: false,
        error: null,
        portraits: {},
      });
    },
  };
});

/**
 * Personnages d'un projet ; la liste est chargée au premier besoin.
 * Si le store contient un autre projet, l'état renvoyé est vide.
 */
export function useProjectCharacters(projectId: string) {
  const mine = useCharacterStore((state) => state.projectId === projectId);
  const characters = useCharacterStore((state) => (mine ? state.characters : EMPTY));
  const detailLevel = useCharacterStore((state) => (mine ? state.detailLevel : null));
  const lists = useCharacterStore((state) => (mine ? state.lists : EMPTY_LISTS));
  const loaded = useCharacterStore((state) => mine && state.loaded);
  const loading = useCharacterStore((state) => mine && state.loading);
  const error = useCharacterStore((state) => (mine ? state.error : null));
  const fetchCharacters = useCharacterStore((state) => state.fetchCharacters);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) {
      void fetchCharacters(projectId);
    }
  }, [needsFetch, fetchCharacters, projectId]);

  return {
    characters,
    detailLevel,
    lists,
    loaded,
    loading,
    error,
    reload: () => fetchCharacters(projectId),
  };
}

const EMPTY: Character[] = [];
const EMPTY_LISTS: CharacterSettings["lists"] = {};

/** Personnage d'un projet par son identifiant (`undefined` s'il n'est pas chargé). */
export function useProjectCharacter(projectId: string, id: string): Character | undefined {
  return useCharacterStore((state) =>
    state.projectId === projectId ? state.characters.find((item) => item.id === id) : undefined,
  );
}

/**
 * Photo d'un personnage (`data:`), chargée à la demande.
 * `null` : pas de photo, pas encore chargée, ou illisible.
 */
export function usePortraitUrl(projectId: string, character: Character | undefined): string | null {
  const loadPortrait = useCharacterStore((state) => state.loadPortrait);
  const version = character?.portraitUpdatedAt ?? null;

  const url = useCharacterStore((state) => {
    if (!character || !version || state.projectId !== projectId) return null;

    const entry = state.portraits[character.id];
    return entry && entry.version === version ? entry.url : null;
  });

  useEffect(() => {
    if (character && version) {
      void loadPortrait(projectId, character);
    }
    // `character` change à chaque modification ; seule sa photo compte ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, character?.id, version, loadPortrait]);

  return url;
}