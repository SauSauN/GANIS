import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  ListTree,
  Paperclip,
  MapPin,
  MapPinned,
  Network,
  NotebookText,
  RefreshCw,
  RotateCcw,
  StickyNote,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { formatNoteDate } from "@/components/notes/FolderSelect";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { restoreFromTrash, trashLabel } from "@/lib/trash";
import { useTrashStore } from "@/stores/trashStore";
import type { TrashItem, TrashKind } from "@/types";

const NO_ITEMS: TrashItem[] = [];

const KIND_ICONS: Record<TrashKind, LucideIcon> = {
  character: UserRound,
  location: MapPinned,
  structureNode: ListTree,
  document: Paperclip,
  note: NotebookText,
  noteFolder: Folder,
  sticky: StickyNote,
  relation: Network,
  placeLink: MapPin,
};

interface TrashViewProps {
  projectId: string;
  feature: WorkspaceFeature;
}

/**
 * Corbeille du projet : les éléments supprimés depuis moins de 30 jours,
 * à restaurer (avec tout ce qui avait disparu avec eux) ou à supprimer
 * définitivement.
 */
export function TrashView({ projectId, feature }: TrashViewProps) {
  const { t, i18n } = useTranslation("trash");
  const mine = useTrashStore((state) => state.projectId === projectId);
  const items = useTrashStore((state) => (mine ? state.items : NO_ITEMS));
  const loaded = useTrashStore((state) => mine && state.loaded);
  const error = useTrashStore((state) => (mine ? state.error : null));
  const fetchTrash = useTrashStore((state) => state.fetchTrash);
  const purge = useTrashStore((state) => state.purge);
  const empty = useTrashStore((state) => state.empty);

  const [busy, setBusy] = useState<string | null>(null);
  const [toPurge, setToPurge] = useState<TrashItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    void fetchTrash(projectId);
  }, [fetchTrash, projectId]);

  async function restore(item: TrashItem) {
    setBusy(item.id);
    try {
      await restoreFromTrash(projectId, item.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell
      title={feature.label}
      description={t("view.description")}
      actions={
        items.length > 0 ? (
          <Button variant="destructive" onClick={() => setConfirmEmpty(true)}>
            <Trash2 className="mr-1.5 size-4" />
            {t("view.empty")}
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-destructive">
          {error}
          <Button variant="outline" size="sm" onClick={() => void fetchTrash(projectId)}>
            <RefreshCw className="mr-1.5 size-3.5" />
            {t("view.retry")}
          </Button>
        </div>
      )}

      {!loaded && !error ? (
        <p className="text-sm text-muted-foreground">{t("view.loading")}</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <Trash2 className="mx-auto mb-3 size-8 opacity-40" />
          {t("view.nothing")}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-sm">
          {items.map((item) => {
            const Icon = KIND_ICONS[item.kind] ?? Trash2;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{trashLabel(item.kind, item.label)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`kinds.${item.kind}`)} · {t("view.deletedOn", { date: formatNoteDate(item.deletedAt, i18n.language) })}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void restore(item)}>
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {busy === item.id ? t("view.restoring") : t("view.restore")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy !== null}
                  title={t("view.purge")}
                  aria-label={t("view.purgeNamed", { name: trashLabel(item.kind, item.label) })}
                  onClick={() => setToPurge(item)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toPurge !== null}
        title={t("view.purgeTitle", { name: toPurge ? trashLabel(toPurge.kind, toPurge.label) : "" })}
        description={t("view.purgeBody")}
        confirmLabel={t("view.purge")}
        onCancel={() => setToPurge(null)}
        onConfirm={async () => {
          if (!toPurge) return;
          await purge(projectId, toPurge.id);
          setToPurge(null);
        }}
      />

      <ConfirmDialog
        open={confirmEmpty}
        title={t("view.emptyTitle")}
        description={t("view.emptyBody", { count: items.length })}
        confirmLabel={t("view.empty")}
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={async () => {
          await empty(projectId);
          setConfirmEmpty(false);
        }}
      />
    </PageShell>
  );
}
