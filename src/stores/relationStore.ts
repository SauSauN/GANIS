import { useEffect } from "react";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { GraphPosition, Relation, RelationInput } from "@/types";

/*
 * Relations entre les personnages du projet ouvert, et positions de la
 * disposition libre du graphe.
 *
 * Comme les autres stores de projet, il sait à quel projet appartiennent
 * ses données et il est vidé en quittant le projet (voir `projectStore`).
 */

interface RelationState {
  projectId: string | null;
  relations: Relation[];
  positions: Record<string, { x: number; y: number }>;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchRelations: (projectId: string) => Promise<void>;
  createRelation: (projectId: string, input: RelationInput) => Promise<Relation>;
  updateRelation: (projectId: string, id: string, input: RelationInput) => Promise<Relation>;
  deleteRelation: (projectId: string, id: string) => Promise<void>;
  /** Enregistre des positions de la disposition libre. */
  savePositions: (projectId: string, positions: GraphPosition[]) => Promise<void>;
  /** Efface la disposition libre. */
  clearPositions: (projectId: string) => Promise<void>;
  /** Retire les relations d'un personnage supprimé (sans appel à Rust). */
  forgetCharacter: (projectId: string, characterId: string) => void;
  reset: () => void;
}

let latestFetch = 0;

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export const useRelationStore = create<RelationState>((set, get) => {
  const mine = (projectId: string) => get().projectId === projectId;

  return {
    projectId: null,
    relations: [],
    positions: {},
    loaded: false,
    loading: false,
    error: null,

    fetchRelations: async (projectId) => {
      const request = ++latestFetch;
      const same = mine(projectId);

      set({
        projectId,
        relations: same ? get().relations : [],
        positions: same ? get().positions : {},
        loaded: same && get().loaded,
        loading: true,
        error: null,
      });

      try {
        const [relations, positions] = await Promise.all([
          api.listRelations(projectId),
          api.getGraphPositions(projectId),
        ]);

        if (request !== latestFetch) return;

        set({
          relations,
          positions: Object.fromEntries(positions.map((p) => [p.characterId, { x: p.x, y: p.y }])),
          loaded: true,
          loading: false,
        });
      } catch (error) {
        if (request !== latestFetch) return;
        set({ loading: false, error: messageOf(error, "Impossible de charger les relations.") });
      }
    },

    createRelation: async (projectId, input) => {
      const created = await api.createRelation(projectId, input);
      if (mine(projectId)) set({ relations: [...get().relations, created] });
      return created;
    },

    updateRelation: async (projectId, id, input) => {
      const saved = await api.updateRelation(projectId, id, input);
      if (mine(projectId)) {
        set({ relations: get().relations.map((r) => (r.id === id ? saved : r)) });
      }
      return saved;
    },

    deleteRelation: async (projectId, id) => {
      await api.deleteRelation(projectId, id);
      if (mine(projectId)) set({ relations: get().relations.filter((r) => r.id !== id) });
    },

    savePositions: async (projectId, positions) => {
      if (mine(projectId)) {
        const next = { ...get().positions };
        for (const p of positions) next[p.characterId] = { x: p.x, y: p.y };
        set({ positions: next });
      }
      await api.saveGraphPositions(projectId, positions);
    },

    clearPositions: async (projectId) => {
      await api.clearGraphPositions(projectId);
      if (mine(projectId)) set({ positions: {} });
    },

    forgetCharacter: (projectId, characterId) => {
      if (!mine(projectId)) return;

      const positions = { ...get().positions };
      delete positions[characterId];

      set({
        relations: get().relations.filter(
          (r) => r.sourceId !== characterId && r.targetId !== characterId,
        ),
        positions,
      });
    },

    reset: () => {
      latestFetch++;
      set({ projectId: null, relations: [], positions: {}, loaded: false, loading: false, error: null });
    },
  };
});

const EMPTY: Relation[] = [];
const NO_POSITIONS: Record<string, { x: number; y: number }> = {};

/** Relations d'un projet ; chargées au premier besoin. */
export function useProjectRelations(projectId: string) {
  const mine = useRelationStore((state) => state.projectId === projectId);
  const relations = useRelationStore((state) => (mine ? state.relations : EMPTY));
  const positions = useRelationStore((state) => (mine ? state.positions : NO_POSITIONS));
  const loaded = useRelationStore((state) => mine && state.loaded);
  const loading = useRelationStore((state) => mine && state.loading);
  const error = useRelationStore((state) => (mine ? state.error : null));
  const fetchRelations = useRelationStore((state) => state.fetchRelations);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchRelations(projectId);
  }, [needsFetch, fetchRelations, projectId]);

  return { relations, positions, loaded, error, reload: () => fetchRelations(projectId) };
}
