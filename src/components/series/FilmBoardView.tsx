import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingDots } from "@/components/common/LoadingDots";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { episodesInOrder, seriesLevels } from "@/lib/series";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import type { Project, StructureNode } from "@/types";
import { useFilmScript } from "./useFilmScript";

/** Couleurs des actes quand le découpage n'en donne pas. */
const ACT_COLORS = ["#b5523b", "#3d6fb6", "#c9a227", "#4f8a5b", "#6b4f8a", "#8c2f39"];

interface FilmBoardViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Tableau de liège : une colonne par séquence, une carte par scène (numéro,
 * en-tête, résumé, durée), couleur de son acte. Glisser une carte la place
 * dans la séquence et au rang où on la dépose ; le découpage suit.
 * Double-cliquer ouvre la scène.
 */
export function FilmBoardView({ project, feature, onOpenFeature }: FilmBoardViewProps) {
  const { t } = useTranslation("series");
  const script = useFilmScript(project);
  const { structure, levelCount, entries, numbers, times, headingOf, labelOf, colorOf, duration, loading } = script;
  const fetchStructure = useStructureStore((s) => s.fetchStructure);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: string; index: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Colonnes : les séquences (ou épisodes) dans l'ordre, avec leurs scènes.
  const columns = useMemo(() => {
    if (!structure) return [];
    const actLevel = seriesLevels(levelCount).episode - 1;
    const byId = new Map(structure.nodes.map((n) => [n.id, n]));
    const actOf = (node: StructureNode) => {
      let current = node.parentId ? byId.get(node.parentId) : undefined;
      while (current && current.level > actLevel) current = current.parentId ? byId.get(current.parentId) : undefined;
      return actLevel >= 0 && current?.level === actLevel ? current : null;
    };
    const acts: string[] = [];
    return episodesInOrder(structure.nodes, levelCount).map((sequence) => {
      const act = actOf(sequence);
      if (act && !acts.includes(act.id)) acts.push(act.id);
      const color = act ? colorOf(act) || ACT_COLORS[acts.indexOf(act.id) % ACT_COLORS.length] : "#8a97a5";
      return { sequence, act, color, scenes: entries.filter((e) => e.episode?.id === sequence.id).map((e) => e.scene) };
    });
  }, [structure, levelCount, entries, colorOf]);

  async function drop(columnId: string, index: number) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    const column = columns.find((c) => c.sequence.id === columnId);
    const from = column?.scenes.findIndex((s) => s.id === id) ?? -1;
    // Déposée à sa propre place : rien ne change.
    if (from >= 0 && (index === from || index === from + 1)) return;
    const target = from >= 0 && index > from ? index - 1 : index;
    setBusy(true);
    try {
      await api.placeStructureNode(project.id, id, columnId, target);
      await fetchStructure(project.id);
    } catch (e) {
      notifyError(errorText(e), "series:board");
    } finally {
      setBusy(false);
    }
  }

  const dropZone = (columnId: string, index: number) => (
    <div
      key={`z-${columnId}-${index}`}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        setOver({ column: columnId, index });
      }}
      onDrop={(e) => {
        e.preventDefault();
        void drop(columnId, index);
      }}
      className={cn("h-2 rounded transition-all", over?.column === columnId && over.index === index && "h-10 border-2 border-dashed border-primary/60 bg-primary/5")}
    />
  );

  let lastAct: string | null | undefined;

  return (
    <PageShell title={feature.label} description={t("board.description")}>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoadingDots className="size-4" aria-hidden="true" />
          {t("read.loading")}
        </p>
      ) : columns.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("film.progressEmpty")}</p>
      ) : (
        <div className={cn("flex gap-4 overflow-x-auto pb-4", busy && "pointer-events-none opacity-70")} data-testid="scene-board">
          {columns.map((col) => {
            const actChanged = (col.act?.id ?? null) !== lastAct;
            lastAct = col.act?.id ?? null;
            return (
              <section key={col.sequence.id} className="flex w-64 shrink-0 flex-col" aria-label={labelOf(col.sequence)}>
                <p className="mb-1 h-4 truncate text-xs font-semibold uppercase tracking-wide" style={{ color: col.color }}>
                  {actChanged && col.act ? labelOf(col.act) : ""}
                </p>
                <header className="mb-2 rounded-lg border-t-4 bg-card px-3 py-2 shadow-sm" style={{ borderTopColor: col.color }}>
                  <button type="button" className="block w-full truncate text-left text-sm font-semibold hover:underline" onClick={() => onOpenFeature(structureNodeTabId(col.sequence.id))}>
                    {labelOf(col.sequence)}
                  </button>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t("dossier.sequenceMeta", { count: col.scenes.length, duration: duration(col.scenes.reduce((sum, s) => sum + (times.get(s.id)?.minutes ?? 0), 0)) })}
                  </p>
                </header>
                <div className="flex min-h-24 flex-1 flex-col rounded-lg bg-muted/40 p-2">
                  {dropZone(col.sequence.id, 0)}
                  {col.scenes.map((scene, index) => [
                    <article
                      key={scene.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", scene.id);
                        setDragging(scene.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onDoubleClick={() => onOpenFeature(structureNodeTabId(scene.id))}
                      className={cn(
                        "cursor-grab rounded-md border-l-4 bg-card px-3 py-2 shadow-sm active:cursor-grabbing",
                        dragging === scene.id && "opacity-40",
                      )}
                      style={{ borderLeftColor: col.color }}
                      title={t("board.hint")}
                      data-scene={scene.id}
                    >
                      <p className="flex items-baseline gap-2 font-mono text-xs font-semibold">
                        <span className="tabular-nums">{numbers.get(scene.id)}</span>
                        <span className="min-w-0 flex-1 truncate">{headingOf(scene)}</span>
                      </p>
                      {scene.title && <p className="mt-0.5 truncate text-sm font-medium">{scene.title}</p>}
                      {scene.summary && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{scene.summary}</p>}
                      <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">{duration(times.get(scene.id)?.minutes ?? 0)}</p>
                    </article>,
                    dropZone(col.sequence.id, index + 1),
                  ])}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
