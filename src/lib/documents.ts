import { useEffect } from "react";
import { create } from "zustand";
import i18n from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/stores/toastStore";
import type { StructureDocument } from "@/types";

/*
 * Documents rangés dans le découpage : chapitre de manga, PDF, Word,
 * images, textes, sons, vidéos…
 *
 * - `documentKind` décide comment GANIS affiche un document ;
 * - `useDocumentStore` garde les documents de chaque élément du découpage
 *   et ceux qui sont ouverts dans une autre application (leurs
 *   modifications sont reprises dès qu'elles sont enregistrées, voir
 *   `ExternalDocumentsWatcher`).
 */

/** Façon d'afficher un document dans GANIS. */
export type DocumentKind = "pdf" | "image" | "word" | "text" | "audio" | "video" | "other";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const VIEWABLE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif", "image/svg+xml"]);
/** Formats lus par l'élément `<video>` de WebView2. */
const PLAYABLE_VIDEOS = new Set(["video/mp4", "video/webm"]);

export function documentKind(document: Pick<StructureDocument, "mime" | "name">): DocumentKind {
  const { mime } = document;
  if (mime === "application/pdf") return "pdf";
  if (VIEWABLE_IMAGES.has(mime)) return "image";
  if (mime === DOCX) return "word";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  if (mime.startsWith("audio/")) return "audio";
  if (PLAYABLE_VIDEOS.has(mime)) return "video";
  return "other";
}

/** Extension en majuscules (« PDF », « DOCX »), vide s'il n'y en a pas. */
export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 && index < name.length - 1 ? name.slice(index + 1).toUpperCase() : "";
}

/** « Chapitre 1.pdf » → « Chapitre 1 ». */
export function stemOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

/** « 12,4 Mo », « 830 Ko », « 512 o » (unités françaises en français). */
export function formatSize(bytes: number, language = i18n.language): string {
  const fr = language.startsWith("fr");
  const units = fr ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Taille maximale d'un document (comme dans Rust). */
export const MAX_DOCUMENT_BYTES = 300 * 1024 * 1024;

/** Extensions jamais ouvertes dans une autre application (comme dans Rust). */
const UNSAFE_EXTENSIONS = new Set([
  "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "cpl", "dll", "sys", "lnk", "url", "hta", "reg",
  "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "jar", "msc", "inf", "application", "appref-ms",
  "sh", "command", "app", "desktop", "run", "bin",
]);

export function canOpenExternally(name: string): boolean {
  const ext = extensionOf(name).toLowerCase();
  return ext !== "" && !UNSAFE_EXTENSIONS.has(ext);
}

/** Ordre après avoir déplacé l'élément `index` de `delta` places. */
export function moveInList<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Les pages d'un chapitre : les images, dans l'ordre du chapitre. */
export function readingPages(documents: StructureDocument[]): StructureDocument[] {
  return documents.filter((document) => documentKind(document) === "image");
}

// ----------------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------------

/** Document ouvert dans une autre application. */
export interface ExternalEdit {
  projectId: string;
  nodeId: string;
  name: string;
}

interface DocumentState {
  projectId: string | null;
  /** Documents de chaque élément du découpage déjà lus. */
  byNode: Record<string, StructureDocument[]>;
  /** Documents ouverts ailleurs, par identifiant. */
  external: Record<string, ExternalEdit>;

  fetchNode: (projectId: string, nodeId: string) => Promise<void>;
  setNode: (projectId: string, nodeId: string, documents: StructureDocument[]) => void;
  /** Ajoute ou remplace un document (et le retire d'un autre élément s'il a été déplacé). */
  upsert: (projectId: string, document: StructureDocument) => void;
  remove: (projectId: string, documentId: string) => void;
  /** Tout relire (restauration depuis la corbeille…). */
  invalidate: (projectId: string) => void;
  startExternal: (documentId: string, edit: ExternalEdit) => void;
  stopExternal: (documentId: string) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  projectId: null,
  byNode: {},
  external: {},

  fetchNode: async (projectId, nodeId) => {
    const documents = await api.listStructureDocuments(projectId, nodeId);
    get().setNode(projectId, nodeId, documents);
  },

  setNode: (projectId, nodeId, documents) => {
    const state = get();
    const byNode = state.projectId === projectId ? state.byNode : {};
    set({ projectId, byNode: { ...byNode, [nodeId]: documents } });
  },

  upsert: (projectId, document) => {
    const state = get();
    if (state.projectId !== projectId) return;
    const byNode: Record<string, StructureDocument[]> = {};
    for (const [nodeId, list] of Object.entries(state.byNode)) {
      byNode[nodeId] = list.filter((item) => item.id !== document.id || nodeId === document.nodeId);
    }
    const list = byNode[document.nodeId];
    if (list) {
      const index = list.findIndex((item) => item.id === document.id);
      byNode[document.nodeId] =
        index >= 0
          ? list.map((item) => (item.id === document.id ? document : item))
          : [...list, document].sort((a, b) => a.position - b.position);
    }
    set({ byNode });
  },

  remove: (projectId, documentId) => {
    const state = get();
    if (state.projectId !== projectId) return;
    const byNode: Record<string, StructureDocument[]> = {};
    for (const [nodeId, list] of Object.entries(state.byNode)) {
      byNode[nodeId] = list.filter((item) => item.id !== documentId);
    }
    set({ byNode });
  },

  invalidate: (projectId) => {
    const state = get();
    if (state.projectId !== projectId) return;
    // Les éléments affichés se relisent (voir `useNodeDocuments`).
    const nodes = Object.keys(state.byNode);
    set({ byNode: {} });
    for (const nodeId of nodes) void get().fetchNode(projectId, nodeId).catch(() => undefined);
  },

  startExternal: (documentId, edit) => set({ external: { ...get().external, [documentId]: edit } }),
  stopExternal: (documentId) => {
    const external = { ...get().external };
    delete external[documentId];
    set({ external });
  },
}));

/** Documents d'un élément du découpage (lus à la première demande). */
export function useNodeDocuments(projectId: string, nodeId: string): {
  documents: StructureDocument[] | null;
  reload: () => Promise<void>;
} {
  const documents = useDocumentStore((state) => (state.projectId === projectId ? state.byNode[nodeId] ?? null : null));
  const fetchNode = useDocumentStore((state) => state.fetchNode);

  useEffect(() => {
    if (documents === null) void fetchNode(projectId, nodeId).catch(() => undefined);
  }, [documents, fetchNode, projectId, nodeId]);

  return { documents, reload: () => fetchNode(projectId, nodeId) };
}

// ----------------------------------------------------------------------------
// Contenu
// ----------------------------------------------------------------------------

/** Contenu d'un document (ou d'une version) sous forme de `Blob` typé. */
export async function loadDocumentBlob(projectId: string, document: Pick<StructureDocument, "id" | "mime">, versionId?: string): Promise<Blob> {
  const data = versionId
    ? await api.getDocumentVersionContent(projectId, versionId)
    : await api.getStructureDocumentContent(projectId, document.id);
  return new Blob([data], { type: document.mime });
}

/** Message d'erreur affichable. */
export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
}

/**
 * Ouvre un document dans l'application associée à son type ; ses
 * modifications seront reprises dès qu'elles seront enregistrées.
 */
export async function openExternally(projectId: string, document: StructureDocument): Promise<boolean> {
  try {
    await api.openStructureDocumentExternally(projectId, document.id);
    useDocumentStore.getState().startExternal(document.id, { projectId, nodeId: document.nodeId, name: document.name });
    return true;
  } catch (error) {
    toast({ message: errorText(error), tone: "error" });
    return false;
  }
}

/** Termine la modification ailleurs (dernière reprise, copie supprimée). */
export async function finishExternal(projectId: string, documentId: string): Promise<void> {
  const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;
  try {
    const updated = await api.closeStructureDocumentExternal(projectId, documentId);
    if (updated) {
      useDocumentStore.getState().upsert(projectId, updated);
      toast({ message: t("documents:external.synced", { name: updated.name }), tone: "success" });
    }
  } catch (error) {
    toast({ message: errorText(error), tone: "error" });
  } finally {
    useDocumentStore.getState().stopExternal(documentId);
  }
}
