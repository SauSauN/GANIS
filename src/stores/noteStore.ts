import { useEffect } from "react";
import { create } from "zustand";
import i18n from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { announceDeletion, announceDeletions } from "@/lib/trash";
import { folderAndDescendants } from "@/lib/notes";
import type {
  Note,
  NoteFolder,
  NoteSummary,
  NoteUpdate,
  StickyColor,
  StickyNote,
  StickyUpdate,
} from "@/types";

/*
 * Notes du projet ouvert : dossiers, notes (sans leur contenu) et post-it
 * du mur.
 *
 * Le contenu d'une note n'est chargé que par sa fiche (`api.getNote`) : la
 * liste reste légère même avec de longues notes. Comme les autres stores,
 * celui-ci sait à quel projet appartiennent ses données et il est vidé en
 * quittant le projet et à la déconnexion (voir `projectStore`).
 */

interface NoteState {
  projectId: string | null;
  folders: NoteFolder[];
  notes: NoteSummary[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  stickies: StickyNote[];
  stickiesLoaded: boolean;
  stickiesError: string | null;

  /** Dossier choisi pour la prochaine note créée (« Nouvelle note ici »). */
  createFolder: string | null;

  /** `language` : langue des notes système (par défaut, celle du logiciel). */
  fetchNotes: (projectId: string, language?: string) => Promise<void>;
  createFolderIn: (projectId: string, parentId: string | null, name: string) => Promise<NoteFolder>;
  renameFolder: (projectId: string, id: string, name: string) => Promise<void>;
  moveFolder: (projectId: string, id: string, parentId: string | null) => Promise<void>;
  deleteFolder: (projectId: string, id: string) => Promise<void>;

  createNote: (projectId: string, folderId: string | null, title: string) => Promise<Note>;
  updateNote: (projectId: string, id: string, input: NoteUpdate) => Promise<Note>;
  moveNote: (projectId: string, id: string, folderId: string | null) => Promise<void>;
  deleteNote: (projectId: string, id: string) => Promise<void>;
  /** Supprime plusieurs notes (un seul message, un seul « Annuler »). */
  deleteNotes: (projectId: string, ids: string[]) => Promise<void>;
  /** Déplace plusieurs notes dans un dossier (`null` : racine). */
  moveNotes: (projectId: string, ids: string[], folderId: string | null) => Promise<void>;

  fetchStickies: (projectId: string) => Promise<void>;
  createSticky: (projectId: string, color: StickyColor, x: number, y: number) => Promise<StickyNote>;
  /** Mise à jour immédiate à l'écran, puis enregistrement. */
  updateSticky: (projectId: string, id: string, input: StickyUpdate) => Promise<void>;
  raiseSticky: (projectId: string, id: string) => Promise<void>;
  deleteSticky: (projectId: string, id: string) => Promise<void>;

  setCreateFolder: (folderId: string | null) => void;
  reset: () => void;
}

let latestFetch = 0;
let latestStickies = 0;

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

const summaryOf = ({ content: _content, ...summary }: Note): NoteSummary => summary;

/** Comme Rust : épinglées d'abord, puis les plus récentes. */
function sortNotes(list: NoteSummary[]): NoteSummary[] {
  return [...list].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export const useNoteStore = create<NoteState>((set, get) => {
  const mine = (projectId: string) => get().projectId === projectId;

  function upsertNote(projectId: string, note: Note) {
    if (!mine(projectId)) return;
    const others = get().notes.filter((item) => item.id !== note.id);
    set({ notes: sortNotes([...others, summaryOf(note)]) });
  }

  function upsertFolder(projectId: string, folder: NoteFolder) {
    if (!mine(projectId)) return;
    set({ folders: [...get().folders.filter((item) => item.id !== folder.id), folder] });
  }

  function upsertSticky(projectId: string, sticky: StickyNote) {
    if (!mine(projectId)) return;
    set({ stickies: get().stickies.map((item) => (item.id === sticky.id ? sticky : item)) });
  }

  return {
    projectId: null,
    folders: [],
    notes: [],
    loaded: false,
    loading: false,
    error: null,
    stickies: [],
    stickiesLoaded: false,
    stickiesError: null,
    createFolder: null,

    fetchNotes: async (projectId, language) => {
      const request = ++latestFetch;
      const same = mine(projectId);

      set({
        projectId,
        folders: same ? get().folders : [],
        notes: same ? get().notes : [],
        loaded: same && get().loaded,
        stickies: same ? get().stickies : [],
        stickiesLoaded: same && get().stickiesLoaded,
        stickiesError: same ? get().stickiesError : null,
        createFolder: same ? get().createFolder : null,
        loading: true,
        error: null,
      });

      try {
        // Notes système : titres dans la langue du logiciel, contenu à jour des fiches.
        await api.syncSystemNotes(projectId, language ?? i18n.language).catch(() => undefined);
        const [folders, notes] = await Promise.all([
          api.listNoteFolders(projectId),
          api.listNotes(projectId),
        ]);

        if (request !== latestFetch) return;
        set({ folders, notes, loaded: true, loading: false });
      } catch (error) {
        if (request !== latestFetch) return;
        set({ loading: false, error: messageOf(error, i18n.t("errors:load.notes")) });
      }
    },

    createFolderIn: async (projectId, parentId, name) => {
      const folder = await api.createNoteFolder(projectId, parentId, name);
      upsertFolder(projectId, folder);
      return folder;
    },

    renameFolder: async (projectId, id, name) => {
      upsertFolder(projectId, await api.renameNoteFolder(projectId, id, name));
    },

    moveFolder: async (projectId, id, parentId) => {
      upsertFolder(projectId, await api.moveNoteFolder(projectId, id, parentId));
    },

    deleteFolder: async (projectId, id) => {
      const before = get().folders.find((item) => item.id === id);
      const trashId = await api.deleteNoteFolder(projectId, id);
      announceDeletion(projectId, trashId, "noteFolder", before?.name ?? "");
      if (!mine(projectId)) return;

      // Comme Rust : sous-dossiers supprimés, leurs notes remontent à la racine.
      const removed = folderAndDescendants(get().folders, id);
      set({
        folders: get().folders.filter((folder) => !removed.has(folder.id)),
        notes: get().notes.map((note) =>
          note.folderId && removed.has(note.folderId) ? { ...note, folderId: null } : note,
        ),
        createFolder: get().createFolder && removed.has(get().createFolder!) ? null : get().createFolder,
      });
    },

    createNote: async (projectId, folderId, title) => {
      const note = await api.createNote(projectId, folderId, title);
      upsertNote(projectId, note);
      return note;
    },

    updateNote: async (projectId, id, input) => {
      const note = await api.updateNote(projectId, id, input);
      upsertNote(projectId, note);
      return note;
    },

    moveNote: async (projectId, id, folderId) => {
      upsertNote(projectId, await api.moveNote(projectId, id, folderId));
    },

    deleteNote: async (projectId, id) => {
      const before = get().notes.find((item) => item.id === id);
      const trashId = await api.deleteNote(projectId, id);
      announceDeletion(projectId, trashId, "note", before?.title ?? "");
      if (mine(projectId)) set({ notes: get().notes.filter((note) => note.id !== id) });
    },

    deleteNotes: async (projectId, ids) => {
      const trashIds: string[] = [];
      const removed = new Set<string>();

      try {
        for (const id of ids) {
          trashIds.push(await api.deleteNote(projectId, id));
          removed.add(id);
        }
      } finally {
        announceDeletions(projectId, trashIds);
        if (mine(projectId)) set({ notes: get().notes.filter((note) => !removed.has(note.id)) });
      }
    },

    moveNotes: async (projectId, ids, folderId) => {
      for (const id of ids) {
        upsertNote(projectId, await api.moveNote(projectId, id, folderId));
      }
    },

    fetchStickies: async (projectId) => {
      const request = ++latestStickies;

      if (!mine(projectId)) {
        // Le mur peut s'ouvrir avant la liste : le store change de projet.
        latestFetch++;
        set({
          projectId,
          folders: [],
          notes: [],
          loaded: false,
          loading: false,
          error: null,
          stickies: [],
          stickiesLoaded: false,
          createFolder: null,
        });
      }

      set({ stickiesError: null });

      try {
        const stickies = await api.listStickyNotes(projectId);
        if (request !== latestStickies || !mine(projectId)) return;
        set({ stickies, stickiesLoaded: true });
      } catch (error) {
        if (request !== latestStickies || !mine(projectId)) return;
        set({ stickiesError: messageOf(error, i18n.t("errors:load.stickies")) });
      }
    },

    createSticky: async (projectId, color, x, y) => {
      const sticky = await api.createStickyNote(projectId, color, x, y);
      if (mine(projectId)) set({ stickies: [...get().stickies, sticky] });
      return sticky;
    },

    updateSticky: async (projectId, id, input) => {
      if (mine(projectId)) {
        set({ stickies: get().stickies.map((item) => (item.id === id ? { ...item, ...input } : item)) });
      }

      try {
        upsertSticky(projectId, await api.updateStickyNote(projectId, id, input));
      } catch (error) {
        // Refusé : le mur est relu pour ne pas afficher un état faux.
        void get().fetchStickies(projectId);
        throw error;
      }
    },

    raiseSticky: async (projectId, id) => {
      const top = Math.max(0, ...get().stickies.map((item) => item.z));
      const current = get().stickies.find((item) => item.id === id);
      if (!current || (current.z === top && get().stickies.filter((s) => s.z === top).length === 1)) return;

      if (mine(projectId)) {
        set({ stickies: get().stickies.map((item) => (item.id === id ? { ...item, z: top + 1 } : item)) });
      }
      upsertSticky(projectId, await api.raiseStickyNote(projectId, id));
    },

    deleteSticky: async (projectId, id) => {
      const before = get().stickies.find((item) => item.id === id);
      const trashId = await api.deleteStickyNote(projectId, id);
      announceDeletion(projectId, trashId, "sticky", (before?.text ?? "").replace(/\s+/g, " ").slice(0, 40));
      if (mine(projectId)) set({ stickies: get().stickies.filter((item) => item.id !== id) });
    },

    setCreateFolder: (folderId) => set({ createFolder: folderId }),

    reset: () => {
      latestFetch++;
      latestStickies++;
      set({
        projectId: null,
        folders: [],
        notes: [],
        loaded: false,
        loading: false,
        error: null,
        stickies: [],
        stickiesLoaded: false,
        stickiesError: null,
        createFolder: null,
      });
    },
  };
});

// Notes système : leurs titres (dossiers, noms des éléments, intertitres)
// suivent la langue du logiciel ; on les recalcule quand elle change.
i18n.on("languageChanged", (language: string) => {
  const { projectId, loaded, fetchNotes } = useNoteStore.getState();
  if (projectId && loaded) void fetchNotes(projectId, language);
});

const NO_FOLDERS: NoteFolder[] = [];
const NO_NOTES: NoteSummary[] = [];
const NO_STICKIES: StickyNote[] = [];

/** Dossiers et notes d'un projet ; chargés au premier besoin. */
export function useProjectNotes(projectId: string) {
  const isMine = useNoteStore((state) => state.projectId === projectId);
  const folders = useNoteStore((state) => (isMine ? state.folders : NO_FOLDERS));
  const notes = useNoteStore((state) => (isMine ? state.notes : NO_NOTES));
  const loaded = useNoteStore((state) => isMine && state.loaded);
  const loading = useNoteStore((state) => isMine && state.loading);
  const error = useNoteStore((state) => (isMine ? state.error : null));
  const fetchNotes = useNoteStore((state) => state.fetchNotes);

  const needsFetch = !isMine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchNotes(projectId);
  }, [needsFetch, fetchNotes, projectId]);

  return { folders, notes, loaded, loading, error, reload: () => fetchNotes(projectId) };
}

/** Post-it du mur d'un projet ; chargés au premier besoin. */
export function useProjectStickies(projectId: string) {
  const isMine = useNoteStore((state) => state.projectId === projectId);
  const stickies = useNoteStore((state) => (isMine ? state.stickies : NO_STICKIES));
  const loaded = useNoteStore((state) => isMine && state.stickiesLoaded);
  const error = useNoteStore((state) => (isMine ? state.stickiesError : null));
  const fetchStickies = useNoteStore((state) => state.fetchStickies);

  const needsFetch = !isMine || (!loaded && !error);

  useEffect(() => {
    if (needsFetch) void fetchStickies(projectId);
  }, [needsFetch, fetchStickies, projectId]);

  return { stickies, loaded, error, reload: () => fetchStickies(projectId) };
}