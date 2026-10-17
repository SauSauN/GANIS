import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Link2, Plus, Repeat2, Unlink, Waypoints } from "lucide-react";
import { addEvent } from "@/components/plot/actions";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { fieldClass } from "@/components/workspace/views/PageShell";
import {
  attachToNode,
  eventOf,
  eventsOfNode,
  eventsRetoldIn,
  laneOf,
  momentNumber,
  moveInScene,
  planOrder,
  STATUS_COLORS,
  visibleLanes,
  type PlotEvent,
} from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";

interface SceneEventsCardProps {
  projectId: string;
  nodeId: string;
  /** Nom de l'élément (« Chapitre 3 — Le départ »). */
  name: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Dans la trame » sur la fiche d'un élément du découpage : la scène
 * contient ses événements. On les voit dans l'ordre de la scène (celui de
 * la lecture), on les réordonne, on en ajoute un nouveau ou on relie un
 * événement existant, et l'on voit ceux qui y sont racontés à nouveau.
 */
export function SceneEventsCard({ projectId, nodeId, name, onOpenFeature }: SceneEventsCardProps) {
  const { t } = useTranslation("plot");
  const [open, setOpen] = useCollapsible("ganis.sheet.plot.node.collapsed");
  const { data } = useProjectPlot(projectId);
  const { structure } = useProjectStructure(projectId);
  const mutate = usePlotStore((s) => s.mutate);
  const requestFocus = usePlotStore((s) => s.requestFocus);
  const [mode, setMode] = useState<"new" | "link" | null>(null);
  const [title, setTitle] = useState("");
  const [laneId, setLaneId] = useState("");
  const [linkId, setLinkId] = useState("");
  const [retold, setRetold] = useState(false);

  if (!data) return null;

  const events = eventsOfNode(data, nodeId);
  const again = eventsRetoldIn(data, nodeId);
  const hasChildren = (structure?.nodes ?? []).some((n) => n.parentId === nodeId);
  const lanes = visibleLanes(data);
  const chosenLane = laneId && lanes.some((l) => l.id === laneId) ? laneId : (lanes.find((l) => l.main) ?? lanes[0])?.id ?? "";
  const others = planOrder(data).filter((e) => e.nodeId !== nodeId && !e.alsoNodeIds.includes(nodeId));

  const show = (id: string, feature: "plot.board" | "plot.reading") => {
    requestFocus(id);
    onOpenFeature(feature);
  };

  function createHere() {
    if (!chosenLane) return;
    // Après le dernier événement de la scène dans cette trame, sinon à la fin de la trame.
    const inLane = events.filter((e) => e.laneId === chosenLane);
    const row = inLane.length ? Math.max(...inLane.map((e) => e.row)) + 1 : undefined;
    const id = addEvent(projectId, chosenLane, row, { title: title.trim() || t("defaults.newEvent") });
    if (id) mutate(projectId, (d) => attachToNode(d, id, nodeId));
    setTitle("");
    setMode(null);
  }

  function linkHere() {
    if (!linkId) return;
    mutate(projectId, (d) => {
      if (retold) {
        const e = eventOf(d, linkId);
        if (e && e.nodeId !== nodeId && !e.alsoNodeIds.includes(nodeId)) e.alsoNodeIds = [...e.alsoNodeIds, nodeId];
      } else {
        attachToNode(d, linkId, nodeId);
      }
    });
    setLinkId("");
    setMode(null);
  }

  const row = (event: PlotEvent, index: number, kind: "main" | "again") => {
    const lane = laneOf(data, event.laneId);
    return (
      <li key={event.id} className="group/ev flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => show(event.id, "plot.board")}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg border border-l-4 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
          style={{ borderLeftColor: lane?.color }}
          title={t("scene.showOnBoard")}
        >
          <span className="w-6 shrink-0 pt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{kind === "main" ? index + 1 : <Repeat2 className="size-3.5" aria-label={t("scene.retold")} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{event.title || t("untitled")}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {lane?.name}
              {event.note ? ` · ${event.note}` : ""}
            </span>
          </span>
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[event.status] }} title={t(`status.${event.status}`)} />
        </button>
        <span className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover/ev:opacity-100 focus-within:opacity-100">
          {kind === "main" && (
            <>
              <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => mutate(projectId, (d) => moveInScene(d, nodeId, event.id, -1))} aria-label={t("scene.up", { title: event.title })} title={t("scene.upHint")}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={index === events.length - 1} onClick={() => mutate(projectId, (d) => moveInScene(d, nodeId, event.id, 1))} aria-label={t("scene.down", { title: event.title })} title={t("scene.downHint")}>
                <ArrowDown />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              mutate(projectId, (d) => {
                if (kind === "main") attachToNode(d, event.id, null);
                else {
                  const e = eventOf(d, event.id);
                  if (e) e.alsoNodeIds = e.alsoNodeIds.filter((x) => x !== nodeId);
                }
              })
            }
            aria-label={t("scene.unlink", { title: event.title })}
            title={t("scene.unlinkHint")}
          >
            <Unlink />
          </Button>
        </span>
      </li>
    );
  };

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Waypoints}
      title={t("inStory.title")}
      description={t("inStory.description.node", { name })}
      count={events.length}
      actions={
        events.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={() => show(events[0].id, "plot.reading")}>
            {t("inStory.read")}
          </Button>
        ) : undefined
      }
    >
      {hasChildren && <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5">{t("scene.preferScenes")}</p>}

      {events.length === 0 && again.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("inStory.empty.node")}</p>
      ) : (
        <ol className="space-y-1.5">{events.map((e, i) => row(e, i, "main"))}</ol>
      )}

      {again.length > 0 && (
        <>
          <p className="mt-4 mb-1.5 text-xs font-semibold text-muted-foreground">{t("scene.retoldTitle")}</p>
          <ul className="space-y-1.5">{again.map((e, i) => row(e, i, "again"))}</ul>
        </>
      )}

      {/* Ajouter */}
      {mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("new")} disabled={!lanes.length} title={lanes.length ? undefined : t("scene.noLane")}>
            <Plus />
            {t("scene.addNew")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("link")} disabled={!others.length}>
            <Link2 />
            {t("scene.linkExisting")}
          </Button>
        </div>
      )}

      {mode === "new" && (
        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_12rem_auto]">
          <input
            autoFocus
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createHere();
              if (e.key === "Escape") setMode(null);
            }}
            placeholder={t("scene.newPlaceholder")}
            aria-label={t("scene.newTitle")}
            className={cn(fieldClass, "h-8")}
          />
          <select value={chosenLane} onChange={(e) => setLaneId(e.target.value)} aria-label={t("scene.lane")} className={cn(fieldClass, "h-8")}>
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="flex gap-1.5">
            <Button size="sm" onClick={createHere}>
              {t("scene.create")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t("dialogs.cancel")}
            </Button>
          </span>
        </div>
      )}

      {mode === "link" && (
        <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
          <select autoFocus value={linkId} onChange={(e) => setLinkId(e.target.value)} aria-label={t("scene.pick")} className={cn(fieldClass, "h-8")}>
            <option value="">{t("scene.pick")}</option>
            {lanes.map((l) => (
              <optgroup key={l.id} label={l.name}>
                {others
                  .filter((e) => e.laneId === l.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {momentNumber(e.row)}. {e.title || t("untitled")}
                      {e.nodeId ? ` (${t("scene.alreadyPlaced")})` : ""}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={retold} onChange={(e) => setRetold(e.target.checked)} />
            <span>
              {t("scene.asRetold")}
              <span className="block text-muted-foreground">{t("scene.asRetoldHint")}</span>
            </span>
          </label>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={linkHere} disabled={!linkId}>
              {t("scene.link")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t("dialogs.cancel")}
            </Button>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}