import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileStack,
  KeyRound,
  ListTree,
  Loader2,
  MapPin,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Repeat2,
  Rows3,
  StepForward,
  Users,
} from "lucide-react";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { DocumentIcon } from "@/components/documents/DocumentIcon";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { LocationThumb } from "@/components/locations/LocationVisuals";
import { KindIcon } from "@/components/plot/KindIcon";
import { usePlotLinks, type PlotLinks } from "@/components/plot/usePlotLinks";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { characterTabId } from "@/lib/characters";
import { errorText, useNodeDocuments } from "@/lib/documents";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import {
  eventOf,
  laneOf,
  momentNumber,
  STATUS_COLORS,
  tourList,
  type PlotData,
  type PlotEvent,
  type TourMode,
} from "@/lib/plot";
import { ancestorsOf, structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectLocations } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";
import { useProjectRelations } from "@/stores/relationStore";
import { useStructureStore } from "@/stores/structureStore";
import type { StructureNode } from "@/types";
import { toast } from "@/stores/toastStore";

const TOC_KEY = "ganis.plot.reading.toc";
const MODE_KEY = "ganis.plot.reading.mode";

interface PlotReadingViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Acte en cours à un moment (le dernier qui commence avant ou à ce moment). */
function actAt(data: PlotData, row: number): string | null {
  let found: string | null = null;
  // Les actes peuvent aussi commencer dans le passé narratif (moments négatifs).
  let best = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(data.acts)) {
    const r = Number(key);
    if (r <= row && r > best) {
      best = r;
      found = value;
    }
  }
  return found;
}

/**
 * Lecture de l'histoire : les événements dans l'ordre où le lecteur les
 * découvre (ou l'ordre du plan, ou le long d'une trame), chacun avec tout
 * ce qui s'y rattache dans le projet : point de vue et personnages
 * présents (et leurs relations), lieu, chapitre du découpage et ses
 * documents, notes, causes et conséquences, questions, indices et
 * révélations. Pas à pas, ou en continu comme un manuscrit.
 */
export function PlotReadingView({ projectId, feature, onOpenFeature }: PlotReadingViewProps) {
  const { t } = useTranslation("plot");
  const { data, loading, error } = useProjectPlot(projectId);
  const links = usePlotLinks(projectId);
  const focusRequest = usePlotStore((s) => s.focusRequest);
  const requestFocus = usePlotStore((s) => s.requestFocus);

  // Deux lectures : par plan (ordre du plateau, moment par moment) ou
  // par trame (une seule trame du début à la fin).
  const [mode, setMode] = useState<TourMode>("structure");
  const [laneId, setLaneId] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "continuous";
    } catch {
      return false;
    }
  });
  const [toc, setToc] = useState(() => {
    try {
      return localStorage.getItem(TOC_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipObserver = useRef(false);

  const effectiveLane = mode === "lane" ? (laneId ?? data?.lanes.find((l) => l.main)?.id ?? data?.lanes[0]?.id ?? null) : null;
  const list = useMemo(() => (data ? tourList(data, mode, effectiveLane, links.structureOrder) : []), [data, mode, effectiveLane, links.structureOrder]);

  // Point de départ : l'événement demandé par un autre onglet, sinon le premier.
  useEffect(() => {
    if (!list.length) return;
    if (focusRequest && list.some((e) => e.id === focusRequest.eventId) && Date.now() - focusRequest.at < 10_000) {
      setCurrentId(focusRequest.eventId);
    } else if (!currentId || !list.some((e) => e.id === currentId)) {
      setCurrentId(list[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length > 0, focusRequest?.at, mode, effectiveLane]);

  const index = Math.max(
    0,
    list.findIndex((e) => e.id === currentId),
  );
  const current = list[index];

  const go = useCallback(
    (id: string) => {
      setCurrentId(id);
      if (continuous) {
        skipObserver.current = true;
        scrollRef.current?.querySelector(`[data-reading="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
        window.setTimeout(() => (skipObserver.current = false), 700);
      } else {
        scrollRef.current?.scrollTo({ top: 0 });
      }
    },
    [continuous],
  );

  // Clavier : ← → (pas à pas), Début, Fin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (!scrollRef.current?.isConnected || scrollRef.current.offsetParent === null) return;
      if (e.key === "ArrowRight" && list[index + 1]) {
        e.preventDefault();
        go(list[index + 1].id);
      } else if (e.key === "ArrowLeft" && list[index - 1]) {
        e.preventDefault();
        go(list[index - 1].id);
      } else if (e.key === "Home" && list.length) {
        e.preventDefault();
        go(list[0].id);
      } else if (e.key === "End" && list.length) {
        e.preventDefault();
        go(list[list.length - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, index, go]);

  // En continu : l'événement au milieu de l'écran devient l'événement courant.
  useEffect(() => {
    if (!continuous || !scrollRef.current) return;
    const root = scrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (skipObserver.current) return;
        for (const entry of entries) if (entry.isIntersecting) setCurrentId((entry.target as HTMLElement).dataset.reading ?? null);
      },
      { root, rootMargin: "-45% 0px -50% 0px" },
    );
    root.querySelectorAll("[data-reading]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [continuous, list]);

  // Arrivée en continu : se placer sur l'événement courant.
  useEffect(() => {
    if (continuous && currentId) {
      requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-reading="${CSS.escape(currentId)}"]`)?.scrollIntoView({ block: "start" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous]);

  if (loading || !data) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <span className="inline-flex items-center gap-2" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </span>
        )}
      </main>
    );
  }

  const setPref = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Préférence gardée pour cette séance.
    }
  };

  const modes: TourMode[] = ["structure", "lane"];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>

      {/* Barre de lecture */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setToc(!toc);
            setPref(TOC_KEY, toc ? "0" : "1");
          }}
          aria-label={t("reading.toc")}
          aria-expanded={toc}
          title={t("reading.toc")}
        >
          {toc ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <div className="flex overflow-hidden rounded-md border text-xs" role="tablist" aria-label={t("tour.order")}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              title={t(`tour.modes.${m}Hint`)}
              onClick={() => {
                setMode(m);
                if (m === "lane" && current) setLaneId(current.laneId);
              }}
              className={cn("min-h-8 px-3 font-medium hover:bg-muted", mode === m && "bg-foreground text-background hover:bg-foreground")}
            >
              {t(`reading.modes.${m as "structure" | "lane"}`)}
            </button>
          ))}
        </div>
        {mode === "lane" && (
          <select aria-label={t("tour.pickLane")} value={effectiveLane ?? ""} onChange={(e) => setLaneId(e.target.value)} className={cn(fieldClass, "h-8 w-44 min-w-0")}>
            {data.lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex overflow-hidden rounded-md border text-xs" role="group" aria-label={t("reading.display")}>
          <button
            type="button"
            aria-pressed={!continuous}
            onClick={() => {
              setContinuous(false);
              setPref(MODE_KEY, "step");
            }}
            className={cn("inline-flex min-h-8 items-center gap-1.5 px-3 font-medium hover:bg-muted", !continuous && "bg-muted")}
          >
            <StepForward className="size-3.5" />
            {t("reading.step")}
          </button>
          <button
            type="button"
            aria-pressed={continuous}
            onClick={() => {
              setContinuous(true);
              setPref(MODE_KEY, "continuous");
            }}
            className={cn("inline-flex min-h-8 items-center gap-1.5 px-3 font-medium hover:bg-muted", continuous && "bg-muted")}
          >
            <Rows3 className="size-3.5" />
            {t("reading.continuous")}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {list.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {index + 1} / {list.length}
            </span>
          )}
          <Button variant="outline" size="icon-sm" disabled={index <= 0} onClick={() => go(list[index - 1].id)} aria-label={t("tour.previous")} title={`${t("tour.previous")} (←)`}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={index >= list.length - 1} onClick={() => go(list[index + 1].id)} aria-label={t("tour.next")} title={`${t("tour.next")} (→)`}>
            <ChevronRight />
          </Button>
          {current && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                requestFocus(current.id);
                onOpenFeature("plot.board");
              }}
            >
              <Eye />
              {t("reading.showOnBoard")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {toc && list.length > 0 && (
          <nav aria-label={t("reading.toc")} className="w-60 shrink-0 overflow-y-auto border-r bg-card/40 py-2">
            {list.map((event, i) => {
              const act = data.acts[event.row];
              const showAct = act && (i === 0 || mode !== "structure" || list[i - 1].row !== event.row);
              const lane = laneOf(data, event.laneId);
              return (
                <div key={event.id}>
                  {showAct && mode === "structure" && <p className="px-3 pt-3 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{act}</p>}
                  <div className={cn("group/toc flex items-center hover:bg-muted", event.id === current?.id && "bg-muted")}>
                    <button
                      type="button"
                      onClick={() => go(event.id)}
                      aria-current={event.id === current?.id ? "true" : undefined}
                      className={cn("flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-3 pl-3 text-left text-sm", event.id === current?.id && "font-medium")}
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: lane?.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{event.title || t("untitled")}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {event.nodeId && links.nodePath(event.nodeId) ? links.nodePath(event.nodeId) : `${lane?.name}, ${t("board.moment", { number: momentNumber(event.row) }).toLowerCase()}`}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </nav>
        )}

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          {!list.length ? (
            <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-muted-foreground">
              <BookOpen className="mx-auto mb-3 size-8" />
              <p className="font-medium text-foreground">{t("reading.emptyTitle")}</p>
              <p className="mt-1">{t("reading.emptyHint")}</p>
              <Button className="mt-4" onClick={() => onOpenFeature("plot.board")}>
                {t("reading.openBoard")}
              </Button>
            </div>
          ) : continuous ? (
            <div className="mx-auto max-w-3xl px-6 py-8">
              {list.map((event, i) => (
                <div key={event.id} data-reading={event.id} className={cn("scroll-mt-4", i > 0 && "mt-10 border-t pt-10")}>
                  <EventReading projectId={projectId} data={data} links={links} event={event} position={i + 1} total={list.length} onGo={go} onOpenFeature={onOpenFeature} compact />
                </div>
              ))}
            </div>
          ) : (
            current && (
              <div className="mx-auto max-w-3xl px-6 py-8">
                <EventReading projectId={projectId} data={data} links={links} event={current} position={index + 1} total={list.length} onGo={go} onOpenFeature={onOpenFeature} />
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Un événement et tout ce qui s'y rattache
// ----------------------------------------------------------------------------

interface EventReadingProps {
  projectId: string;
  data: PlotData;
  links: PlotLinks;
  event: PlotEvent;
  position: number;
  total: number;
  onGo: (id: string) => void;
  onOpenFeature: (featureId: string) => void;
  compact?: boolean;
}

const NO_NODES: StructureNode[] = [];
const FOLD_KEY = "ganis.plot.reading.folds";

/** Sections ouvertes par défaut (le reste est replié). */
const DEFAULT_OPEN: Record<string, boolean> = { cast: true, place: true, node: true, notes: false, chain: false, mysteries: false, documents: false };

function readFolds(): Record<string, boolean> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Section repliable, mémorisée pour tous les événements (on lit à son rythme). */
function useFold(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => readFolds()[id] ?? DEFAULT_OPEN[id] ?? false);
  const toggle = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify({ ...readFolds(), [id]: !value }));
      } catch {
        // Préférence gardée pour cette séance.
      }
      return !value;
    });
  return [open, toggle];
}

function Block({ id, icon: Icon, title, summary, children }: { id: string; icon: typeof Users; title: string; summary?: ReactNode; children: ReactNode }) {
  const [open, toggle] = useFold(id);
  const bodyId = useId();
  return (
    <section className="rounded-xl border bg-card/60">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={toggle} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-4 py-2 text-left hover:bg-muted/50">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-sm font-semibold">{title}</span>
        {!open && summary ? <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{summary}</span> : <span className="flex-1" />}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      </button>
      {open && (
        <div id={bodyId} className="min-w-0 border-t px-4 py-3">
          {children}
        </div>
      )}
    </section>
  );
}

function EventReading({ projectId, data, links, event, position, total, onGo, onOpenFeature, compact }: EventReadingProps) {
  const { t } = useTranslation(["plot", "relations"]);
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const { relations } = useProjectRelations(projectId);
  const { settings } = useProjectLocations(projectId);
  const structureNodes = useStructureStore((s) => (s.projectId === projectId ? (s.structure?.nodes ?? NO_NODES) : NO_NODES));
  const createNote = useNoteStore((s) => s.createNote);
  const mutate = usePlotStore((s) => s.mutate);

  const lane = laneOf(data, event.laneId);
  const act = actAt(data, event.row);
  const pov = links.character(event.povId);
  const present = event.characterIds.map((id) => links.character(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const others = present.filter((c) => c.id !== pov?.id);
  const cast = new Set([...(pov ? [pov.id] : []), ...present.map((c) => c.id)]);
  const castRelations = relations.filter((r) => cast.has(r.sourceId) && cast.has(r.targetId));
  const place = links.location(event.locationId);
  const placeParents: string[] = [];
  for (let parent = place?.parentId ? links.location(place.parentId) : undefined; parent && placeParents.length < 4; parent = parent.parentId ? links.location(parent.parentId) : undefined) {
    placeParents.push(parent.name);
  }
  const node = links.node(event.nodeId);
  const nodePath = node
    ? ancestorsOf(structureNodes, node.id)
        .map((n) => links.nodeLabel(n.id))
        .filter((x): x is string => Boolean(x))
    : [];
  const notes = event.noteIds.map((id) => links.note(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const ins = data.links.filter((k) => k.to === event.id);
  const outs = data.links.filter((k) => k.from === event.id);
  const clues = data.clues.filter((c) => c.eventId === event.id);
  const revealed = data.mysteries.filter((m) => m.payoffEventId === event.id);
  const tension = data.tension[event.row];
  const castNames = [pov, ...others]
    .filter(Boolean)
    .map((c) => links.characterName(c!.id))
    .join(", ");

  async function writeScene() {
    try {
      const note = await createNote(projectId, null, event.title || t("untitled"));
      mutate(projectId, (d) => {
        const e = eventOf(d, event.id);
        if (e && !e.noteIds.includes(note.id)) e.noteIds.push(note.id);
      });
      onOpenFeature(noteTabId(note.id));
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
    }
  }

  const chip = "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs";

  return (
    <article aria-label={event.title || t("untitled")} className="min-w-0 [overflow-wrap:anywhere]">
      {/* Repères */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{t("reading.position", { index: position, count: total })}</span>
        {act && <span className="max-w-full truncate rounded bg-foreground px-2 py-0.5 font-semibold text-background">{act}</span>}
        <span className={chip}>
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: lane?.color }} />
          <span className="truncate">{lane?.name}</span>
        </span>
        <span className={chip}>
          <span className="truncate">
            {t("board.moment", { number: momentNumber(event.row) })}
            {data.rowLabels[event.row] ? ` · ${data.rowLabels[event.row]}` : ""}
          </span>
        </span>
        <span className={chip}>
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[event.status] }} />
          {t(`status.${event.status}`)}
        </span>
        {event.date && (
          <span className={chip}>
            <span className="truncate">{event.date}</span>
          </span>
        )}
        {tension !== undefined && (
          <span className={chip} title={t("row.tension", { value: tension })}>
            {t("board.tension")}
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${tension * 10}%` }} />
            </span>
          </span>
        )}
      </div>

      <h2 className={cn("mt-3 leading-tight font-semibold text-balance", compact ? "text-2xl" : "text-3xl")}>
        {event.title || t("untitled")}
        {event.pivot && (
          <span className="ml-2 inline-flex translate-y-[-3px] items-center gap-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold text-white" style={{ backgroundColor: lane?.color }}>
            ◆ {t("board.pivot")}
          </span>
        )}
      </h2>

      {/* Le texte d'abord : ce qui se passe */}
      {event.note ? (
        <p className="mt-5 max-w-[68ch] font-serif text-[1.1rem] leading-8 whitespace-pre-line">{event.note}</p>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground italic">{t("reading.noNote")}</p>
      )}

      {/* Le contexte : sections repliables */}
      <div className="mt-8 space-y-2.5">
        {(pov || present.length > 0) && (
          <Block id="cast" icon={Users} title={t("reading.cast")} summary={castNames}>
            <div className="flex flex-wrap gap-2">
              {pov && (
                <button
                  type="button"
                  onClick={() => onOpenFeature(characterTabId(pov.id))}
                  className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-1.5 pr-3 pl-1.5 text-left hover:border-primary"
                >
                  <CharacterAvatar projectId={projectId} character={pov} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{links.characterName(pov.id)}</span>
                    <span className="block text-xs text-muted-foreground">{t("reading.pov")}</span>
                  </span>
                </button>
              )}
              {others.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenFeature(characterTabId(c.id))}
                  className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border bg-card py-1.5 pr-3 pl-1.5 text-left hover:border-foreground/30"
                >
                  <CharacterAvatar projectId={projectId} character={c} size="sm" />
                  <span className="truncate text-sm font-medium">{links.characterName(c.id)}</span>
                </button>
              ))}
            </div>
            {castRelations.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                {castRelations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-1.5">
                    <span className="font-medium">{links.characterName(r.sourceId)}</span>
                    <span className="text-muted-foreground">{r.directed ? "→" : "–"}</span>
                    <span className="font-medium">{links.characterName(r.targetId)}</span>
                    <span className="text-muted-foreground">
                      · {tt(`relations:types.${r.type}`)}
                      {r.label ? ` (${r.label})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}

        {place && (
          <Block id="place" icon={MapPin} title={t("reading.place")} summary={place.name}>
            <button type="button" onClick={() => onOpenFeature(locationTabId(place.id))} className="flex w-full min-w-0 items-start gap-3 rounded-lg p-1 text-left hover:bg-muted/60">
              <LocationThumb projectId={projectId} location={place} customTypes={settings.customTypes} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{place.name}</span>
                {placeParents.length > 0 && <span className="block text-xs text-muted-foreground">{t("reading.inside", { places: placeParents.join(", ") })}</span>}
                {place.fields.description && <span className="mt-1 line-clamp-3 block text-sm leading-6 text-muted-foreground">{place.fields.description}</span>}
              </span>
            </button>
          </Block>
        )}

        {node && (
          <Block id="node" icon={ListTree} title={t("reading.node")} summary={links.nodeLabel(node.id)}>
            <NodeBlock
              projectId={projectId}
              nodeId={node.id}
              label={links.nodeLabel(node.id) ?? ""}
              color={links.nodeColor(node.id)}
              path={nodePath}
              summary={node.summary}
              onOpenFeature={onOpenFeature}
            />
            {event.alsoNodeIds.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
                <Repeat2 className="size-3.5" aria-hidden="true" />
                {t("reading.alsoTold")}
                {event.alsoNodeIds.map((id) => (
                  <button key={id} type="button" onClick={() => onOpenFeature(structureNodeTabId(id))} className="rounded-full border bg-card px-2 py-0.5 text-foreground hover:border-foreground/30">
                    {links.nodeLabel(id) ?? "—"}
                  </button>
                ))}
              </p>
            )}
          </Block>
        )}

        <Block id="notes" icon={NotebookPen} title={t("reading.notes")} summary={notes.length ? t("reading.notesCount", { count: notes.length }) : undefined}>
          {notes.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {notes.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onOpenFeature(noteTabId(n.id))} className="block w-full min-w-0 rounded-lg border bg-card px-3 py-2 text-left hover:border-foreground/30">
                    <span className="block truncate text-sm font-medium">{n.title || t("untitled")}</span>
                    {n.excerpt && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{n.excerpt}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={() => void writeScene()}>
            <PenLine />
            {t("event.writeScene")}
          </Button>
        </Block>

        {(ins.length > 0 || outs.length > 0) && (
          <Block id="chain" icon={ArrowRight} title={t("reading.chain")} summary={`${ins.length} ← · ${outs.length} →`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1.5 text-xs text-muted-foreground">{t("tour.causedBy")}</p>
                {ins.length ? (
                  ins.map((k) => {
                    const other = eventOf(data, k.from);
                    return other ? <ChainItem key={k.id} data={data} event={other} kind={k.kind} label={k.label} note={k.note} onGo={onGo} /> : null;
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 text-xs text-muted-foreground">{t("tour.triggers")}</p>
                {outs.length ? (
                  outs.map((k) => {
                    const other = eventOf(data, k.to);
                    return other ? <ChainItem key={k.id} data={data} event={other} kind={k.kind} label={k.label} note={k.note} onGo={onGo} /> : null;
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </Block>
        )}

        {(clues.length > 0 || revealed.length > 0) && (
          <Block id="mysteries" icon={KeyRound} title={t("reading.mysteries")} summary={String(clues.length + revealed.length)}>
            <ul className="space-y-1.5 text-sm">
              {clues.map((c) => {
                const mystery = data.mysteries.find((m) => m.id === c.mysteryId);
                return (
                  <li key={c.id} className="rounded-r-md border-l-[3px] border-l-sky-500 bg-card px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">{t("reading.cluePlanted")}</span> {c.text}
                    {mystery?.question && <span className="block text-xs text-muted-foreground">{t("reading.forMystery", { question: mystery.question })}</span>}
                  </li>
                );
              })}
              {revealed.map((m) => (
                <li key={m.id} className="rounded-r-md border-l-[3px] border-l-emerald-500 bg-card px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">{t("reading.revealed")}</span> {m.question || t("untitled")}
                  {m.answer && <span className="block text-xs">{m.answer}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

    </article>
  );
}

function ChainItem({ data, event, kind, label, note, onGo }: { data: PlotData; event: PlotEvent; kind: "impact" | "influence" | "meeting"; label: string; note: string; onGo: (id: string) => void }) {
  const { t } = useTranslation("plot");
  const lane = laneOf(data, event.laneId);
  return (
    <button
      type="button"
      onClick={() => onGo(event.id)}
      className="mb-1.5 flex w-full min-w-0 items-start gap-2 rounded-lg border border-l-4 bg-card px-2.5 py-1.5 text-left hover:border-foreground/30"
      style={{ borderLeftColor: lane?.color }}
    >
      <span className="mt-1" style={{ color: lane?.color }}>
        <KindIcon kind={kind} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{event.title || t("untitled")}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t(`kinds.${kind}.name`)}
          {label ? ` · ${label}` : ""}
        </span>
        {note && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{note}</span>}
      </span>
    </button>
  );
}

/** Élément du découpage, son résumé et ses documents (repliés : on les ouvre au besoin). */
function NodeBlock({
  projectId,
  nodeId,
  label,
  color,
  path,
  summary,
  onOpenFeature,
}: {
  projectId: string;
  nodeId: string;
  label: string;
  color: string | null;
  path: string[];
  summary: string;
  onOpenFeature: (id: string) => void;
}) {
  const { t } = useTranslation(["plot", "documents"]);
  const { documents } = useNodeDocuments(projectId, nodeId);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showDocs, toggleDocs] = useFold("documents");
  const list = documents ?? [];
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => onOpenFeature(structureNodeTabId(nodeId))} className="flex max-w-full min-w-0 items-center gap-2 text-left hover:underline">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? undefined }} />
        <span className="truncate font-medium">{label}</span>
      </button>
      {path.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{path.join(" › ")}</p>}
      {summary && <p className="mt-2 text-sm leading-6 whitespace-pre-line text-muted-foreground">{summary}</p>}
      {list.length > 0 && (
        <div className="mt-3 border-t pt-2">
          <button
            type="button"
            aria-expanded={showDocs}
            onClick={toggleDocs}
            className="flex min-h-8 items-center gap-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", !showDocs && "-rotate-90")} aria-hidden="true" />
            <FileStack className="size-3.5" aria-hidden="true" />
            {t("plot:reading.documents", { count: list.length })}
          </button>
          {showDocs && (
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {list.map((doc) => (
                <li key={doc.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setViewing(doc.id)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:border-foreground/30"
                    title={t("documents:actions.openNamed", { name: doc.name })}
                  >
                    <DocumentIcon document={doc} className="size-7 shrink-0" />
                    <span className="min-w-0 truncate text-sm">{doc.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DocumentViewer
        projectId={projectId}
        documents={list}
        documentId={viewing}
        onClose={() => setViewing(null)}
        onShowVersions={() => {
          setViewing(null);
          onOpenFeature(structureNodeTabId(nodeId));
        }}
        onSaveAs={(doc) =>
          void api
            .saveStructureDocumentAs(projectId, doc.id, null, t("documents:dialogs.saveAs"))
            .then((name) => name && toast({ message: t("documents:saved", { name }), tone: "success" }))
            .catch((error) => toast({ message: errorText(error), tone: "error" }))
        }
      />
    </div>
  );
}