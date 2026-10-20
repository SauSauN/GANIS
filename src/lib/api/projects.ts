import { call } from "./client";
import type {
  GanixImportMode,
  GanixImportOutcome,
  GanixPreview,
  Project,
  Synopsis,
} from "@/types";

/** Projets, format .ganix et synopsis. */
export const projectsApi = {
  // -------------------------------------------------------------------------
  // Phase 4 — Projets
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau projet.
   *
   * `projectType` est volontairement en camelCase côté frontend.
   * Visibilité automatique (décidée par Rust) : public sans connexion,
   * privé une fois connecté.
   */
  createProject: (input: {
    name: string;
    description: string;
    projectType: Project["type"];
  }) => call<Project>("create_project", { input }),

  /**
   * Rend un projet privé (lié au compte connecté) ou public.
   * Nécessite une connexion.
   */
  setProjectVisibility: (
    projectId: string,
    visibility: Project["visibility"],
  ) =>
    call<Project>("set_project_visibility", { projectId, visibility }),

  /**
   * Liste les projets accessibles : projets publics, et projets privés du
   * compte connecté.
   */
  listProjects: () => call<Project[]>("list_projects"),

  /**
   * Récupère un projet précis.
   */
  getProject: (projectId: string) =>
    call<Project>("get_project", { projectId }),

  /**
   * Ouvre un projet : enregistre la date d'ouverture et retourne le projet.
   */
  openProject: (projectId: string) =>
    call<Project>("open_project", { projectId }),

  /**
   * Met à jour un projet existant.
   *
   * Les champs sont optionnels afin de permettre des mises à jour
   * partielles depuis l'interface.
   */
  updateProject: (
    projectId: string,
    input: {
      name?: string;
      description?: string;
      projectType?: Project["type"];
      status?: Project["status"];
      isFavorite?: boolean;
      isArchived?: boolean;
    },
  ) =>
    call<Project>("update_project", {
      projectId,
      input,
    }),

  /**
   * Duplique un projet (métadonnées uniquement).
   */
  duplicateProject: (projectId: string) =>
    call<Project>("duplicate_project", { projectId }),

  /**
   * Place un projet dans la corbeille (restaurable pendant 30 jours).
   */
  deleteProject: (projectId: string) =>
    call<void>("delete_project", { projectId }),

  /**
   * Projets dans la corbeille (les projets expirés sont d'abord effacés).
   */
  listProjectTrash: () => call<Project[]>("list_project_trash"),

  /**
   * Sort un projet de la corbeille.
   */
  restoreProject: (projectId: string) =>
    call<Project>("restore_project", { projectId }),

  /**
   * Supprime définitivement un projet de la corbeille.
   */
  purgeProject: (projectId: string) =>
    call<void>("purge_project", { projectId }),

  // -------------------------------------------------------------------------
  // Format .ganix
  // -------------------------------------------------------------------------

  /**
   * Exporte un projet dans un fichier `.ganix` choisi par l'utilisateur
   * (fenêtre ouverte par Rust). Retourne le nom du fichier écrit, ou `null`
   * si l'utilisateur a annulé.
   */
  exportProject: (projectId: string, dialogTitle: string) =>
    call<string | null>("export_project", { projectId, dialogTitle }),

  /**
   * Fait choisir un `.ganix`, le vérifie et le met en attente. Retourne
   * l'aperçu, ou `null` si l'utilisateur a annulé.
   */
  inspectGanix: (dialogTitle: string) =>
    call<GanixPreview | null>("inspect_ganix", { dialogTitle }),

  /** Ajoute au compte le projet en attente. */
  confirmGanixImport: (stagingId: string, mode: GanixImportMode) =>
    call<GanixImportOutcome>("confirm_ganix_import", { stagingId, mode }),

  /** Abandonne un import en attente (aucune trace). */
  cancelGanixImport: (stagingId: string) =>
    call<void>("cancel_ganix_import", { stagingId }),

  // -------------------------------------------------------------------------
  // Synopsis
  // -------------------------------------------------------------------------

  /**
   * Récupère le synopsis d'un projet.
   */
  getSynopsis: (projectId: string) =>
    call<Synopsis>("get_synopsis", { projectId }),

  /**
   * Met à jour le synopsis d'un projet.
   */
  updateSynopsis: (
    projectId: string,
    input: {
      content: string;
      genres: string[];
      subgenres: string[];
      tone: string[];
    },
  ) =>
    call<Synopsis>("update_synopsis", {
      projectId,
      input,
    }),
};
