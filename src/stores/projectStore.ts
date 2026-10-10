import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import { useRelationStore } from "@/stores/relationStore";
import { useSynopsisStore } from "@/stores/synopsisStore";
import type {
  Project,
  ProjectStatus,
  ProjectType,
} from "@/types";

interface CreateProjectInput {
  name: string;
  description: string;
  projectType: ProjectType;
}

interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string;
  projectType?: ProjectType;
  status?: ProjectStatus;
  isFavorite?: boolean;
  isArchived?: boolean;
}

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  query: string;
  loading: boolean;
  error: string | null;

  /**
   * Vrai uniquement en développement, après « Mode démo » :
   * les projets sont alors fictifs et gérés en mémoire, sans appel à Rust
   * (aucune session réelle n'existe dans ce mode).
   */
  demo: boolean;

  setQuery: (query: string) => void;
  clearError: () => void;

  fetchProjects: () => Promise<void>;

  createProject: (
    input: CreateProjectInput,
  ) => Promise<Project>;

  updateProject: (
    input: UpdateProjectInput,
  ) => Promise<Project>;

  duplicateProject: (id: string) => Promise<Project>;

  deleteProject: (id: string) => Promise<void>;

  /**
   * Ouvre un projet : enregistre l'ouverture côté Rust, met à jour
   * le projet dans le store et le définit comme projet courant.
   */
  openProject: (id: string) => Promise<Project>;

  closeProject: () => void;
  reset: () => void;
  seedDemo: () => void;
}

const initial: Pick<
  ProjectState,
  | "projects"
  | "currentProjectId"
  | "query"
  | "loading"
  | "error"
  | "demo"
> = {
  projects: [],
  currentProjectId: null,
  query: "",
  loading: false,
  error: null,
  demo: false,
};

/** Message affichable pour une erreur quelconque. */
function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Remplace un projet existant ou l'ajoute en tête de liste. */
function upsert(projects: Project[], project: Project): Project[] {
  const exists = projects.some((item) => item.id === project.id);

  return exists
    ? projects.map((item) =>
        item.id === project.id ? project : item,
      )
    : [project, ...projects];
}

export const useProjectStore =
  create<ProjectState>((set, get) => {
    /** Enregistre l'erreur dans le store puis la relance. */
    function fail(error: unknown, fallback: string): never {
      const message = messageOf(error, fallback);

      set({
        loading: false,
        error: message,
      });

      throw error instanceof Error
        ? error
        : new Error(message);
    }

    return {
      ...initial,

      setQuery: (query) => {
        set({ query });
      },

      clearError: () => {
        set({ error: null });
      },

      fetchProjects: async () => {
        // En mode démo, les projets fictifs restent en mémoire.
        if (get().demo) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const projects = await api.listProjects();

          set({
            projects,
            loading: false,
            error: null,
          });
        } catch (error) {
          set({
            loading: false,
            error: messageOf(
              error,
              "Chargement des projets impossible.",
            ),
          });
        }
      },

      createProject: async (input) => {
        set({
          loading: true,
          error: null,
        });

        try {
          if (get().demo) {
            const now = new Date().toISOString();

            const project: Project = {
              id: `demo-${Date.now()}`,
              name: input.name,
              description: input.description,
              type: input.projectType,
              status: "preparing",
              isFavorite: false,
              isArchived: false,
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: null,
            };

            set((state) => ({
              projects: [project, ...state.projects],
              loading: false,
              error: null,
            }));

            return project;
          }

          const project = await api.createProject({
            name: input.name,
            description: input.description,
            projectType: input.projectType,
          });

          set((state) => ({
            projects: upsert(state.projects, project),
            loading: false,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            "Création du projet impossible.",
          );
        }
      },

      updateProject: async (input) => {
        set({
          loading: true,
          error: null,
        });

        try {
          const {
            id,
            name,
            description,
            projectType,
            status,
            isFavorite,
            isArchived,
          } = input;

          if (get().demo) {
            const current = get().projects.find(
              (item) => item.id === id,
            );

            if (!current) {
              throw new Error("Projet non trouvé.");
            }

            const project: Project = {
              ...current,
              name: name ?? current.name,
              description: description ?? current.description,
              type: projectType ?? current.type,
              status: status ?? current.status,
              isFavorite: isFavorite ?? current.isFavorite,
              isArchived: isArchived ?? current.isArchived,
              updatedAt: new Date().toISOString(),
            };

            set((state) => ({
              projects: upsert(state.projects, project),
              loading: false,
              error: null,
            }));

            return project;
          }

          const project = await api.updateProject(id, {
            name,
            description,
            projectType,
            status,
            isFavorite,
            isArchived,
          });

          set((state) => ({
            projects: upsert(state.projects, project),
            loading: false,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            "Mise à jour du projet impossible.",
          );
        }
      },

      duplicateProject: async (id) => {
        set({
          loading: true,
          error: null,
        });

        try {
          if (get().demo) {
            const source = get().projects.find(
              (item) => item.id === id,
            );

            if (!source) {
              throw new Error("Projet non trouvé.");
            }

            const now = new Date().toISOString();

            const project: Project = {
              ...source,
              id: `demo-${Date.now()}`,
              name: `${source.name} (copie)`,
              status: "preparing",
              isFavorite: false,
              isArchived: false,
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: null,
            };

            set((state) => ({
              projects: [project, ...state.projects],
              loading: false,
              error: null,
            }));

            return project;
          }

          const project = await api.duplicateProject(id);

          set((state) => ({
            projects: upsert(state.projects, project),
            loading: false,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            "Duplication du projet impossible.",
          );
        }
      },

      deleteProject: async (id) => {
        set({
          loading: true,
          error: null,
        });

        try {
          if (!get().demo) {
            await api.deleteProject(id);
          }

          set((state) => ({
            projects: state.projects.filter(
              (project) => project.id !== id,
            ),
            currentProjectId:
              state.currentProjectId === id
                ? null
                : state.currentProjectId,
            loading: false,
            error: null,
          }));
        } catch (error) {
          fail(
            error,
            "Suppression du projet impossible.",
          );
        }
      },

      openProject: async (id) => {
        try {
          if (get().demo) {
            const project = get().projects.find(
              (item) => item.id === id,
            );

            if (!project) {
              throw new Error("Projet non trouvé.");
            }

            set({ currentProjectId: id });

            return project;
          }

          const project = await api.openProject(id);

          set((state) => ({
            projects: upsert(state.projects, project),
            currentProjectId: id,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            "Ouverture du projet impossible.",
          );
        }
      },

      closeProject: () => {
        // Le synopsis, les personnages et les lieux appartiennent au projet qu'on quitte.
        useSynopsisStore.getState().reset();
        useCharacterStore.getState().reset();
        useRelationStore.getState().reset();
        useLocationStore.getState().reset();
        usePlaceLinkStore.getState().reset();

        set({
          currentProjectId: null,
        });
      },

      reset: () => {
        // Appelé à la déconnexion : aucune donnée du compte précédent
        // ne doit rester en mémoire.
        useSynopsisStore.getState().reset();
        useCharacterStore.getState().reset();
        useRelationStore.getState().reset();
        useLocationStore.getState().reset();
        usePlaceLinkStore.getState().reset();

        set(initial);
      },

      seedDemo: () => {
        if (!import.meta.env.DEV) {
          return;
        }

        const now = new Date().toISOString();

        set({
          projects: [
            {
              id: "demo-1",
              name: "Les Cendres d'Ysmir",
              description:
                "Saga de fantasy en trois tomes.",
              type: "novel",
              status: "in_progress",
              isFavorite: true,
              isArchived: false,
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: null,
            },
            {
              id: "demo-2",
              name: "Kaiju Blues",
              description:
                "Manga de science-fiction.",
              type: "manga",
              status: "preparing",
              isFavorite: false,
              isArchived: false,
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: null,
            },
          ],
          currentProjectId: null,
          error: null,
          demo: true,
        });
      },
    };
  });