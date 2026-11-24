import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { EMPTY_FILM } from "@/lib/series";
import type { FilmDetails, SceneBlock, SceneBreakdown, SceneBreakdownRow } from "@/types";
import { onSessionEnd } from "@/lib/sessionCache";

/*
 * Scénario de série ou de film du projet ouvert : tous les éléments des scènes (pour
 * la lecture, l'export et le suivi). Relus quand une scène est enregistrée
 * (voir `notifySeriesScriptChanged`).
 */

const EVENT = "ganis:series-script-changed";

export function notifySeriesScriptChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: projectId }));
}

/** Écoute les changements d'un projet ; renvoie la fonction pour arrêter. */
export function onSeriesScriptChanged(projectId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<string>).detail === projectId) listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

interface SeriesState {
  projectId: string | null;
  blocks: SceneBlock[] | null;
  error: string | null;
  fetchBlocks: (projectId: string) => Promise<void>;
  /** Fiche du film (projets de type « Film »). */
  filmProjectId: string | null;
  film: FilmDetails | null;
  fetchFilm: (projectId: string) => Promise<void>;
  saveFilm: (projectId: string, details: FilmDetails) => Promise<FilmDetails>;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  projectId: null,
  blocks: null,
  error: null,

  fetchBlocks: async (projectId) => {
    if (get().projectId !== projectId) set({ projectId, blocks: null, error: null });
    try {
      const blocks = await api.getSeriesBlocks(projectId);
      if (get().projectId === projectId) set({ blocks, error: null });
    } catch (e) {
      if (get().projectId === projectId) set({ error: errorText(e, "errors:load.series") });
    }
  },

  filmProjectId: null,
  film: null,

  fetchFilm: async (projectId) => {
    if (get().filmProjectId !== projectId) set({ filmProjectId: projectId, film: null });
    try {
      const film = await api.getFilmDetails(projectId);
      if (get().filmProjectId === projectId) set({ film });
    } catch {
      // Fiche illisible : le film reste utilisable sans elle (vide).
      if (get().filmProjectId === projectId) set({ film: EMPTY_FILM });
    }
  },

  saveFilm: async (projectId, details) => {
    const film = await api.setFilmDetails(projectId, details);
    if (get().filmProjectId === projectId) set({ film });
    return film;
  },
}));

/** Fiche du film entier (logline, durée visée, scénariste), si `enabled`. */
export function useFilmDetails(projectId: string, enabled = true) {
  const film = useSeriesStore((s) => (enabled && s.filmProjectId === projectId ? s.film : null));
  const fetchFilm = useSeriesStore((s) => s.fetchFilm);
  const saveFilm = useSeriesStore((s) => s.saveFilm);
  useEffect(() => {
    if (enabled) void fetchFilm(projectId);
  }, [enabled, projectId, fetchFilm]);
  const save = useCallback((details: FilmDetails) => saveFilm(projectId, details), [saveFilm, projectId]);
  return { film, save };
}

/** Tout le scénario du projet, relu quand une scène change (si `enabled`). */
export function useSeriesBlocks(projectId: string, enabled = true) {
  const blocks = useSeriesStore((s) => (enabled && s.projectId === projectId ? s.blocks : null));
  const error = useSeriesStore((s) => (enabled && s.projectId === projectId ? s.error : null));
  const fetchBlocks = useSeriesStore((s) => s.fetchBlocks);
  const reload = useCallback(() => void fetchBlocks(projectId), [fetchBlocks, projectId]);
  useEffect(() => {
    if (!enabled) return;
    reload();
    return onSeriesScriptChanged(projectId, reload);
  }, [enabled, projectId, reload]);
  return { blocks, error, reload };
}

// ----------------------------------------------------------------------------
// Dépouillement des scènes (film)
// ----------------------------------------------------------------------------

interface BreakdownState {
  projectId: string | null;
  rows: Map<string, SceneBreakdown> | null;
  fetch: (projectId: string) => Promise<void>;
  save: (projectId: string, sceneId: string, breakdown: SceneBreakdown) => Promise<void>;
}

const toMap = (rows: SceneBreakdownRow[]) => new Map(rows.map((row) => [row.sceneId, row.breakdown]));

export const useBreakdownStore = create<BreakdownState>((set, get) => ({
  projectId: null,
  rows: null,

  fetch: async (projectId) => {
    if (get().projectId !== projectId) set({ projectId, rows: null });
    try {
      const rows = await api.getSceneBreakdowns(projectId);
      if (get().projectId === projectId) set({ rows: toMap(rows) });
    } catch {
      if (get().projectId === projectId) set({ rows: new Map() });
    }
  },

  save: async (projectId, sceneId, breakdown) => {
    const saved = await api.setSceneBreakdown(projectId, sceneId, breakdown);
    if (get().projectId !== projectId) return;
    const rows = new Map(get().rows ?? []);
    if (Object.values(saved).some((value) => value.trim())) rows.set(sceneId, saved);
    else rows.delete(sceneId);
    set({ rows });
  },
}));

/** Dépouillement de toutes les scènes du projet (si `enabled`). */
export function useSceneBreakdowns(projectId: string, enabled = true) {
  const rows = useBreakdownStore((s) => (enabled && s.projectId === projectId ? s.rows : null));
  const fetch = useBreakdownStore((s) => s.fetch);
  const saveRow = useBreakdownStore((s) => s.save);
  useEffect(() => {
    if (enabled) void fetch(projectId);
  }, [enabled, projectId, fetch]);
  const save = useCallback((sceneId: string, breakdown: SceneBreakdown) => saveRow(projectId, sceneId, breakdown), [saveRow, projectId]);
  return { breakdowns: rows, save };
}

// Fin de session (déconnexion, autre compte) : plus rien de ce projet en mémoire.
onSessionEnd(() => useSeriesStore.setState(useSeriesStore.getInitialState(), true));
onSessionEnd(() => useBreakdownStore.setState(useBreakdownStore.getInitialState(), true));
