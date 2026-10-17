import { useEffect } from "react";
import { create } from "zustand";
import i18n from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { normalizePlot, type PlotData, type PlotSelection } from "@/lib/plot";
import { toast } from "@/stores/toastStore";

/*
 * Trame du projet ouvert (voir `lib/plot.ts`).
 *
 * Chaque geste sur le plateau passe par `mutate` : l'état précédent est
 * gardé pour Annuler / Rétablir (150 gestes), puis la trame entière est
 * enregistrée 600 ms après le dernier geste. Les frappes rapprochées sur
 * un même champ (même `key`) ne comptent que pour un seul geste.
 *
 * Le store est vidé en quittant le projet (après un dernier enregistrement).
 */

const SAVE_DELAY = 600;
const MAX_UNDO = 150;
const MERGE_MS = 1500;

interface PlotState {
  projectId: string | null;
  data: PlotData | null;
  loading: boolean;
  error: string | null;
  undoStack: PlotData[];
  redoStack: PlotData[];
  /** Modifications pas encore envoyées. */
  pending: boolean;
  /** Choix sur le plateau (partagé avec le panneau et la lecture). */
  selection: PlotSelection;
  /** Événement à montrer à l'ouverture du plateau (demandé par un autre onglet). */
  focusRequest: { eventId: string; at: number } | null;

  load: (projectId: string) => Promise<void>;
  mutate: (projectId: string, fn: (draft: PlotData) => void, options?: { key?: string }) => void;
  undo: () => void;
  redo: () => void;
  flush: () => Promise<void>;
  select: (selection: PlotSelection) => void;
  requestFocus: (eventId: string) => void;
  /** Relit la trame (après la restauration d'une version). */
  reload: (projectId: string) => Promise<void>;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastKey: string | null = null;
let lastTime = 0;
let requestId = 0;

const mainName = () => i18n.t("plot:defaults.mainLane");

function clone(data: PlotData): PlotData {
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}

async function send(projectId: string, data: PlotData) {
  try {
    await api.updatePlot(projectId, JSON.stringify(data));
  } catch (error) {
    toast({ message: error instanceof ApiError ? error.message : String(error), tone: "error" });
    throw error;
  }
}

export const usePlotStore = create<PlotState>((set, get) => ({
  projectId: null,
  data: null,
  loading: false,
  error: null,
  undoStack: [],
  redoStack: [],
  pending: false,
  selection: null,
  focusRequest: null,

  load: async (projectId) => {
    const state = get();
    if (state.projectId === projectId && (state.data || state.loading)) return;
    const id = ++requestId;
    set({ projectId, loading: true, error: null, data: null, undoStack: [], redoStack: [], selection: null });
    try {
      const plot = await api.getPlot(projectId);
      if (id !== requestId) return;
      let raw: unknown = {};
      try {
        raw = plot.data ? JSON.parse(plot.data) : {};
      } catch {
        raw = {};
      }
      set({ data: normalizePlot(raw, mainName()), loading: false });
    } catch (error) {
      if (id !== requestId) return;
      set({ loading: false, error: error instanceof ApiError ? error.message : String(error) });
    }
  },

  mutate: (projectId, fn, options = {}) => {
    const state = get();
    if (state.projectId !== projectId || !state.data) return;
    const before = state.data;
    const draft = clone(before);
    fn(draft);

    const now = Date.now();
    const merge = options.key !== undefined && options.key === lastKey && now - lastTime < MERGE_MS;
    lastKey = options.key ?? null;
    lastTime = now;

    set({
      data: draft,
      undoStack: merge ? state.undoStack : [...state.undoStack, before].slice(-MAX_UNDO),
      redoStack: [],
      pending: true,
    });

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY);
  },

  undo: () => {
    const state = get();
    const previous = state.undoStack[state.undoStack.length - 1];
    if (!previous || !state.data || !state.projectId) return;
    lastKey = null;
    set({
      data: previous,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.data],
      pending: true,
    });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY);
  },

  redo: () => {
    const state = get();
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next || !state.data || !state.projectId) return;
    lastKey = null;
    set({
      data: next,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, state.data],
      pending: true,
    });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(), SAVE_DELAY);
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const { projectId, data, pending } = get();
    if (!pending || !projectId || !data) return;
    set({ pending: false });
    try {
      await send(projectId, data);
    } catch {
      // Rien de perdu : la trame reste en mémoire et repartira au prochain geste.
      if (get().projectId === projectId) set({ pending: true });
    }
  },

  select: (selection) => set({ selection }),

  requestFocus: (eventId) => set({ focusRequest: { eventId, at: Date.now() }, selection: { type: "event", id: eventId } }),

  reload: async (projectId) => {
    if (get().projectId !== projectId) return;
    requestId++;
    set({ data: null, loading: false, projectId: null });
    await get().load(projectId);
  },

  reset: () => {
    // Dernier enregistrement de la trame du projet qu'on quitte.
    const { projectId, data, pending } = get();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (pending && projectId && data) void send(projectId, data).catch(() => undefined);
    requestId++;
    lastKey = null;
    set({
      projectId: null,
      data: null,
      loading: false,
      error: null,
      undoStack: [],
      redoStack: [],
      pending: false,
      selection: null,
      focusRequest: null,
    });
  },
}));

/** Trame du projet (chargée à la première demande). */
export function useProjectPlot(projectId: string) {
  const data = usePlotStore((state) => (state.projectId === projectId ? state.data : null));
  const loading = usePlotStore((state) => state.projectId !== projectId || state.loading);
  const error = usePlotStore((state) => (state.projectId === projectId ? state.error : null));
  const load = usePlotStore((state) => state.load);

  useEffect(() => {
    void load(projectId);
  }, [load, projectId]);

  return { data, loading: loading && !data, error };
}
