import i18n from "@/i18n";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import { useRelationStore } from "@/stores/relationStore";
import { usePlotStore } from "@/stores/plotStore";
import { useNoteStore } from "@/stores/noteStore";
import { useToastStore } from "@/stores/toastStore";
import { useTrashStore } from "@/stores/trashStore";
import { useStructureStore } from "@/stores/structureStore";
import { useSynopsisStore } from "@/stores/synopsisStore";
import type {
  GanixImportMode,
  GanixImportOutcome,
  Project,
  ProjectStatus,
  ProjectType,
  ProjectVisibility,
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
  /**
   * Dernier projet ouvert pendant la session. Contrairement à
   * `currentProjectId`, il est gardé en quittant l'espace de travail : le
   * bouton « Revenir au projet » de la barre du haut y ramène.
   */
  lastProjectId: string | null;
  query: string;
  loading: boolean;
  error: string | null;

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

  /** Rend un projet privé ou public (connexion nécessaire). */
  setVisibility: (
    id: string,
    visibility: ProjectVisibility,
  ) => Promise<Project>;

  /** Place un projet dans la corbeille (30 jours). */
  deleteProject: (id: string) => Promise<void>;

  /** Projets dans la corbeille (chargés à la demande). */
  trash: Project[];
  trashLoading: boolean;
  fetchTrash: () => Promise<void>;
  /** Sort des projets de la corbeille ; retourne ceux restaurés. */
  restoreProjects: (ids: string[]) => Promise<Project[]>;
  /** Supprime définitivement des projets de la corbeille. */
  purgeProjects: (ids: string[]) => Promise<void>;
  /** Confirme l'import d'un `.ganix` vérifié et l'ajoute à la liste. */
  importGanix: (stagingId: string, mode: GanixImportMode) => Promise<GanixImportOutcome>;

  /**
   * Ouvre un projet : enregistre l'ouverture côté Rust, met à jour
   * le projet dans le store et le définit comme projet courant.
   */
  openProject: (id: string) => Promise<Project>;

  closeProject: () => void;
  reset: () => void;
}

const initial: Pick<
  ProjectState,
  | "projects"
  | "currentProjectId"
  | "lastProjectId"
  | "query"
  | "loading"
  | "error"
  | "trash"
  | "trashLoading"
> = {
  projects: [],
  currentProjectId: null,
  lastProjectId: null,
  query: "",
  loading: false,
  error: null,
  trash: [],
  trashLoading: false,
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
  create<ProjectState>((set) => {
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
              i18n.t("errors:load.projects"),
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
            i18n.t("errors:load.createProject"),
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
            i18n.t("errors:load.updateProject"),
          );
        }
      },

      duplicateProject: async (id) => {
        set({
          loading: true,
          error: null,
        });

        try {
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
            i18n.t("errors:load.duplicateProject"),
          );
        }
      },

      setVisibility: async (id, visibility) => {
        set({
          loading: true,
          error: null,
        });

        try {
          const project = await api.setProjectVisibility(id, visibility);

          set((state) => ({
            projects: upsert(state.projects, project),
            loading: false,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            i18n.t("errors:load.visibility"),
          );
        }
      },

      importGanix: async (stagingId, mode) => {
        const outcome = await api.confirmGanixImport(stagingId, mode);

        // Remplacement : les données gardées en mémoire pour ce projet sont
        // périmées et seront relues à la prochaine ouverture.
        if (outcome.backupFile) {
          useSynopsisStore.getState().reset();
          useCharacterStore.getState().reset();
          useRelationStore.getState().reset();
          useLocationStore.getState().reset();
          usePlaceLinkStore.getState().reset();
          useStructureStore.getState().reset();
          useNoteStore.getState().reset();
          usePlotStore.getState().reset();
          useTrashStore.getState().reset();
          useToastStore.getState().clear();
        }

        set((state) => ({
          projects: upsert(state.projects, outcome.project),
          error: null,
        }));

        return outcome;
      },

      deleteProject: async (id) => {
        set({
          loading: true,
          error: null,
        });

        try {
          await api.deleteProject(id);

          set((state) => ({
            projects: state.projects.filter(
              (project) => project.id !== id,
            ),
            currentProjectId:
              state.currentProjectId === id
                ? null
                : state.currentProjectId,
            lastProjectId:
              state.lastProjectId === id ? null : state.lastProjectId,
            // La corbeille sera relue à sa prochaine ouverture.
            trash: [],
            loading: false,
            error: null,
          }));
        } catch (error) {
          fail(
            error,
            i18n.t("errors:load.deleteProject"),
          );
        }
      },

      fetchTrash: async () => {
        set({ trashLoading: true });

        try {
          const trash = await api.listProjectTrash();
          set({ trash, trashLoading: false });
        } catch (error) {
          set({ trashLoading: false });
          throw error;
        }
      },

      restoreProjects: async (ids) => {
        const restored: Project[] = [];

        try {
          for (const id of ids) {
            restored.push(await api.restoreProject(id));
          }
        } finally {
          const back = new Set(restored.map((project) => project.id));

          set((state) => ({
            projects: restored.reduce(upsert, state.projects),
            trash: state.trash.filter((project) => !back.has(project.id)),
          }));
        }

        return restored;
      },

      purgeProjects: async (ids) => {
        const purged = new Set<string>();

        try {
          for (const id of ids) {
            await api.purgeProject(id);
            purged.add(id);
          }
        } finally {
          set((state) => ({
            trash: state.trash.filter((project) => !purged.has(project.id)),
          }));
        }
      },

      openProject: async (id) => {
        try {
          const project = await api.openProject(id);

          set((state) => ({
            projects: upsert(state.projects, project),
            currentProjectId: id,
            lastProjectId: id,
            error: null,
          }));

          return project;
        } catch (error) {
          return fail(
            error,
            i18n.t("errors:load.openProject"),
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
        useStructureStore.getState().reset();
        useNoteStore.getState().reset();
        usePlotStore.getState().reset();
        useTrashStore.getState().reset();
        useToastStore.getState().clear();

        set({
          currentProjectId: null,
        });
      },

      reset: () => {
        // Appelé à la connexion, à la déconnexion et en quittant le mode
        // invité : aucune donnée de la session précédente ne doit rester
        // en mémoire.
        useSynopsisStore.getState().reset();
        useCharacterStore.getState().reset();
        useRelationStore.getState().reset();
        useLocationStore.getState().reset();
        usePlaceLinkStore.getState().reset();
        useStructureStore.getState().reset();
        useNoteStore.getState().reset();
        usePlotStore.getState().reset();
        useTrashStore.getState().reset();
        useToastStore.getState().clear();

        set(initial);
      },
    };
  });