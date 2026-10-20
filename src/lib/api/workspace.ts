import { call } from "./client";
import type {
  NoteFolder,
  TrashItem,
  Activity,
  Version,
  VersionKind,
  VersionList,
  SearchHit,
  WorkCalendar,
} from "@/types";

/** Corbeille, historique, recherche, notes et trame. */
export const workspaceApi = {
  // -------------------------------------------------------------------------
  // Corbeille (les suppressions ci-dessous renvoient l'identifiant de
  // l'entrée de la corbeille, pour proposer « Annuler »)
  // -------------------------------------------------------------------------

  listTrash: (projectId: string) =>
    call<TrashItem[]>("list_trash", { projectId }),

  /** Remet un élément à sa place ; renvoie l'entrée restaurée. */
  restoreTrash: (projectId: string, trashId: string) =>
    call<TrashItem>("restore_trash", { projectId, trashId }),

  purgeTrash: (projectId: string, trashId: string) =>
    call<void>("purge_trash", { projectId, trashId }),

  emptyTrash: (projectId: string) =>
    call<void>("empty_trash", { projectId }),

  // -------------------------------------------------------------------------
  // Historique, versions, recherche
  // -------------------------------------------------------------------------

  /** Journal du projet, ou d'un seul élément (`kind` + `itemId`). */
  listActivity: (projectId: string, filter: { kind?: string; itemId?: string; limit?: number } = {}) =>
    call<Activity[]>("list_activity", {
      projectId,
      kind: filter.kind ?? null,
      itemId: filter.itemId ?? null,
      limit: filter.limit ?? null,
    }),

  listVersions: (projectId: string, kind: VersionKind, itemId: string) =>
    call<VersionList>("list_versions", { projectId, kind, itemId }),

  /** Version nommée de l'état actuel (« Avant réécriture »). */
  createVersion: (projectId: string, kind: VersionKind, itemId: string, name: string) =>
    call<Version>("create_version", { projectId, kind, itemId, name }),

  /** Remet l'élément dans l'état de la version ; l'état actuel est gardé. */
  restoreVersion: (projectId: string, versionId: string) =>
    call<void>("restore_version", { projectId, versionId }),

  deleteVersion: (projectId: string, versionId: string) =>
    call<void>("delete_version", { projectId, versionId }),

  /** Volume de travail jour par jour d'une année, tous projets confondus. */
  getWorkCalendar: (year: number) =>
    call<WorkCalendar>("get_work_calendar", { year }),

  /** Recherche dans tout le projet (sans casse ni accents). */
  searchProject: (projectId: string, query: string) =>
    call<SearchHit[]>("search_project", { projectId, query }),

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  /** Dossiers de notes du projet. */
  listNoteFolders: (projectId: string) =>
    call<NoteFolder[]>("list_note_folders", { projectId }),

  createNoteFolder: (projectId: string, parentId: string | null, name: string) =>
    call<NoteFolder>("create_note_folder", { projectId, parentId, name }),

  renameNoteFolder: (projectId: string, folderId: string, name: string) =>
    call<NoteFolder>("rename_note_folder", { projectId, folderId, name }),

  /** Déplace un dossier (`null` : à la racine). Refusé dans l'un de ses sous-dossiers. */
  moveNoteFolder: (projectId: string, folderId: string, parentId: string | null) =>
    call<NoteFolder>("move_note_folder", { projectId, folderId, parentId }),

  /** Supprime un dossier et ses sous-dossiers ; leurs notes remontent à la racine. */
  deleteNoteFolder: (projectId: string, folderId: string) =>
    call<string>("delete_note_folder", { projectId, folderId }),

  /** Notes du projet, sans leur contenu (épinglées d'abord, puis les plus récentes). */
  // -------------------------------------------------------------------------
  // Trame
  // -------------------------------------------------------------------------

  getPlot: (projectId: string) => call<{ data: string; updatedAt: string }>("get_plot", { projectId }),

  /** Enregistre toute la trame (document JSON). */
  updatePlot: (projectId: string, data: string) =>
    call<string>("update_plot", { projectId, data }),
};
