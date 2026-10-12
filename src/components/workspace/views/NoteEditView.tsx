import { useCallback, useEffect, useRef, useState } from "react";
import { VersionsButton } from "@/components/history/VersionsDialog";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Pin, PinOff, RefreshCw, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { FolderSelect, formatNoteDate } from "@/components/notes/FolderSelect";
import { NoteEditor } from "@/components/notes/editor/NoteEditor";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { makeExcerpt, MAX_NOTE_TITLE, parseNoteContent } from "@/lib/notes";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { useNoteStore, useProjectNotes } from "@/stores/noteStore";
import type { Note } from "@/types";

interface NoteEditViewProps {
  projectId: string;
  noteId: string;
  /** Ferme l'onglet sans question (note supprimée). */
  onClose: () => void;
}

type SaveStatus = "idle" | "saved" | "error";

/**
 * Une note ouverte dans son onglet : titre, dossier, épingle et éditeur.
 *
 * Le titre et le contenu s'enregistrent ensemble (bouton, Ctrl+S via la
 * question des onglets, ou enregistrement automatique). Le dossier et
 * l'épingle s'appliquent tout de suite.
 */
export function NoteEditView({ projectId, noteId, onClose }: NoteEditViewProps) {
  const { t, i18n } = useTranslation(["notes", "common"]);
  const { folders, notes } = useProjectNotes(projectId);
  /** Résumé dans la liste : suit les déplacements faits ailleurs (panneau, dossier supprimé). */
  const summary = notes.find((item) => item.id === noteId);
  const updateNote = useNoteStore((state) => state.updateNote);
  const moveNote = useNoteStore((state) => state.moveNote);
  const deleteNote = useNoteStore((state) => state.deleteNote);

  const [note, setNote] = useState<Note | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  /** Numéro de la dernière modification du contenu, et de la dernière enregistrée. */
  const [contentVersion, setContentVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const versionRef = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const statusTimer = useRef<number | null>(null);

  // --- Chargement --------------------------------------------------------------

  const load = useCallback(async () => {
    setLoadError(null);
    setNotFound(false);
    try {
      const loaded = await api.getNote(projectId, noteId);
      setNote(loaded);
      setTitle(loaded.title);
      setSavedTitle(loaded.title);
    } catch (error) {
      if (error instanceof ApiError && error.key === "note.notFound") setNotFound(true);
      else setLoadError(error instanceof ApiError ? error.message : String(error));
    }
  }, [projectId, noteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    },
    [],
  );

  // --- Enregistrement ----------------------------------------------------------

  const dirty = note !== null && (title !== savedTitle || contentVersion !== savedVersion);

  function save(): Promise<boolean> {
    if (!inFlight.current) {
      inFlight.current = doSave().finally(() => {
        inFlight.current = null;
      });
    }
    return inFlight.current;
  }

  async function doSave(): Promise<boolean> {
    const editor = editorRef.current;
    if (!editor || !note) return false;

    const version = versionRef.current;
    const sentTitle = title;
    setSaving(true);
    setSaveStatus("idle");

    try {
      const saved = await updateNote(projectId, noteId, {
        title: sentTitle,
        content: editor.isEmpty ? "" : JSON.stringify(editor.getJSON()),
        excerpt: makeExcerpt(editor.getText({ blockSeparator: " " })),
      });
      setNote(saved);
      // Ce qui a été tapé pendant l'enregistrement reste « non enregistré ».
      setSavedTitle(sentTitle);
      setSavedVersion(version);
      setSaveStatus("saved");
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setSaveStatus("idle"), 2500);
      return true;
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : String(error));
      setSaveStatus("error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({ dirty, save, revision: `${title}\u0000${contentVersion}` });

  const onEditorChange = useCallback(() => {
    versionRef.current += 1;
    setContentVersion(versionRef.current);
  }, []);

  const onEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  // --- Actions immédiates --------------------------------------------------------

  async function togglePin() {
    if (!note) return;
    setActionError(null);
    try {
      const saved = await updateNote(projectId, noteId, { pinned: !note.pinned });
      setNote((current) => (current ? { ...current, pinned: saved.pinned } : current));
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : String(error));
    }
  }

  async function changeFolder(folderId: string | null) {
    if (!note) return;
    setActionError(null);
    try {
      await moveNote(projectId, noteId, folderId);
      setNote((current) => (current ? { ...current, folderId } : current));
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : String(error));
    }
  }

  // --- Affichage -----------------------------------------------------------------

  if (notFound) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {t("edit.notFound")}
      </main>
    );
  }

  if (!note) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
        {loadError ? (
          <>
            <p role="alert" className="text-destructive">
              {loadError}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              {t("edit.retry")}
            </Button>
          </>
        ) : (
          <p>{t("edit.loading")}</p>
        )}
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-5xl px-6 py-6 pb-24 lg:px-10">
        <header className="mb-4 space-y-3">
          <input
            value={title}
            maxLength={MAX_NOTE_TITLE}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("edit.titlePlaceholder")}
            aria-label={t("edit.titlePlaceholder")}
            className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/60"
          />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              {t("edit.folder")}
              <FolderSelect
                folders={folders}
                value={summary ? summary.folderId : note.folderId}
                onChange={(folderId) => void changeFolder(folderId)}
                className="h-8 w-52 text-foreground"
              />
            </label>

            <Button variant="ghost" size="sm" onClick={() => void togglePin()} aria-pressed={note.pinned}>
              {note.pinned ? <PinOff className="mr-1.5 size-4" /> : <Pin className="mr-1.5 size-4" />}
              {note.pinned ? t("edit.unpin") : t("edit.pin")}
            </Button>

            <span className="text-xs text-muted-foreground">
              {t("edit.updated", { date: formatNoteDate(note.updatedAt, i18n.language) })}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {saveStatus === "saved" && (
                <span role="status" className="text-xs text-success">
                  {t("edit.saved")}
                </span>
              )}
              {saveStatus === "error" && (
                <span role="alert" className="text-xs text-destructive">
                  {t("edit.saveFailed")}
                </span>
              )}
              <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
                <Save className="mr-1.5 size-4" />
                {saving ? t("common:actions.saving") : t("common:actions.save")}
              </Button>
              <VersionsButton projectId={projectId} kind="note" itemId={noteId} name={note.title || t("untitled")} />
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("edit.delete")}
                aria-label={t("edit.delete")}
                onClick={() => setConfirmDelete(true)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
        </header>

        <NoteEditor
          initialContent={parseNoteContent(note.content)}
          onChange={onEditorChange}
          onReady={onEditorReady}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("edit.deleteTitle", { title: note.title || t("untitled") })}
        description={t("edit.deleteBody")}
        confirmLabel={t("edit.deleteConfirm")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteNote(projectId, noteId);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </main>
  );
}
