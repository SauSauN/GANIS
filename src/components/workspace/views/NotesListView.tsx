import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, NotebookText, Pin, Plus, Search, Trash2 } from "lucide-react";
import { SelectionBar, SelectionCheckbox } from "@/components/common/SelectionBar";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { formatNoteDate, useFolderOptions } from "@/components/notes/FolderSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { folderAndDescendants, folderPath, matchesNote, noteTabId } from "@/lib/notes";
import { errorText } from "@/lib/errors";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toastStore";
import { useNoteStore, useProjectNotes } from "@/stores/noteStore";

interface NotesListViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Valeur du filtre « tous les dossiers ». */
const ALL = "__all__";

/** Dossier racine, dans « Déplacer vers… ». */
const ROOT = "__root__";

/**
 * Toutes les notes du projet, en cartes : recherche dans le titre et le
 * début du texte, filtre par dossier (sous-dossiers compris).
 */
export function NotesListView({ projectId, feature, onOpenFeature }: NotesListViewProps) {
  const { t, i18n } = useTranslation("notes");
  const { folders, notes, loaded, error } = useProjectNotes(projectId);
  const setCreateFolder = useNoteStore((state) => state.setCreateFolder);
  const deleteNotes = useNoteStore((state) => state.deleteNotes);
  const moveNotes = useNoteStore((state) => state.moveNotes);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL);
  const folderOptions = useFolderOptions(folders);

  const visible = useMemo(() => {
    const inFolder =
      filter === ALL
        ? null
        : filter === ""
          ? new Set<string | null>([null])
          : new Set<string | null>(folderAndDescendants(folders, filter));

    return notes.filter(
      (note) => (!inFolder || inFolder.has(note.folderId ?? null)) && matchesNote(note, query),
    );
  }, [notes, folders, filter, query]);

  // Sélection multiple : les notes système (liées aux fiches) en sont exclues.
  const selection = useSelection(visible.filter((note) => !note.system).map((note) => note.id));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function moveSelected(folderId: string | null) {
    const ids = selection.selected;
    setBusy(true);
    try {
      await moveNotes(projectId, ids, folderId);
      toast({ tone: "success", message: t("list.moved", { count: ids.length }) });
      selection.clear();
    } catch (error) {
      toast({ tone: "error", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function newNote() {
    setCreateFolder(filter !== ALL && filter !== "" ? filter : null);
    onOpenFeature("notes.create");
  }

  return (
    <PageShell
      title={feature.label}
      description={feature.description}
      actions={
        <Button onClick={newNote}>
          <Plus className="mr-1.5 size-4" />
          {t("list.newNote")}
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            className="pl-8"
          />
        </div>

        <select
          aria-label={t("list.allFolders")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className={cn(fieldClass, "h-9 w-56")}
        >
          <option value={ALL}>{t("list.allFolders")}</option>
          <option value="">{t("list.rootOnly")}</option>
          {folderOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        {loaded && (
          <span className="text-sm text-muted-foreground">{t("list.count", { count: visible.length })}</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {loaded && visible.some((note) => !note.system) && (
        <SelectionBar selection={selection} disabled={busy} className="mb-3">
          <select
            aria-label={t("list.moveTo")}
            value=""
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value;
              if (value) void moveSelected(value === ROOT ? null : value);
            }}
            className={cn(fieldClass, "h-8 w-52")}
          >
            <option value="">{t("list.moveTo")}</option>
            <option value={ROOT}>{t("list.rootOnly")}</option>
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-1.5 size-3.5" />
            {t("list.deleteSelected")}
          </Button>
        </SelectionBar>
      )}

      {loaded && visible.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <NotebookText className="mx-auto mb-3 size-8 opacity-40" />
          {notes.length === 0 ? t("list.empty") : t("list.noMatch")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((note) => {
            const path = folderPath(folders, note.folderId);
            return (
              <li key={note.id} className="relative">
                {!note.system && (
                  <span className="absolute top-3 right-3 z-10 flex">
                    <SelectionCheckbox
                      selection={selection}
                      id={note.id}
                      label={t("list.select", { name: note.title || t("untitled") })}
                      disabled={busy}
                    />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOpenFeature(noteTabId(note.id))}
                  className={cn(
                    "flex h-full w-full flex-col gap-2 rounded-xl border bg-card p-4 pr-10 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40",
                    selection.isSelected(note.id) && "border-primary/60 bg-accent/60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("flex-1 font-medium", !note.title && "text-muted-foreground italic")}>
                      {note.title || t("untitled")}
                    </span>
                    {note.pinned && <Pin aria-label={t("list.pinned")} className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                  </div>
                  <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
                    {note.excerpt || <span className="italic">{t("list.noExcerpt")}</span>}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1">
                      {path.length > 0 && (
                        <>
                          <Folder className="size-3 shrink-0" />
                          <span className="truncate">{path.map((folder) => folder.name).join(" / ")}</span>
                        </>
                      )}
                    </span>
                    <span className="shrink-0">{formatNoteDate(note.updatedAt, i18n.language)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("list.deleteSelectedTitle", { count: selection.count })}
        description={t("list.deleteSelectedBody")}
        confirmLabel={t("list.deleteSelected")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const ids = selection.selected;
          await deleteNotes(projectId, ids);
          selection.drop(ids);
          setConfirmDelete(false);
        }}
      />
    </PageShell>
  );
}