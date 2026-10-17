import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PlotLinks } from "@/components/plot/usePlotLinks";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/workspace/views/PageShell";
import {
  eventOf,
  laneOf,
  momentNumber,
  tourList,
  type PlotData,
  type TourMode,
} from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore } from "@/stores/plotStore";

export interface TourState {
  mode: TourMode;
  laneId: string | null;
  /** Événement de départ (sinon le premier). */
  startId: string | null;
}

interface PlotTourProps {
  data: PlotData;
  links: PlotLinks;
  state: TourState;
  onChange: (state: TourState) => void;
  onClose: () => void;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Parcourir » : l'histoire événement par événement, sur le plateau, dans
 * l'ordre du plan, l'ordre de lecture ou le long d'une seule trame, avec
 * ce que chaque événement déclenche et ce qui l'a causé.
 */
export function PlotTour({ data, links, state, onChange, onClose, onOpenFeature }: PlotTourProps) {
  const { t } = useTranslation("plot");
  const select = usePlotStore((s) => s.select);
  const selection = usePlotStore((s) => s.selection);
  const requestFocus = usePlotStore((s) => s.requestFocus);

  const laneId = state.mode === "lane" ? (state.laneId ?? data.lanes.find((l) => l.main)?.id ?? data.lanes[0]?.id ?? null) : null;
  const list = useMemo(() => tourList(data, state.mode, laneId, links.structureOrder), [data, state.mode, laneId, links.structureOrder]);

  const currentId = selection?.type === "event" && list.some((e) => e.id === selection.id) ? selection.id : (state.startId && list.some((e) => e.id === state.startId) ? state.startId : list[0]?.id);
  const index = Math.max(0, list.findIndex((e) => e.id === currentId));
  const event = list[index];

  useEffect(() => {
    if (event && !(selection?.type === "event" && selection.id === event.id)) select({ type: "event", id: event.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" && list[index + 1]) {
        e.preventDefault();
        select({ type: "event", id: list[index + 1].id });
      } else if (e.key === "ArrowLeft" && list[index - 1]) {
        e.preventDefault();
        select({ type: "event", id: list[index - 1].id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, index, select]);

  if (!event) return null;

  const lane = laneOf(data, event.laneId);
  const outs = data.links.filter((k) => k.from === event.id);
  const ins = data.links.filter((k) => k.to === event.id);
  const people = [event.povId, ...event.characterIds.filter((id) => id !== event.povId)]
    .filter((id): id is string => Boolean(id))
    .map(links.characterName)
    .filter(Boolean);
  const place = event.locationId ? links.locationName(event.locationId) : null;
  const node = event.nodeId ? links.nodeLabel(event.nodeId) : null;

  const modes: TourMode[] = ["structure", "reading", "lane"];

  return (
    <div
      role="region"
      aria-label={t("tour.label")}
      className="absolute bottom-4 left-1/2 z-40 max-h-[46vh] w-[min(580px,calc(100%-24px))] -translate-x-1/2 overflow-y-auto rounded-xl border bg-popover p-4 text-sm shadow-2xl"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex overflow-hidden rounded-md border" role="tablist" aria-label={t("tour.order")}>
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={state.mode === mode}
              title={t(`tour.modes.${mode}Hint`)}
              onClick={() => onChange({ ...state, mode, laneId: mode === "lane" ? event.laneId : state.laneId, startId: event.id })}
              className={cn("min-h-7 px-2.5 font-medium hover:bg-muted", state.mode === mode && "bg-foreground text-background hover:bg-foreground")}
            >
              {t(`tour.modes.${mode}`)}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate">
          {t("board.moment", { number: momentNumber(event.row) })} · {lane?.name}
          {data.rowLabels[event.row] ? ` · ${data.rowLabels[event.row]}` : ""}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("tour.close")} title={t("tour.close")}>
          <X />
        </Button>
      </div>

      {state.mode === "lane" && (
        <select
          aria-label={t("tour.pickLane")}
          className={cn(fieldClass, "mt-2 h-8")}
          value={laneId ?? ""}
          onChange={(e) => onChange({ mode: "lane", laneId: e.target.value, startId: null })}
        >
          {data.lanes
            .filter((l) => data.events.some((ev) => ev.laneId === l.id))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      )}

      <h2 className="mt-2 text-lg leading-snug font-semibold">{event.title || t("untitled")}</h2>
      <p className="text-xs text-muted-foreground">
        {index + 1} / {list.length} · {t(`status.${event.status}`)}
        {place ? ` · ${place}` : ""}
        {node ? ` · ${node}` : ""}
        {event.date ? ` · ${event.date}` : ""}
      </p>
      {people.length > 0 && <p className="mt-1 text-xs">{people.join(", ")}</p>}
      {event.note && <p className="mt-2 leading-6 whitespace-pre-line">{event.note}</p>}

      {outs.length > 0 && (
        <div className="mt-2">
          <p className="font-medium">{t("tour.triggers")}</p>
          <ul className="list-disc pl-5">
            {outs.map((k) => (
              <li key={k.id}>
                {t(`kinds.${k.kind}.name`)} → {eventOf(data, k.to)?.title || t("untitled")}
                {k.label ? ` (${k.label})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ins.length > 0 && (
        <div className="mt-2">
          <p className="font-medium">{t("tour.causedBy")}</p>
          <ul className="list-disc pl-5">
            {ins.map((k) => (
              <li key={k.id}>
                {eventOf(data, k.from)?.title || t("untitled")} — {t(`kinds.${k.kind}.name`).toLowerCase()}
                {k.label ? ` (${k.label})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={index <= 0} onClick={() => select({ type: "event", id: list[index - 1].id })}>
          <ChevronLeft />
          {t("tour.previous")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            requestFocus(event.id);
            onOpenFeature("plot.reading");
          }}
          title={t("tour.fullReadingHint")}
        >
          <BookOpen />
          <span className="hidden sm:inline">{t("tour.fullReading")}</span>
        </Button>
        <Button className="flex-1" disabled={index >= list.length - 1} onClick={() => select({ type: "event", id: list[index + 1].id })}>
          {t("tour.next")}
          <ChevronRight />
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {t("tour.position", { index: index + 1, count: list.length, title: event.title })}
      </p>
    </div>
  );
}