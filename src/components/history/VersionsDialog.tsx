import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, History, RotateCcw, Trash2, X } from "lucide-react";
import { formatNoteDate } from "@/components/notes/FolderSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { discardEntries, UnsavedTabContext, useUnsavedStore } from "@/lib/unsavedChanges";
import { changedFields, diffWords, readableFields, type FieldChange } from "@/lib/versions";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/characters";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useWorldStore } from "@/stores/worldStore";
import { useNoteStore } from "@/stores/noteStore";
import { usePlotStore } from "@/stores/plotStore";
import { useReloadStore } from "@/stores/reloadStore";
import { useStructureStore } from "@/stores/structureStore";
import { useSynopsisStore } from "@/stores/synopsisStore";
import { toast } from "@/stores/toastStore";
import type { Version, VersionKind, VersionList } from "@/types";
import { errorText } from "@/lib/errors";

interface VersionsDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  kind: VersionKind;
  itemId: string;
  /** Nom de l'élément (titre de la fenêtre). */
  name: string;
}

/** Nom d'un personnage ou d'un lieu à partir de son identifiant. */
function useResolver() {
  const characters = useCharacterStore((state) => state.characters);
  const locations = useLocationStore((state) => state.locations);
  const items = useWorldStore((state) => state.item.entries);
  const species = useWorldStore((state) => state.species.entries);
  return useCallback(
    (id: string) => {
      const character = characters.find((item) => item.id === id);
      if (character) return fullName(character);
      return (
        locations.find((item) => item.id === id)?.name ??
        items.find((item) => item.id === id)?.name ??
        species.find((item) => item.id === id)?.name ??
        null
      );
    },
    [characters, locations, items, species],
  );
}

/** Relit les stores de l'élément après une restauration. */
async function refresh(projectId: string, kind: VersionKind) {
  switch (kind) {
    case "character":
      await useCharacterStore.getState().fetchCharacters(projectId);
      break;
    case "location":
      await useLocationStore.getState().fetchLocations(projectId);
      break;
    case "item":
    case "species":
      await useWorldStore.getState().fetchEntries(projectId, kind);
      break;
    case "structureNode":
      await useStructureStore.getState().fetchStructure(projectId);
      break;
    case "note":
      await useNoteStore.getState().fetchNotes(projectId);
      break;
    case "synopsis":
      await useSynopsisStore.getState().fetchSynopsis(projectId);
      break;
    case "plot":
      await usePlotStore.getState().reload(projectId);
      break;
  }
}

function Diff({ change }: { change: FieldChange }) {
  const parts = useMemo(() => diffWords(change.before, change.after), [change.before, change.after]);
  return (
    <p className="text-sm leading-6 break-words whitespace-pre-wrap">
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn(
            part.kind === "removed" && "rounded-sm bg-destructive/15 text-destructive line-through decoration-destructive/50",
            part.kind === "added" && "rounded-sm bg-success/15 text-success",
          )}
        >
          {part.text}
        </span>
      ))}
    </p>
  );
}

/**
 * Versions d'un élément : liste des versions, comparaison avec l'état
 * actuel (supprimé en rouge, ajouté en vert), restauration et versions
 * nommées.
 */
export function VersionsDialog({ open, onClose, projectId, kind, itemId, name }: VersionsDialogProps) {
  const { t, i18n } = useTranslation(["versions", "common", "characters", "locations", "synopsis"]);
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const tab = useContext(UnsavedTabContext);
  const dirty = useUnsavedStore((state) => (tab ? tab.id in state.entries : false));
  const bump = useReloadStore((state) => state.bump);
  const resolve = useResolver();

  const [list, setList] = useState<VersionList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  /** Version dont la suppression attend une confirmation (deuxième clic). */
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.listVersions(projectId, kind, itemId);
      setList(result);
      setSelected((current) =>
        current && result.versions.some((v) => v.id === current) ? current : (result.versions[0]?.id ?? null),
      );
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [projectId, kind, itemId]);

  useEffect(() => {
    if (open) {
      setList(null);
      setNewName("");
      void load();
    }
  }, [open, load]);

  const version: Version | undefined = list?.versions.find((item) => item.id === selected);

  const changes = useMemo(() => {
    if (!list || !version) return [];
    return changedFields(readableFields(kind, version.data, resolve), readableFields(kind, list.current, resolve));
  }, [list, version, kind, resolve]);

  /** Libellé traduit ; champ sans traduction : son nom technique. */
  const labelOf = (label: string) => (i18n.exists(label) ? tt(label) : (label.split(".").pop() ?? label));

  async function restore() {
    if (!version) return;
    setBusy(true);
    try {
      await api.restoreVersion(projectId, version.id);
      await refresh(projectId, kind);
      if (tab) {
        // L'écran est recréé avec l'état restauré.
        discardEntries([tab.id]);
        bump(tab.id);
      }
      toast({ message: t("restored", { date: formatNoteDate(version.createdAt, i18n.language) }), tone: "success" });
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function createNamed() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await api.createVersion(projectId, kind, itemId, newName);
      setNewName("");
      await load();
      setSelected(created.id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    // Suppression définitive : un premier clic demande confirmation.
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    setConfirming(null);
    setBusy(true);
    try {
      await api.deleteVersion(projectId, id);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !busy && onClose()} className="flex h-[min(44rem,calc(100vh-2rem))] max-w-5xl flex-col p-0">
      <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            {t("title", { name })}
          </DialogTitle>
          <DialogDescription className="mt-1.5">{t("description")}</DialogDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common:actions.close")}
          title={t("common:actions.close")}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {error && (
        <p role="alert" className="border-b bg-destructive/5 px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Liste des versions */}
        <div className="flex w-72 shrink-0 flex-col border-r">
          <form
            className="flex gap-2 border-b p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void createNamed();
            }}
          >
            <input
              value={newName}
              maxLength={100}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("namePlaceholder")}
              aria-label={t("namePlaceholder")}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !newName.trim()} title={t("create")}>
              <Bookmark className="size-3.5" />
            </Button>
          </form>

          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={t("listLabel")}>
            {list === null && !error && <li className="p-3 text-sm text-muted-foreground">{t("loading")}</li>}
            {list?.versions.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("none")}</li>}
            {list?.versions.map((item) => (
              <li key={item.id} className="group/version relative">
                <button
                  type="button"
                  aria-current={item.id === selected ? "true" : undefined}
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-3 py-2 pr-9 text-left hover:bg-accent",
                    item.id === selected && "bg-primary/10",
                  )}
                >
                  <span className="text-sm font-medium">{formatNoteDate(item.createdAt, i18n.language)}</span>
                  <span className={cn("truncate text-xs", item.name ? "text-primary" : "text-muted-foreground")}>
                    {item.name || t("auto")}
                  </span>
                </button>
                {confirming === item.id ? (
                  <button
                    type="button"
                    autoFocus
                    disabled={busy}
                    onClick={() => void remove(item.id)}
                    onBlur={() => setConfirming(null)}
                    onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setConfirming(null))}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded bg-destructive px-2 py-1 text-xs font-medium text-white"
                  >
                    {t("deleteConfirm")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(item.id)}
                    title={t("delete")}
                    aria-label={t("delete")}
                    className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/version:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Comparaison */}
        <div className="flex min-w-0 flex-1 flex-col">
          {version ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3 text-xs text-muted-foreground">
                <span>{t("compare", { date: formatNoteDate(version.createdAt, i18n.language) })}</span>
                <span className="flex items-center gap-1">
                  <span className="rounded-sm bg-destructive/15 px-1 text-destructive line-through">{t("legend.removed")}</span>
                  <span className="rounded-sm bg-success/15 px-1 text-success">{t("legend.added")}</span>
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {changes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("identical")}</p>
                ) : (
                  changes.map((change) => (
                    <section key={change.key} className="space-y-1">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{labelOf(change.label)}</h3>
                      <Diff change={change} />
                    </section>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-3">
                {dirty && <p className="mr-auto text-xs text-warning">{t("unsavedWarning")}</p>}
                <Button disabled={busy || changes.length === 0} onClick={() => void restore()}>
                  <RotateCcw className="mr-1.5 size-4" />
                  {t("restore")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {list && list.versions.length === 0 ? t("noneHint") : null}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Bouton « Versions » des écrans (note, synopsis, fiches). */
export function VersionsButton(props: Omit<VersionsDialogProps, "open" | "onClose"> & { className?: string }) {
  const { t } = useTranslation("versions");
  const [open, setOpen] = useState(false);
  const { className, ...rest } = props;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={className} title={t("buttonHint")}>
        <History className="mr-1.5 size-4" />
        {t("button")}
      </Button>
      <VersionsDialog {...rest} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
