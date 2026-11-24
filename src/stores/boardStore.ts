import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { normalizeBoard, type BoardData } from "@/lib/boards";
import { errorText } from "@/lib/errors";
import { onSessionEnd } from "@/lib/sessionCache";
import { toast } from "@/stores/toastStore";

/*
 * Planches d'inspiration du projet ouvert (voir `lib/boards.ts`). Les
 * éléments d'une planche sont enregistrés 600 ms après le dernier geste ;
 * `flush` envoie tout de suite ce qui attend.
 */

const SAVE_DELAY = 600;

export interface BoardEntry {
  id: string;
  name: string;
  data: BoardData;
  /** Dernière modification (RFC 3339). */
  updatedAt: string;
}

interface BoardState {
  projectId: string | null;
  boards: BoardEntry[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: (projectId: string) => Promise<void>;
  create: (projectId: string, name: string) => Promise<BoardEntry>;
  rename: (projectId: string, id: string, name: string) => Promise<void>;
  /** Copie d'une planche (mêmes éléments), placée à la fin de la liste. */
  duplicate: (projectId: string, id: string, name: string) => Promise<BoardEntry>;
  remove: (projectId: string, id: string) => Promise<void>;
  update: (projectId: string, id: string, fn: (data: BoardData) => void) => void;
  flush: () => Promise<void>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let requestId = 0;

function parse(data: string): BoardData {
  try {
    return normalizeBoard(data ? JSON.parse(data) : {});
  } catch {
    return normalizeBoard({});
  }
}

async function send(projectId: string, id: string, data: BoardData) {
  try {
    await api.saveBoardItems(projectId, id, JSON.stringify(data));
  } catch (error) {
    toast({ message: errorText(error, "workspaceHome:boards.saveFailed"), tone: "error" });
  }
}


export const useBoardStore = create<BoardState>((set, get) => ({
  projectId: null,
  boards: [],

  loaded: false,
  loading: false,
  error: null,

  load: async (projectId) => {
    const state = get();
    if (state.projectId === projectId && (state.loaded || state.loading)) return;
    await get().flush();
    const id = ++requestId;
    set({ projectId, boards: [], loaded: false, loading: true, error: null });
    try {
      const rows = await api.listBoards(projectId);
      if (id !== requestId) return;
      set({ boards: rows.map((row) => ({ id: row.id, name: row.name, data: parse(row.data), updatedAt: row.updatedAt })), loaded: true, loading: false });
    } catch (error) {
      if (id !== requestId) return;
      set({ loading: false, error: errorText(error, "workspaceHome:boards.loadFailed") });
    }
  },

  create: async (projectId, name) => {
    const row = await api.createBoard(projectId, name);
    const entry = { id: row.id, name: row.name, data: parse(row.data), updatedAt: row.updatedAt };
    if (get().projectId === projectId) set({ boards: [...get().boards, entry] });
    return entry;
  },

  duplicate: async (projectId, id, name) => {
    const source = get().boards.find((b) => b.id === id);
    const row = await api.createBoard(projectId, name);
    const data = source ? structuredClone(source.data) : parse("");
    const updatedAt = source ? await api.saveBoardItems(projectId, row.id, JSON.stringify(data)) : row.updatedAt;
    const entry = { id: row.id, name: row.name, data, updatedAt };
    if (get().projectId === projectId) set({ boards: [...get().boards, entry] });
    return entry;
  },

  rename: async (projectId, id, name) => {
    const row = await api.renameBoard(projectId, id, name);
    if (get().projectId === projectId) set({ boards: get().boards.map((b) => (b.id === id ? { ...b, name: row.name, updatedAt: row.updatedAt } : b)) });
  },

  remove: async (projectId, id) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    await api.deleteBoard(projectId, id);
    if (get().projectId === projectId) set({ boards: get().boards.filter((b) => b.id !== id) });
  },

  update: (projectId, id, fn) => {
    const state = get();
    if (state.projectId !== projectId) return;
    const board = state.boards.find((b) => b.id === id);
    if (!board) return;
    const draft = structuredClone(board.data);
    fn(draft);
    set({ boards: state.boards.map((b) => (b.id === id ? { ...b, data: draft, updatedAt: new Date().toISOString() } : b)) });

    const pending = timers.get(id);
    if (pending) clearTimeout(pending);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const current = get().boards.find((b) => b.id === id);
        if (current) void send(projectId, id, current.data);
      }, SAVE_DELAY),
    );
  },

  flush: async () => {
    const { projectId, boards } = get();
    const waiting = [...timers.keys()];
    for (const id of waiting) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    if (!projectId) return;
    await Promise.all(
      waiting.map((id) => {
        const board = boards.find((b) => b.id === id);
        return board ? send(projectId, id, board.data) : undefined;
      }),
    );
  },
}));

// Fin de session : plus rien de ce projet en mémoire.
onSessionEnd(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  useBoardStore.setState(useBoardStore.getInitialState(), true);
});

/** Planches du projet, chargées au premier besoin. */
export function useProjectBoards(projectId: string) {
  const boards = useBoardStore((s) => (s.projectId === projectId ? s.boards : null));
  const loaded = useBoardStore((s) => s.projectId === projectId && s.loaded);
  const error = useBoardStore((s) => (s.projectId === projectId ? s.error : null));
  const load = useBoardStore((s) => s.load);

  useEffect(() => {
    void load(projectId);
  }, [load, projectId]);

  useEffect(() => () => void useBoardStore.getState().flush(), []);

  return { boards: boards ?? EMPTY, loaded, error };
}


const EMPTY: BoardEntry[] = [];
