import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Folder,
  FolderLock,
  FolderOpen,
  FolderPlus,
  NotebookText,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import {
  buildFolderTree,
  folderAndDescendants,
  MAX_FOLDER_NAME,
  noteTabId,
  notesIn,
  type FolderNode,
} from "@/lib/notes";
import { cn } from "@/lib/utils";
import { useNoteStore, useProjectNotes } from "@/stores/noteStore";
import type { NoteFolder, NoteSummary } from "@/types";
import { errorText } from "@/lib/errors";

interface SideBarNotesProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/** Élément glissé (note ou dossier), transmis par le glisser-déposer. */
const DRAG_TYPE = "application/x-ganis-note";

type Row =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "note"; note: NoteSummary; depth: number }
  | { kind: "draft"; parentId: string | null; depth: number }
  | { kind: "rename"; folder: NoteFolder; depth: number };

/** Champ de saisie d'un nom de dossier (création ou renommage). */
function FolderNameInput({
  initial,
  label,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  placeholder: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  /** Entrée puis perte du focus : un seul envoi. */
  const sent = useRef(false);

  async function submit() {
    if (sent.current) return;
    const name = value.trim();
    if (!name || name === initial) {
      sent.current = true;
      onCancel();
      return;
    }
    sent.current = true;
    setBusy(true);
    try {
      await onSubmit(name);
    } finally {
      sent.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      sent.current = true;
      onCancel();
    }
  }

  return (
    <input
      autoFocus
      value={value}
      disabled={busy}
      maxLength={MAX_FOLDER_NAME}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => void submit()}
      onFocus={(event) => event.target.select()}
      className="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

/**
 * Dossiers et notes dans le panneau du module « Notes », comme
 * l'explorateur de VS Code :
 * - un clic sur une note l'ouvre dans un onglet ;
 * - les boutons d'un dossier (au survol) créent une note ou un
 *   sous-dossier dedans, le renomment ou le suppriment ;
 * - une note ou un dossier se glisse sur un dossier pour l'y ranger, ou
 *   sur le titre « Dossiers et notes » pour le sortir de tout dossier.
 */
export function SideBarNotes({ projectId, activeTab, onOpenFeature }: SideBarNotesProps) {
  const { t } = useTranslation("notes");
  const { folders, notes, loaded } = useProjectNotes(projectId);
  const createFolderIn = useNoteStore((state) => state.createFolderIn);
  const renameFolder = useNoteStore((state) => state.renameFolder);
  const moveFolder = useNoteStore((state) => state.moveFolder);
  const deleteFolder = useNoteStore((state) => state.deleteFolder);
  const createNote = useNoteStore((state) => state.createNote);
  const moveNote = useNoteStore((state) => state.moveNote);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** Dossier en cours de création (`undefined` : aucun ; `null` : à la racine). */
  const [draftParent, setDraftParent] = useState<string | null | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NoteFolder | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const untitled = t("untitled");

  const rows = useMemo(() => {
    const result: Row[] = [];

    function walk(nodes: FolderNode[], parentId: string | null, depth: number) {
      if (draftParent === parentId) result.push({ kind: "draft", parentId, depth });

      for (const node of nodes) {
        if (renaming === node.folder.id) {
          result.push({ kind: "rename", folder: node.folder, depth });
        } else {
          result.push({ kind: "folder", node, depth });
        }

        if (!collapsed.has(node.folder.id)) {
          walk(node.children, node.folder.id, depth + 1);
        }
      }

      for (const note of notesIn(notes, parentId, untitled)) {
        result.push({ kind: "note", note, depth });
      }
    }

    walk(buildFolderTree(folders), null, 0);
    return result;
  }, [folders, notes, collapsed, draftParent, renaming, untitled]);

  const report = (cause: unknown) => setError(errorText(cause));

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startFolder(parentId: string | null) {
    setError(null);
    setRenaming(null);
    if (parentId) {
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
    setDraftParent(parentId);
  }

  async function newNote(folderId: string | null) {
    setError(null);
    try {
      const note = await createNote(projectId, folderId, "");
      if (folderId) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(folderId);
          return next;
        });
      }
      onOpenFeature(noteTabId(note.id));
    } catch (cause) {
      report(cause);
    }
  }

  // --- Glisser-déposer ---------------------------------------------------------

  function onDragStart(event: DragEvent, kind: "note" | "folder", id: string) {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind, id }));
    event.dataTransfer.effectAllowed = "move";
  }

  function canDrop(event: DragEvent) {
    return event.dataTransfer.types.includes(DRAG_TYPE);
  }

  function onDragOver(event: DragEvent, target: string) {
    if (!canDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }

  async function onDrop(event: DragEvent, folderId: string | null) {
    setDropTarget(null);
    if (!canDrop(event)) return;
    event.preventDefault();

    let item: { kind: "note" | "folder"; id: string };
    try {
      item = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
    } catch {
      return;
    }

    setError(null);
    try {
      if (item.kind === "note") {
        const note = notes.find((entry) => entry.id === item.id);
        if (note && (note.folderId ?? null) !== folderId) await moveNote(projectId, item.id, folderId);
      } else {
        const folder = folders.find((entry) => entry.id === item.id);
        // Un dossier ne va ni dans lui-même ni dans l'un de ses sous-dossiers.
        if (!folder || (folder.parentId ?? null) === folderId) return;
        if (folderId && folderAndDescendants(folders, item.id).has(folderId)) return;
        await moveFolder(projectId, item.id, folderId);
      }
      if (folderId) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(folderId);
          return next;
        });
      }
    } catch (cause) {
      report(cause);
    }
  }

  // --- Affichage ---------------------------------------------------------------

  const indent = (depth: number) => ({ paddingLeft: `${depth * 0.875}rem` });

  const iconButton = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
    >
      {icon}
    </button>
  );

  return (
    <section aria-labelledby="sidebar-notes" className="mt-4 flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "mx-2 flex items-center gap-1 rounded-md px-2 pb-1",
          dropTarget === "root" && "bg-primary/10 ring-1 ring-primary",
        )}
        title={t("sidebar.dropRoot")}
        onDragOver={(event) => onDragOver(event, "root")}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => void onDrop(event, null)}
      >
        <h3
          id="sidebar-notes"
          className="flex-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t("sidebar.title")}
          {loaded && notes.length > 0 && ` (${notes.length})`}
        </h3>
        {iconButton(t("sidebar.newNote"), <FilePlus2 className="size-3.5" />, () => void newNote(null))}
        {iconButton(t("sidebar.newFolder"), <FolderPlus className="size-3.5" />, () => startFolder(null))}
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-1 text-xs text-destructive">
          {error}
        </p>
      )}

      {!loaded ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="tree" aria-labelledby="sidebar-notes">
          {rows.map((row) => {
            if (row.kind === "draft" || row.kind === "rename") {
              const isRename = row.kind === "rename";
              return (
                <li
                  key={isRename ? `rename-${row.folder.id}` : `draft-${row.parentId ?? "root"}`}
                  className="flex items-center gap-1 py-0.5"
                  style={indent(row.depth)}
                >
                  <span className="size-6 shrink-0" />
                  <Folder className="size-4 shrink-0 text-primary" />
                  <FolderNameInput
                    initial={isRename ? row.folder.name : ""}
                    label={t("sidebar.folderName")}
                    placeholder={t("sidebar.folderPlaceholder")}
                    onCancel={() => (isRename ? setRenaming(null) : setDraftParent(undefined))}
                    onSubmit={async (name) => {
                      try {
                        if (isRename) {
                          await renameFolder(projectId, row.folder.id, name);
                          setRenaming(null);
                        } else {
                          await createFolderIn(projectId, row.parentId, name);
                          setDraftParent(undefined);
                        }
                      } catch (cause) {
                        report(cause);
                      }
                    }}
                  />
                </li>
              );
            }

            if (row.kind === "folder") {
              const { folder, children } = row.node;
              const open = !collapsed.has(folder.id);
              const hasContent = children.length > 0 || notes.some((note) => note.folderId === folder.id);

              return (
                <li
                  key={folder.id}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={hasContent ? open : undefined}
                  draggable={!folder.system}
                  onDragStart={(event) => onDragStart(event, "folder", folder.id)}
                  onDragOver={(event) => !folder.system && onDragOver(event, folder.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => !folder.system && void onDrop(event, folder.id)}
                  className={cn(
                    "group/folder relative flex items-center rounded-md",
                    dropTarget === folder.id && "bg-primary/10 ring-1 ring-primary",
                  )}
                  style={indent(row.depth)}
                >
                  <button
                    type="button"
                    onClick={() => toggle(folder.id)}
                    aria-label={open ? t("sidebar.collapse") : t("sidebar.expand")}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
                      !hasContent && "invisible",
                    )}
                  >
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggle(folder.id)}
                    onDoubleClick={() => !folder.system && setRenaming(folder.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-sidebar-accent"
                  >
                    {folder.system ? (
                      <FolderLock className="size-4 shrink-0 text-muted-foreground" aria-label={t("system.folder")} />
                    ) : open && hasContent ? (
                      <FolderOpen className="size-4 shrink-0 text-primary" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-primary" />
                    )}
                    <span className="flex-1 truncate text-left">{folder.name}</span>
                  </button>

                  {!folder.system && (
                    <div
                      role="group"
                      aria-label={t("sidebar.actions")}
                      className="pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-r-md bg-sidebar pl-1 opacity-0 transition-opacity group-focus-within/folder:pointer-events-auto group-focus-within/folder:opacity-100 group-hover/folder:pointer-events-auto group-hover/folder:opacity-100"
                    >
                      {iconButton(t("sidebar.newNoteIn"), <FilePlus2 className="size-3.5" />, () => void newNote(folder.id))}
                      {iconButton(t("sidebar.newSubfolder"), <FolderPlus className="size-3.5" />, () => startFolder(folder.id))}
                      {iconButton(t("sidebar.rename"), <Pencil className="size-3" />, () => {
                        setDraftParent(undefined);
                        setRenaming(folder.id);
                      })}
                      {iconButton(t("sidebar.delete"), <Trash2 className="size-3" />, () => setDeleting(folder))}
                    </div>
                  )}
                </li>
              );
            }

            const tabId = noteTabId(row.note.id);
            const active = activeTab === tabId;

            return (
              <li
                key={row.note.id}
                role="treeitem"
                aria-level={row.depth + 1}
                draggable={!row.note.system}
                onDragStart={(event) => onDragStart(event, "note", row.note.id)}
                className="flex items-center"
                style={indent(row.depth)}
              >
                <span className="size-6 shrink-0" />
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenFeature(tabId)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent font-medium",
                  )}
                >
                  <NotebookText className="size-4 shrink-0 text-muted-foreground" />
                  <span className={cn("flex-1 truncate text-left", !row.note.title && "text-muted-foreground italic")}>
                    {row.note.title || untitled}
                  </span>
                  {row.note.pinned && (
                    <Pin aria-label={t("sidebar.pinned")} className="size-3 shrink-0 text-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t("folder.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("folder.deleteBody")}
        confirmLabel={t("folder.deleteConfirm")}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteFolder(projectId, deleting.id);
          setDeleting(null);
        }}
      />
    </section>
  );
}