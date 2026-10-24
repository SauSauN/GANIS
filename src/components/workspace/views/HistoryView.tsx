import { useCallback, useEffect, useMemo, useState } from "react";
import { doubleClickHint, onRowDoubleClick } from "@/lib/doubleClick";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Folder,
  ListTree,
  MapPin,
  MapPinned,
  Megaphone,
  Network,
  NotebookText,
  Paperclip,
  RefreshCw,
  RotateCcw,
  StickyNote,
  UserRound,
  Waypoints,
  type LucideIcon,
  LayoutPanelTop,
  Package,
  PawPrint,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { itemTabId } from "@/lib/search";
import { restoreFromTrash } from "@/lib/trash";
import { cn } from "@/lib/utils";
import { useTrashStore } from "@/stores/trashStore";
import type { Activity, HistoryKind } from "@/types";
import { errorText } from "@/lib/errors";

const ICONS: Record<HistoryKind, LucideIcon> = {
  character: UserRound,
  location: MapPinned,
  structureNode: ListTree,
  document: Paperclip,
  note: NotebookText,
  noteFolder: Folder,
  sticky: StickyNote,
  relation: Network,
  placeLink: MapPin,
  item: Package,
  species: PawPrint,
  worldLink: Link2,
  mangaPanel: LayoutPanelTop,
  synopsis: FileText,
  plot: Waypoints,
  editorial: Megaphone,
};

const KINDS = Object.keys(ICONS) as HistoryKind[];

interface HistoryViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Jour (« lundi 12 octobre ») et heure (« 14:32 ») dans la langue de l'interface. */
function dayOf(iso: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
function timeOf(iso: string, language: string) {
  return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Historique du projet : ce qui a été créé, modifié, supprimé ou restauré,
 * jour par jour (90 derniers jours). Un clic ouvre l'élément ; un élément
 * supprimé encore dans la corbeille peut être restauré d'ici.
 */
export function HistoryView({ projectId, feature, onOpenFeature }: HistoryViewProps) {
  const { t, i18n } = useTranslation(["history", "trash"]);
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<HistoryKind | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  // La corbeille sert à savoir si un élément supprimé peut encore revenir.
  const trash = useTrashStore((state) => (state.projectId === projectId ? state.items : null));
  const fetchTrash = useTrashStore((state) => state.fetchTrash);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.listActivity(projectId, { kind: kind || undefined, limit: 500 }));
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [projectId, kind]);

  useEffect(() => {
    void load();
    void fetchTrash(projectId);
  }, [load, fetchTrash, projectId]);

  const days = useMemo(() => {
    const groups: Array<{ day: string; items: Activity[] }> = [];
    for (const item of items ?? []) {
      const day = dayOf(item.at, i18n.language);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }
    return groups;
  }, [items, i18n.language]);

  const inTrash = (item: Activity) => item.action === "deleted" && (trash ?? []).some((entry) => entry.id === item.detail);

  async function restore(item: Activity) {
    setBusy(item.id);
    try {
      if (await restoreFromTrash(projectId, item.detail)) await load();
    } finally {
      setBusy(null);
    }
  }

  const name = (item: Activity) =>
    item.kind === "synopsis" || item.kind === "editorial" ? tt(`kinds.${item.kind}`) : item.label.trim() || tt(`trash:untitled.${item.kind}`);

  return (
    <PageShell
      title={feature.label}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <select
            aria-label={t("filter")}
            value={kind}
            onChange={(event) => setKind(event.target.value as HistoryKind | "")}
            className={cn(fieldClass, "h-9 w-52")}
          >
            <option value="">{t("all")}</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {tt(`kinds.${value}`)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="icon" onClick={() => void load()} title={t("refresh")} aria-label={t("refresh")}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {items === null && !error ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : days.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="space-y-6">
          {days.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase first-letter:uppercase">
                {group.day}
              </h2>
              <ol className="divide-y rounded-xl border bg-card shadow-sm">
                {group.items.map((item) => {
                  const Icon = ICONS[item.kind] ?? FileText;
                  // Document : sa fiche est celle de l'élément du découpage qui le contient.
                  const target = item.kind === "document" ? item.detail : item.itemId;
                  const tab = item.action === "deleted" || !target ? null : itemTabId(item.kind, target);
                  return (
                    <li
                      key={item.id}
                      // Double-clic sur l'entrée : ouvre l'élément, s'il existe encore.
                      onDoubleClick={tab ? onRowDoubleClick(() => onOpenFeature(tab)) : undefined}
                      title={tab ? doubleClickHint("openItem") : undefined}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{timeOf(item.at, i18n.language)}</span>
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <p className="min-w-0 flex-1 text-sm">
                        <span className="text-muted-foreground">{tt(`actions.${item.action}`)} </span>
                        {tab ? (
                          <button type="button" onClick={() => onOpenFeature(tab)} className="font-medium hover:text-primary hover:underline">
                            {name(item)}
                          </button>
                        ) : (
                          <span className="font-medium">{name(item)}</span>
                        )}
                        <span className="text-muted-foreground"> · {tt(`kinds.${item.kind}`)}</span>
                      </p>
                      {inTrash(item) && (
                        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void restore(item)}>
                          <RotateCcw className="mr-1.5 size-3.5" />
                          {t("restore")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
