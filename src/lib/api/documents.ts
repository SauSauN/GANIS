import { call, toBytes } from "./client";
import type {
  SystemNotesSettings,
  Note,
  NoteSummary,
  NoteUpdate,
  StickyColor,
  StickyNote,
  StickyUpdate,
  StructureDocument,
  DocumentVersion,
  ExternalStatus,
  ExternalSync,
} from "@/types";

/** Documents rangés dans le découpage. */
export const documentsApi = {
  // -------------------------------------------------------------------------
  // Documents rangés dans le découpage
  // -------------------------------------------------------------------------

  listStructureDocuments: (projectId: string, nodeId: string) =>
    call<StructureDocument[]>("list_structure_documents", { projectId, nodeId }),

  countStructureDocuments: (projectId: string) =>
    call<Record<string, number>>("count_structure_documents", { projectId }),

  /** Contenu du document, en binaire. */
  getStructureDocumentContent: (projectId: string, documentId: string) =>
    call<ArrayBuffer>("get_structure_document_content", { projectId, documentId }),

  /** Fenêtre de choix de fichiers ; liste vide si l'utilisateur annule. */
  pickStructureDocuments: (projectId: string, nodeId: string, dialogTitle: string) =>
    call<StructureDocument[]>("pick_structure_documents", { projectId, nodeId, dialogTitle }),

  /** Fichier déposé : envoyé tel quel (corps binaire). */
  addStructureDocument: (projectId: string, nodeId: string, name: string, data: ArrayBuffer | Uint8Array) =>
    call<StructureDocument>("add_structure_document", toBytes(data), {
      headers: {
        "x-project-id": encodeURIComponent(projectId),
        "x-node-id": encodeURIComponent(nodeId),
        "x-name": encodeURIComponent(name),
      },
    }),

  /** Nouveau contenu (texte modifié dans GANIS) ; l'ancien devient une version. */
  updateStructureDocumentContent: (projectId: string, documentId: string, data: ArrayBuffer | Uint8Array) =>
    call<StructureDocument>("update_structure_document_content", toBytes(data), {
      headers: {
        "x-project-id": encodeURIComponent(projectId),
        "x-document-id": encodeURIComponent(documentId),
      },
    }),

  pickStructureDocumentReplacement: (projectId: string, documentId: string, dialogTitle: string) =>
    call<StructureDocument | null>("pick_structure_document_replacement", { projectId, documentId, dialogTitle }),

  renameStructureDocument: (projectId: string, documentId: string, name: string) =>
    call<StructureDocument>("rename_structure_document", { projectId, documentId, name }),

  updateStructureDocumentNote: (projectId: string, documentId: string, note: string) =>
    call<StructureDocument>("update_structure_document_note", { projectId, documentId, note }),

  moveStructureDocument: (projectId: string, documentId: string, nodeId: string) =>
    call<StructureDocument>("move_structure_document", { projectId, documentId, nodeId }),

  reorderStructureDocuments: (projectId: string, nodeId: string, ids: string[]) =>
    call<StructureDocument[]>("reorder_structure_documents", { projectId, nodeId, ids }),

  /** Met le document à la corbeille ; renvoie l'identifiant de l'entrée. */
  deleteStructureDocument: (projectId: string, documentId: string) =>
    call<string>("delete_structure_document", { projectId, documentId }),

  /** « Enregistrer sous… » ; `null` si l'utilisateur annule. */
  saveStructureDocumentAs: (projectId: string, documentId: string, versionId: string | null, dialogTitle: string) =>
    call<string | null>("save_structure_document_as", { projectId, documentId, versionId, dialogTitle }),

  listDocumentVersions: (projectId: string, documentId: string) =>
    call<DocumentVersion[]>("list_document_versions", { projectId, documentId }),

  getDocumentVersionContent: (projectId: string, versionId: string) =>
    call<ArrayBuffer>("get_document_version_content", { projectId, versionId }),

  restoreDocumentVersion: (projectId: string, documentId: string, versionId: string) =>
    call<StructureDocument>("restore_document_version", { projectId, documentId, versionId }),

  deleteDocumentVersion: (projectId: string, versionId: string) =>
    call<void>("delete_document_version", { projectId, versionId }),

  openStructureDocumentExternally: (projectId: string, documentId: string) =>
    call<ExternalStatus>("open_structure_document_externally", { projectId, documentId }),

  syncStructureDocumentExternal: (projectId: string, documentId: string) =>
    call<ExternalSync>("sync_structure_document_external", { projectId, documentId }),

  closeStructureDocumentExternal: (projectId: string, documentId: string) =>
    call<StructureDocument | null>("close_structure_document_external", { projectId, documentId }),

  getSystemNotes: (projectId: string) => call<SystemNotesSettings>("get_system_notes", { projectId }),

  setSystemNotes: (projectId: string, enabled: boolean, language: string) =>
    call<SystemNotesSettings>("set_system_notes", { projectId, enabled, language }),

  syncSystemNotes: (projectId: string, language: string) => call<void>("sync_system_notes", { projectId, language }),

  listNotes: (projectId: string) =>
    call<NoteSummary[]>("list_notes", { projectId }),

  getNote: (projectId: string, noteId: string) =>
    call<Note>("get_note", { projectId, noteId }),

  createNote: (projectId: string, folderId: string | null, title: string) =>
    call<Note>("create_note", { projectId, folderId, title }),

  updateNote: (projectId: string, noteId: string, input: NoteUpdate) =>
    call<Note>("update_note", { projectId, noteId, input }),

  moveNote: (projectId: string, noteId: string, folderId: string | null) =>
    call<Note>("move_note", { projectId, noteId, folderId }),

  deleteNote: (projectId: string, noteId: string) =>
    call<string>("delete_note", { projectId, noteId }),

  /** Post-it du mur. */
  listStickyNotes: (projectId: string) =>
    call<StickyNote[]>("list_sticky_notes", { projectId }),

  createStickyNote: (projectId: string, color: StickyColor, x: number, y: number) =>
    call<StickyNote>("create_sticky_note", { projectId, color, x, y }),

  updateStickyNote: (projectId: string, stickyId: string, input: StickyUpdate) =>
    call<StickyNote>("update_sticky_note", { projectId, stickyId, input }),

  /** Met un post-it au premier plan. */
  raiseStickyNote: (projectId: string, stickyId: string) =>
    call<StickyNote>("raise_sticky_note", { projectId, stickyId }),

  deleteStickyNote: (projectId: string, stickyId: string) =>
    call<string>("delete_sticky_note", { projectId, stickyId }),
};
