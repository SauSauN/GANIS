import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  ExternalLink,
  Eye,
  FilePlus2,
  FolderInput,
  History,
  Loader2,
  MessageSquareText,
  Paperclip,
  PencilLine,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { SelectionBar, SelectionCheckbox } from "@/components/common/SelectionBar";
import { ActionMenu, type MenuItem } from "@/components/documents/ActionMenu";
import { DocumentIcon } from "@/components/documents/DocumentIcon";
import { DocumentVersionsDialog } from "@/components/documents/DocumentVersionsDialog";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { ReadingView } from "@/components/documents/ReadingView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import {
  canOpenExternally,
  errorText,
  extensionOf,
  finishExternal,
  formatSize,
  MAX_DOCUMENT_BYTES,
  moveInList,
  openExternally,
  readingPages,
  stemOf,
  useDocumentStore,
  useNodeDocuments,
} from "@/lib/documents";
import { announceDeletion, announceDeletions } from "@/lib/trash";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toastStore";
import type { StructureDocument } from "@/types";

export interface NodeOption {
  id: string;
  label: string;
  depth: number;
}

interface DocumentsCardProps {
  projectId: string;
  nodeId: string;
  /** Nom de l'élément (« Chapitre 1 — Le départ »). */
  name: string;
  /** Éléments du découpage, dans l'ordre du plan (« Ranger dans… »). */
  nodeOptions: NodeOption[];
}

/**
 * Documents rangés dans un élément du découpage : tout le chapitre de
 * manga (une image par page), le PDF envoyé à l'éditeur, le scénario en
 * Word, des repères sonores… On les ajoute (bouton ou glisser-déposer), on
 * les lit dans GANIS, on les modifie dans l'application de son choix.
 */
export function DocumentsCard({ projectId, nodeId, name, nodeOptions }: DocumentsCardProps) {
  const { t, i18n } = useTranslation(["documents", "common"]);
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.documents.collapsed");
  const { documents } = useNodeDocuments(projectId, nodeId);
  const setNode = useDocumentStore((state) => state.setNode);
  const upsert = useDocumentStore((state) => state.upsert);
  const removeDocument = useDocumentStore((state) => state.remove);
  const external = useDocumentStore((state) => state.external);

  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [versionsOf, setVersionsOf] = useState<StructureDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [noteOf, setNoteOf] = useState<{ document: StructureDocument; value: string } | null>(null);
  const [moving, setMoving] = useState<{ document: StructureDocument; target: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const list = documents ?? [];
  const selection = useSelection(list.map((document) => document.id));
  const pages = readingPages(list);
  const openHere = list.filter((document) => external[document.id]);

  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(iso));

  // --- Ajout ---------------------------------------------------------------

  async function pick() {
    setBusy(t("adding.picking"));
    try {
      const added = await api.pickStructureDocuments(projectId, nodeId, t("dialogs.add", { name }));
      added.forEach((document) => upsert(projectId, document));
      if (added.length) toast({ message: t("adding.done", { count: added.length }), tone: "success" });
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function addFiles(files: File[]) {
    const tooBig = files.filter((file) => file.size > MAX_DOCUMENT_BYTES);
    const accepted = files.filter((file) => file.size <= MAX_DOCUMENT_BYTES);
    if (tooBig.length) {
      toast({ message: t("adding.tooLarge", { names: tooBig.map((file) => file.name).join(", ") }), tone: "error" });
    }
    let added = 0;
    try {
      for (const [index, file] of accepted.entries()) {
        setBusy(t("adding.progress", { index: index + 1, count: accepted.length, name: file.name }));
        const document = await api.addStructureDocument(projectId, nodeId, file.name, await file.arrayBuffer());
        upsert(projectId, document);
        added++;
      }
      if (added) toast({ message: t("adding.done", { count: added }), tone: "success" });
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function newText() {
    try {
      const document = await api.addStructureDocument(projectId, nodeId, t("newTextName"), new Uint8Array());
      upsert(projectId, document);
      setViewing(document.id);
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    }
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!open) setOpen(true);
      const files = Array.from(event.dataTransfer.files);
      if (files.length) void addFiles(files);
    },
  };

  // --- Actions sur un document ---------------------------------------------

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    }
  }

  const reorder = (index: number, delta: number) =>
    run(async () => {
      const next = moveInList(list, index, delta);
      if (next === list) return;
      setNode(projectId, nodeId, next.map((document, position) => ({ ...document, position })));
      setNode(projectId, nodeId, await api.reorderStructureDocuments(projectId, nodeId, next.map((document) => document.id)));
      // Le focus suit le document déplacé.
      window.setTimeout(() => listRef.current?.querySelectorAll<HTMLElement>("[data-row]")[index + delta]?.focus(), 0);
    });

  const remove = (document: StructureDocument) =>
    run(async () => {
      if (external[document.id]) await finishExternal(projectId, document.id);
      const trashId = await api.deleteStructureDocument(projectId, document.id);
      removeDocument(projectId, document.id);
      announceDeletion(projectId, trashId, "document", document.name);
    });

  /** Sélection multiple : documents mis à la corbeille ensemble (un seul « Annuler »). */
  async function removeSelected() {
    const chosen = list.filter((document) => selection.isSelected(document.id));
    const trashIds: string[] = [];
    setBusy(t("selection.deleting", { count: chosen.length }));
    try {
      for (const document of chosen) {
        if (external[document.id]) await finishExternal(projectId, document.id);
        trashIds.push(await api.deleteStructureDocument(projectId, document.id));
        removeDocument(projectId, document.id);
      }
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    } finally {
      announceDeletions(projectId, trashIds);
      selection.clear();
      setBusy(null);
    }
  }

  /** Sélection multiple : documents déplacés vers un autre élément du découpage. */
  async function moveSelected(target: string) {
    const chosen = list.filter((document) => selection.isSelected(document.id));
    let moved = 0;
    setBusy(t("selection.moving", { count: chosen.length }));
    try {
      for (const document of chosen) {
        const updated = await api.moveStructureDocument(projectId, document.id, target);
        removeDocument(projectId, document.id);
        upsert(projectId, updated);
        moved++;
      }
      const label = nodeOptions.find((option) => option.id === target)?.label ?? "";
      toast({ message: t("selection.moved", { count: moved, target: label }), tone: "success" });
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    } finally {
      selection.clear();
      setBusy(null);
    }
  }

  const saveAs = (document: StructureDocument) =>
    run(async () => {
      const written = await api.saveStructureDocumentAs(projectId, document.id, null, t("dialogs.saveAs"));
      if (written) toast({ message: t("saved", { name: written }), tone: "success" });
    });

  const replace = (document: StructureDocument) =>
    run(async () => {
      const updated = await api.pickStructureDocumentReplacement(projectId, document.id, t("dialogs.replace", { name: document.name }));
      if (updated) {
        upsert(projectId, updated);
        toast({ message: t("replaced", { name: updated.name }), tone: "success" });
      }
    });

  async function commitRename() {
    if (!renaming) return;
    const { id, value } = renaming;
    setRenaming(null);
    const document = list.find((item) => item.id === id);
    if (!document || !value.trim() || value.trim() === document.name) return;
    await run(async () => upsert(projectId, await api.renameStructureDocument(projectId, id, value.trim())));
  }

  async function commitNote() {
    if (!noteOf) return;
    const { document, value } = noteOf;
    setNoteOf(null);
    if (value.trim() === document.note) return;
    await run(async () => upsert(projectId, await api.updateStructureDocumentNote(projectId, document.id, value)));
  }

  async function commitMove() {
    if (!moving) return;
    const { document, target } = moving;
    setMoving(null);
    if (target === document.nodeId) return;
    await run(async () => {
      const moved = await api.moveStructureDocument(projectId, document.id, target);
      removeDocument(projectId, document.id);
      upsert(projectId, moved);
      const label = nodeOptions.find((option) => option.id === target)?.label ?? "";
      toast({ message: t("moved", { name: moved.name, target: label }), tone: "success" });
    });
  }

  function menuItems(document: StructureDocument, index: number): MenuItem[] {
    return [
      { id: "open", label: t("actions.open"), icon: Eye, hint: t("keys.enter"), run: () => setViewing(document.id) },
      {
        id: "external",
        label: t("actions.openExternal"),
        icon: ExternalLink,
        disabled: !canOpenExternally(document.name),
        run: () => void openExternally(projectId, document),
      },
      { id: "rename", label: t("actions.rename"), icon: PencilLine, hint: "F2", separated: true, run: () => setRenaming({ id: document.id, value: document.name }) },
      { id: "note", label: document.note ? t("actions.editNote") : t("actions.addNote"), icon: MessageSquareText, run: () => setNoteOf({ document, value: document.note }) },
      { id: "replace", label: t("actions.replace"), icon: RefreshCw, run: () => void replace(document) },
      { id: "versions", label: t("actions.versionsCount", { count: document.versions }), icon: History, run: () => setVersionsOf(document) },
      { id: "saveAs", label: t("actions.saveAs"), icon: Download, run: () => void saveAs(document) },
      { id: "move", label: t("actions.move"), icon: FolderInput, separated: true, disabled: nodeOptions.length < 2, run: () => setMoving({ document, target: document.nodeId }) },
      { id: "up", label: t("actions.up"), icon: ArrowUp, hint: "Alt+↑", disabled: index === 0, run: () => void reorder(index, -1) },
      { id: "down", label: t("actions.down"), icon: ArrowDown, hint: "Alt+↓", disabled: index === list.length - 1, run: () => void reorder(index, 1) },
      { id: "delete", label: t("actions.delete"), icon: Trash2, hint: t("keys.delete"), danger: true, separated: true, run: () => void remove(document) },
    ];
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, document: StructureDocument, index: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      setViewing(document.id);
    } else if (event.key === "F2") {
      event.preventDefault();
      setRenaming({ id: document.id, value: document.name });
    } else if (event.key === "Delete") {
      event.preventDefault();
      void remove(document);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      void reorder(index, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-row]");
      rows?.[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    }
  }

  return (
    <>
      <CollapsibleCard
        open={open}
        onOpenChange={setOpen}
        icon={Paperclip}
        title={t("title")}
        description={t("description", { name })}
        count={documents ? list.length : undefined}
        actions={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => void newText()}
              aria-label={t("actions.newText")}
              title={`${t("actions.newText")} : ${t("actions.newTextHint")}`}
            >
              <FilePlus2 />
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void pick()}>
              <Upload />
              <span className="hidden sm:inline">{t("actions.add")}</span>
            </Button>
          </div>
        }
      >
        <div {...dropHandlers} className="relative space-y-3">
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
              {t("dropHere", { name })}
            </div>
          )}

          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="truncate">{busy}</span>
            </p>
          )}

          {openHere.map((document) => (
            <div key={document.id} role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <ExternalLink className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t("external.open", { name: document.name })}</span>
                <span className="block text-xs text-muted-foreground">{t("external.hint")}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => void finishExternal(projectId, document.id)}>
                {t("external.finish")}
              </Button>
            </div>
          ))}

          {documents === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </p>
          ) : list.length === 0 ? (
            <button
              type="button"
              onClick={() => void pick()}
              className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <Upload className="size-5" />
              <span className="font-medium text-foreground">{t("empty.title")}</span>
              <span className="max-w-md text-xs">{t("empty.hint")}</span>
            </button>
          ) : (
            <>
              {pages.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setReading(true)}>
                    <BookOpen />
                    {t("reading.open", { count: pages.length })}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("reading.hint")}</span>
                </div>
              )}

              {list.length > 1 && (
                <SelectionBar selection={selection} disabled={busy !== null}>
                  {nodeOptions.length > 1 && (
                    <select
                      aria-label={t("selection.moveTo")}
                      value=""
                      disabled={busy !== null}
                      onChange={(event) => event.target.value && void moveSelected(event.target.value)}
                      className={cn(fieldClass, "h-8 w-52")}
                    >
                      <option value="">{t("selection.moveTo")}</option>
                      {nodeOptions
                        .filter((option) => option.id !== nodeId)
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {"  ".repeat(option.depth)}
                            {option.label}
                          </option>
                        ))}
                    </select>
                  )}
                  <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => void removeSelected()}>
                    <Trash2 />
                    {t("selection.delete")}
                  </Button>
                </SelectionBar>
              )}

              <ul ref={listRef} className="divide-y rounded-lg border" aria-label={t("title")}>
                {list.map((document, index) => (
                  <li
                    key={document.id}
                    data-row
                    tabIndex={0}
                    onKeyDown={(event) => onRowKeyDown(event, document, index)}
                    onDoubleClick={() => setViewing(document.id)}
                    aria-label={document.name}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2 outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      selection.isSelected(document.id) && "bg-accent/60",
                    )}
                  >
                    {list.length > 1 && (
                      <SelectionCheckbox
                        selection={selection}
                        id={document.id}
                        label={t("selection.select", { name: document.name })}
                        disabled={busy !== null}
                      />
                    )}
                    <DocumentIcon document={document} />
                    <div className="min-w-0 flex-1">
                      {renaming?.id === document.id ? (
                        <input
                          autoFocus
                          value={renaming.value}
                          maxLength={180}
                          aria-label={t("actions.rename")}
                          onFocus={(event) => event.target.setSelectionRange(0, stemOf(renaming.value).length)}
                          onChange={(event) => setRenaming({ id: document.id, value: event.target.value })}
                          onBlur={() => void commitRename()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void commitRename();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              event.stopPropagation();
                              setRenaming(null);
                            }
                          }}
                          className={cn(fieldClass, "h-8")}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setViewing(document.id)}
                          className="block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline"
                          title={t("actions.openNamed", { name: document.name })}
                        >
                          {document.name}
                        </button>
                      )}
                      <p className="truncate text-xs text-muted-foreground">
                        {[extensionOf(document.name) || t("kinds.other"), formatSize(document.size), t("updatedOn", { date: date(document.updatedAt) }), document.versions ? t("versionsShort", { count: document.versions }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {document.note && (
                        <button
                          type="button"
                          onClick={() => setNoteOf({ document, value: document.note })}
                          className="mt-0.5 line-clamp-2 text-left text-xs text-foreground/80 italic hover:text-primary"
                        >
                          {document.note}
                        </button>
                      )}
                    </div>
                    {external[document.id] && (
                      <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] text-primary sm:inline">{t("external.badge")}</span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setViewing(document.id)}
                      aria-label={t("actions.openNamed", { name: document.name })}
                      title={t("actions.open")}
                      className="text-muted-foreground"
                    >
                      <Eye />
                    </Button>
                    {canOpenExternally(document.name) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void openExternally(projectId, document)}
                        aria-label={t("actions.openExternalNamed", { name: document.name })}
                        title={t("actions.openExternalHint")}
                        className="text-muted-foreground"
                      >
                        <ExternalLink />
                      </Button>
                    )}
                    <ActionMenu label={t("actions.more", { name: document.name })} items={menuItems(document, index)} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("dropHint")}</p>
            </>
          )}
        </div>
      </CollapsibleCard>

      <DocumentViewer
        projectId={projectId}
        documents={list}
        documentId={viewing}
        onClose={() => setViewing(null)}
        onShowVersions={setVersionsOf}
        onSaveAs={(document) => void saveAs(document)}
      />

      {reading && <ReadingView projectId={projectId} title={name} pages={pages} onClose={() => setReading(false)} />}

      <DocumentVersionsDialog projectId={projectId} document={versionsOf} onClose={() => setVersionsOf(null)} />

      <Dialog open={noteOf !== null} onOpenChange={(value) => !value && setNoteOf(null)}>
        <DialogHeader>
          <DialogTitle>{t("note.title", { name: noteOf?.document.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("note.description")}</DialogDescription>
        </DialogHeader>
        <textarea
          rows={5}
          maxLength={2000}
          value={noteOf?.value ?? ""}
          onChange={(event) => noteOf && setNoteOf({ ...noteOf, value: event.target.value })}
          placeholder={t("note.placeholder")}
          className={cn(fieldClass, "mt-4 resize-y py-2 leading-6")}
        />
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={() => setNoteOf(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void commitNote()}>{t("common:actions.save")}</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={moving !== null} onOpenChange={(value) => !value && setMoving(null)}>
        <DialogHeader>
          <DialogTitle>{t("move.title", { name: moving?.document.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("move.description")}</DialogDescription>
        </DialogHeader>
        <select
          aria-label={t("move.label")}
          value={moving?.target ?? ""}
          onChange={(event) => moving && setMoving({ ...moving, target: event.target.value })}
          className={cn(fieldClass, "mt-4 h-9")}
        >
          {nodeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {"  ".repeat(option.depth)}
              {option.label}
              {option.id === nodeId ? ` (${t("move.current")})` : ""}
            </option>
          ))}
        </select>
        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={() => setMoving(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button disabled={!moving || moving.target === moving.document.nodeId} onClick={() => void commitMove()}>
            {t("move.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}