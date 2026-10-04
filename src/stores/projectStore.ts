import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/types";

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  query: string;
  loading: boolean;
  error: string | null;
  setQuery: (query: string) => void;
  fetchProjects: () => Promise<void>; // utilisé à partir de la Phase 4
  openProject: (id: string) => void;
  closeProject: () => void;
  reset: () => void;
  seedDemo: () => void; // développement uniquement
}

const initial = { projects: [], currentProjectId: null, query: "", loading: false, error: null };

export const useProjectStore = create<ProjectState>((set) => ({
  ...initial,

  setQuery: (query) => set({ query }),

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.listProjects();
      set({ projects, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof ApiError ? e.message : "Chargement impossible." });
    }
  },

  openProject: (id) => set({ currentProjectId: id }),
  closeProject: () => set({ currentProjectId: null }),
  reset: () => set(initial),

  seedDemo: () => {
    if (!import.meta.env.DEV) return;
    const now = new Date().toISOString();
    set({
      projects: [
        {
          id: "demo-1", name: "Les Cendres d'Ysmir", description: "Saga de fantasy en trois tomes.",
          type: "novel", status: "in_progress", isFavorite: true, isArchived: false,
          createdAt: now, updatedAt: now,
        },
        {
          id: "demo-2", name: "Kaiju Blues", description: "Manga de science-fiction.",
          type: "manga", status: "preparing", isFavorite: false, isArchived: false,
          createdAt: now, updatedAt: now,
        },
      ],
    });
  },
}));
