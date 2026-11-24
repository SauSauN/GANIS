import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Flag,
  LocateFixed,
  MapPin,
  Shapes,
  TriangleAlert,
  Users,
} from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { StepperGroup } from "@/components/common/NumberStepper";
import { LoadingDots } from "@/components/common/LoadingDots";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { usePlotLinks } from "@/components/plot/usePlotLinks";
import { ErasEditor } from "@/components/plot/ErasEditor";
import { EventWhenFields, useMonthNames } from "@/components/plot/EventWhenFields";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { YearInput } from "@/components/plot/YearInput";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fullName } from "@/lib/characters";
import {
  ageAt,
  DEFAULT_YEAR,
  eventOf,
  laneOf,
  momentNumber,
  timeline,
  timelineRange,
  datePartsOf,
  timelineGaps,
  timelineTicks,
  UNIT_YEARS,
  updateWhen,
  type PlotEra,
  type TimelineTick,
  type YearDetail,
  type PlotData,
  type TimelineItem,
  yearInText,
} from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";

const PANEL_KEY = "ganis.plot.timeline.panel";
const LEGEND_KEY = "ganis.plot.timeline.legend";

/*
 * Géométrie de la frise, en rem pour suivre la taille du texte choisie
 * (14 / 16 / 18 px). Convertie en pixels au rendu (`rem`), car les
 * positions des événements se calculent à partir des années.
 */
/** Largeur de la colonne des noms de trame. */
const LANE_HEAD = 10.5;
/** Hauteur d'une rangée d'événements dans une trame (pastille h-7 + 0,5 rem). */
const TRACK = 2.25;
/** Marge haute et basse d'une trame. */
const LANE_PAD = 0.5;
/** Largeur maximale d'une étiquette d'événement (`max-w-64`). */
const CHIP_MAX = 16;
/** Décalage entre la gauche d'une pastille ponctuelle et le centre de son point. */
const DOT_OFFSET = 0.625;

/**
 * Écart minimal entre deux graduations, pour lire leur date ; c'est aussi
 * la largeur de la plus petite unité (année, mois, jour ou heure, selon la
 * précision du projet) au plus fort zoom.
 */
const TICK_GAP = 4;
/** Pas du zoom à la molette (Ctrl + molette) ; − / + vont d'un écart de graduations au suivant. */
const WHEEL_STEP = 1.2;

const FOCUS_RING = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

type Panel = "event" | "eras";

interface PlotTimelineViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sans stockage : le réglage vaut pour cette séance.
  }
}

/** Taille d'un rem en pixels (réglage « taille du texte »). */
function remInPx() {
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch {
    return 16;
  }
}

/** Événements d'une trame répartis en rangées pour ne pas se chevaucher (largeur estimée des étiquettes). */
function packTracks(items: TimelineItem[], x: (year: number) => number, rem: number): Array<{ item: TimelineItem; track: number; left: number }> {
  const ends: number[] = [];
  return items.map((item) => {
    const left = x(item.from);
    const span = item.to > item.from ? x(item.to) - left : 0;
    const label = Math.min(CHIP_MAX * rem, item.event.title.length * 0.43 * rem + 2.5 * rem);
    const width = Math.max(span, label);
    let track = ends.findIndex((end) => end + rem / 2 <= left);
    if (track < 0) {
      track = ends.length;
      ends.push(0);
    }
    ends[track] = left + width;
    return { item, track, left };
  });
}

/**
 * Frise chronologique : les événements de la trame placés par année, une
 * ligne par trame, sur le fond des époques du monde. Ce n'est pas une autre
 * liste d'événements : ce sont ceux du plateau, vus dans le temps de
 * l'histoire (le plateau les montre dans l'ordre des moments).
 *
 * À droite, un panneau à onglets : l'événement choisi (avec l'âge des
 * personnages), les époques et le calendrier, les naissances (lues dans les
 * fiches). ← → passent d'un événement à l'autre dans l'ordre du temps.
 */
export function PlotTimelineView({ projectId, feature, onOpenFeature }: PlotTimelineViewProps) {
  const { t } = useTranslation("plot");
  const { data, loading, error } = useProjectPlot(projectId);
  const links = usePlotLinks(projectId);
  const monthsLong = useMonthNames();
  const monthsShort = useMonthNames("short");
  const mutateStore = usePlotStore((s) => s.mutate);
  const requestFocus = usePlotStore((s) => s.requestFocus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Époque ouverte dans le panneau « Époques ». */
  const [openEraId, setOpenEraId] = useState<string | null>(null);
  /** Zoom choisi ; `null` : la vue par défaut, an par an. */
  const [zoom, setZoom] = useState<number | null>(null);
  /** Panneau de droite : l'événement choisi, les époques, ou fermé (souvenu pour ce poste). */
  const [panel, setPanelState] = useState<Panel | null>(() => {
    const saved = readStored(PANEL_KEY, ["event", "eras", "closed", "open"] as const, "event");
    return saved === "closed" ? null : saved === "eras" ? "eras" : "event";
  });
  const panelOpen = panel !== null;
  const setPanel = useCallback((next: Panel | null) => {
    setPanelState(next);
    store(PANEL_KEY, next ?? "closed");
  }, []);
  const [undatedOpen, setUndatedOpen] = useState(true);
  /** Légende cachée par défaut, affichée à la demande (souvenue pour ce poste). */
  const [legendOpen, setLegendOpen] = useState(() => readStored(LEGEND_KEY, ["open", "closed"] as const, "closed") === "open");
  const toggleLegend = () =>
    setLegendOpen((open) => {
      store(LEGEND_KEY, open ? "closed" : "open");
      return !open;
    });
  const viewportRef = useRef<HTMLDivElement>(null);
  const remProbeRef = useRef<HTMLSpanElement>(null);
  const undatedRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState(900);
  const [rem, setRem] = useState(remInPx);
  /**
   * Instant (en années) au bord gauche de la frise. La frise ne défile pas
   * nativement : à l'heure près, quelques siècles dépasseraient la largeur
   * qu'un navigateur sait afficher. Seule la partie visible est dessinée.
   */
  const [start, setStart] = useState<number | null>(null);
  /** Échelle du dernier rendu, lue par la molette, le glisser et le zoom. */
  const scaleRef = useRef<{ from: number; to: number; start: number; perYear: number; laneHead: number; trackW: number; zoom: number; maxZoom: number } | null>(null);
  /** Glisser en cours sur la frise ou sur la vue d'ensemble. */
  const dragRef = useRef<{ x: number; start: number; moved: boolean; overview: boolean } | null>(null);
  /** Palier de zoom suivant ou précédent (lu par les touches + / −). */
  const zoomLevelRef = useRef<(direction: 1 | -1) => number>(() => 1);

  // Largeur visible de la frise, et taille du texte : la sonde de 1 rem
  // change de taille quand l'utilisateur change la taille du texte.
  useEffect(() => {
    const element = viewportRef.current;
    const probe = remProbeRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport(element.clientWidth);
      setRem(remInPx());
    });
    observer.observe(element);
    if (probe) observer.observe(probe);
    setViewport(element.clientWidth);
    return () => observer.disconnect();
  }, [data === null, panelOpen]);

  const mutate = (fn: (d: PlotData) => void, key?: string) => mutateStore(projectId, fn, key ? { key } : undefined);

  /**
   * Change le zoom en gardant une année au même endroit de l'écran : celle
   * sous le pointeur (molette), celle d'un événement (« Année par année »),
   * ou le milieu de ce qu'on voit.
   */
  const zoomTo = useCallback((next: number, anchor?: { year?: number; clientX?: number }) => {
    const scale = scaleRef.current;
    const element = viewportRef.current;
    if (!scale || !element) return;
    const clamped = Math.min(scale.maxZoom, Math.max(1, next));
    if (Math.abs(clamped - scale.zoom) < 1e-9) return;
    let offset = scale.trackW / 2;
    if (anchor?.clientX !== undefined) offset = Math.min(scale.trackW, Math.max(0, anchor.clientX - element.getBoundingClientRect().left - scale.laneHead));
    if (anchor?.year !== undefined) offset = scale.trackW / 2;
    const year = anchor?.year ?? scale.start + offset / scale.perYear;
    const perYear = (scale.perYear * clamped) / scale.zoom;
    setZoom(clamped);
    setStart(year - offset / perYear);
  }, []);

  /** Déplace la frise de `px` pixels (positif : vers les dates plus tardives). */
  const panBy = useCallback((px: number) => {
    const scale = scaleRef.current;
    if (!scale) return;
    setStart((current) => (current ?? scale.start) + px / scale.perYear);
  }, []);

  // Molette : Ctrl (ou ⌘) zoome autour du pointeur ; la molette horizontale
  // (ou Maj + molette) déplace la frise ; la molette seule fait défiler la page.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const scale = scaleRef.current;
      if (!scale) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomTo(scale.zoom * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), { clientX: event.clientX });
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        panBy(event.deltaX || event.deltaY);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [data === null, zoomTo, panBy]);
  /** Bouton « Événement » ou « Époques » : ouvre le panneau sur ce contenu, ou le referme. */
  const togglePanel = (value: Panel) => setPanel(panel === value ? null : value);

  const view = useMemo(() => (data ? timeline(data) : null), [data]);
  const range = useMemo(() => (data && view ? timelineRange(data, view.items) : null), [data, view]);
  const ordered = view?.items ?? [];
  const selectedIndex = ordered.findIndex((item) => item.event.id === selectedId);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setPanel("event");
  }, [setPanel]);

  const go = useCallback(
    (direction: -1 | 1) => {
      if (!ordered.length) return;
      const next = selectedIndex < 0 ? (direction > 0 ? 0 : ordered.length - 1) : selectedIndex + direction;
      const item = ordered[Math.min(ordered.length - 1, Math.max(0, next))];
      select(item.event.id);
      // Hors de la partie visible : centrer la frise sur lui.
      const scale = scaleRef.current;
      if (scale) {
        const visible = scale.trackW / scale.perYear;
        if (item.from < scale.start || item.from > scale.start + visible * 0.9) setStart(item.from - visible / 2);
      }
    },
    [ordered, selectedIndex, select],
  );

  const showUndated = () => {
    setUndatedOpen(true);
    requestAnimationFrame(() => undatedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  // ← → : événement précédent / suivant dans le temps (hors saisie).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
      if (event.key === "Escape") setSelectedId(null);
      // + / − : zoomer, 0 : tout voir (hors raccourcis du système).
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") zoomTo(zoomLevelRef.current(1));
      if (event.key === "-") zoomTo(zoomLevelRef.current(-1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, zoomTo]);

  if (loading || !data || !view) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <span className="inline-flex items-center gap-2" role="status">
            <LoadingDots className="size-4" />
            {t("loading")}
          </span>
        )}
      </main>
    );
  }

  const yearText = (year: number) => t("timeline.yearValue", { label: data.yearLabel, year }).trim();
  const lanes = data.lanes.filter((lane) => !lane.hidden);
  const selected = selectedId ? eventOf(data, selectedId) : undefined;
  const openBoard = () => onOpenFeature("plot.board");
  /** Ouvre le panneau « Époques », sur une époque s'il y en a une (clic sur son bandeau). */
  const openEras = (eraId?: string) => {
    setPanel("eras");
    if (eraId) setOpenEraId(eraId);
  };
  /** Montre une époque sur la frise : son début près du bord gauche. */
  const showEra = (era: PlotEra) => setStart(era.from - visibleYears * 0.05);

  const precision = data.timePrecision;

  /** Date affichée d'un événement, à la précision du projet (« 12 mars 1850, 14 h »). */
  const whenText = (year: number, detail: YearDetail | null) => {
    if (!detail || precision === "year") return yearText(year);
    const month = monthsLong[detail.month - 1];
    const y = yearText(year);
    if (detail.day === null || precision === "month") return t("timeline.dateMonth", { month, year: y });
    if (detail.hour === null || precision === "day") return t("timeline.dateDay", { day: detail.day, month, year: y });
    return t("timeline.dateHour", { day: detail.day, month, year: y, hour: detail.hour });
  };
  /** Date d'un instant de la frise (bornes, début du récit). */
  const instantText = (instant: number) => {
    const parts = datePartsOf(instant);
    return whenText(parts.year, { month: parts.month, day: parts.day, hour: parts.hour });
  };

  // Échelle : à ×1, toute la frise tient dans la largeur visible ; au plus
  // fort zoom, la plus petite unité permise (année, mois, jour ou heure) a
  // sa colonne de TICK_GAP et sa graduation.
  const laneHead = LANE_HEAD * rem;
  const trackW = Math.max(20 * rem, viewport - laneHead);
  const span = range ? range.to - range.from : 1;
  const maxZoom = Math.max(1, ((TICK_GAP * rem) / UNIT_YEARS[precision]) * (span / trackW));
  // Vue par défaut : an par an (chaque année a sa colonne et sa graduation).
  const yearZoom = Math.min(maxZoom, Math.max(1, ((TICK_GAP * rem) / UNIT_YEARS.year) * (span / trackW)));
  const scale = Math.min(maxZoom, Math.max(1, zoom ?? yearZoom));
  const perYear = (trackW * scale) / span;
  const visibleYears = trackW / perYear;
  // À l'ouverture, la frise montre toujours le début du récit (un peu de
  // place à gauche pour ce qui le précède) ; sans début du récit, le
  // premier événement.
  const home = view.storyStart ?? ordered[0]?.from ?? range?.from ?? 0;
  const homeStart = home - visibleYears * 0.1;
  /** Bord gauche gardé dans l'étendue de la frise. */
  const clampStart = (value: number) => (range ? Math.min(Math.max(range.from, value), Math.max(range.from, range.to - visibleYears)) : 0);
  const startNow = clampStart(start ?? homeStart);
  /** La frise est déjà sur le début du récit (le bouton pour y revenir ne sert à rien). */
  const homeVisible = Math.abs(startNow - clampStart(homeStart)) < visibleYears * 0.01 && Math.abs(scale - yearZoom) < 1e-6;
  const x = (instant: number) => (instant - startNow) * perYear;
  const canZoom = maxZoom > 1.001;
  const atFinest = scale >= maxZoom - 1e-9;
  if (range) scaleRef.current = { from: range.from, to: range.to, start: startNow, perYear, laneHead, trackW, zoom: scale, maxZoom };

  // Graduations de la partie visible seulement.
  const scaleTicks = range ? timelineTicks(startNow - visibleYears * 0.05, startNow + visibleYears * 1.05, perYear, TICK_GAP * rem, precision) : null;
  const ticks = scaleTicks?.ticks ?? [];
  const stepKey = ({ year: "timeline.stepYear", month: "timeline.stepMonth", day: "timeline.stepDay", hour: "timeline.stepHour" } as const)[scaleTicks?.unit ?? "year"];
  /**
   * Chaque graduation et la colonne qui la suit (jusqu'à la suivante).
   * Quand chaque unité a sa graduation (1 an, 1 mois, 1 jour, 1 heure), le
   * nom s'écrit au milieu de sa colonne ; sinon, sur le trait. Une colonne
   * sur deux a un fond léger, calculé sur la date (il ne change pas quand
   * on fait glisser la frise).
   */
  const gapYears = scaleTicks ? UNIT_YEARS[scaleTicks.unit] * scaleTicks.step : 1;
  const inCells = scaleTicks?.step === 1;
  const columns = ticks.map((tick, index) => {
    const left = x(tick.at);
    const right = x(ticks[index + 1]?.at ?? tick.at + gapYears);
    return { tick, left, right, striped: Math.round(tick.at / gapYears) % 2 !== 0 };
  });
  /** Position d'une étiquette, toujours entière dans la partie visible. */
  const labelPlace = (left: number, right: number): { left: number; align: "center" | "start" | "end" } => {
    if (inCells) return { left: (Math.max(left, 0) + Math.min(right, trackW)) / 2, align: "center" };
    if (left < 1.5 * rem) return { left: Math.max(left, 0) + 2, align: "start" };
    if (left > trackW - 1.5 * rem) return { left: Math.min(left, trackW) - 2, align: "end" };
    return { left, align: "center" };
  };
  const storyX = view.storyStart !== null ? x(view.storyStart) : null;
  const storyVisible = storyX !== null && storyX >= 0 && storyX <= trackW;

  const tickLabel = (tick: TimelineTick) => {
    switch (scaleTicks?.unit) {
      case "month":
        return tick.major ? String(tick.year) : monthsShort[tick.month - 1];
      case "day":
        return tick.major ? (tick.month === 1 ? `${monthsShort[0]} ${tick.year}` : monthsShort[tick.month - 1]) : String(tick.day);
      case "hour":
        return tick.major ? `${tick.day} ${monthsShort[tick.month - 1]}` : t("when.hourValue", { hour: tick.hour });
      default:
        return String(tick.year);
    }
  };
  // Où l'on est, quand les graduations n'écrivent plus l'année.
  const middle = datePartsOf(startNow + visibleYears / 2);
  const context =
    scaleTicks?.unit === "hour"
      ? t("timeline.dateDay", { day: middle.day, month: monthsLong[middle.month - 1], year: yearText(middle.year) })
      : scaleTicks?.unit === "day"
        ? t("timeline.dateMonth", { month: monthsLong[middle.month - 1], year: yearText(middle.year) })
        : scaleTicks?.unit === "month"
          ? yearText(middle.year)
          : "";

  // Paliers ×1, ×2, ×4… jusqu'à la plus petite unité.
  // Paliers du zoom : un par écart entre graduations (10 ans, 5 ans… 1 mois,
  // 7 jours, 1 jour…), pour que chaque clic sur − / + change l'écart affiché.
  const zoomLevel = (direction: 1 | -1) => {
    const levels = [1, maxZoom];
    for (const gap of timelineGaps(precision, span)) {
      // Juste assez de zoom pour que cet écart soit celui choisi.
      const level = ((TICK_GAP * rem) / gap) * (span / trackW) * 1.0001;
      if (level > 1 && level < maxZoom) levels.push(level);
    }
    levels.sort((a, b) => a - b);
    return direction > 0 ? (levels.find((z) => z > scale * 1.01) ?? maxZoom) : ([...levels].reverse().find((z) => z < scale / 1.01) ?? 1);
  };

  zoomLevelRef.current = zoomLevel;

  // Glisser la frise pour se déplacer ; un clic sans glisser sur le fond désélectionne.
  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    dragRef.current = { x: event.clientX, start: startNow, moved: false, overview: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.overview) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) setStart(drag.start - dx / perYear);
  };
  const onTrackPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved && !drag.overview) setSelectedId(null);
  };

  // Vue d'ensemble : toute la frise en petit, la partie visible en cadre.
  const ox = (instant: number) => (range ? ((instant - range.from) / span) * trackW : 0);
  const overviewTo = (clientX: number, element: HTMLElement) => {
    const at = range ? range.from + ((clientX - element.getBoundingClientRect().left) / trackW) * span : 0;
    setStart(at - visibleYears / 2);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>
      <span ref={remProbeRef} aria-hidden="true" className="pointer-events-none invisible absolute size-4" />

      {/* Barre d'outils : explication, étendue, sans année, zoom, panneau */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2 select-none">
        {range && (
          <Button variant={legendOpen ? "secondary" : "ghost"} onClick={toggleLegend} aria-pressed={legendOpen} aria-controls="timeline-legend" title={legendOpen ? t("timeline.hideLegend") : t("timeline.showLegend")}>
            <Shapes aria-hidden="true" />
            {t("timeline.legendButton")}
          </Button>
        )}
        {view.undated.length > 0 && (
          <Button variant="outline" onClick={showUndated} title={t("timeline.showUndated")}>
            <TriangleAlert className="text-warning" aria-hidden="true" />
            {t("timeline.undatedCount", { count: view.undated.length })}
          </Button>
        )}
        <span className="flex-1" />
        {range && canZoom && (
          <>
            <Button variant="outline" onClick={() => {
                // Vue par défaut : an par an, sur le début du récit.
                setZoom(null);
                setStart(null);
              }}
              disabled={homeVisible} title={t("timeline.goToStoryStart")}>
              <LocateFixed aria-hidden="true" />
              {view.storyStart !== null ? t("timeline.storyStart") : t("timeline.first")}
            </Button>
            <StepperGroup
              label={t("timeline.zoom")}
              minusLabel={t("timeline.zoomOut")}
              plusLabel={t("timeline.zoomIn")}
              minusDisabled={scale <= 1.001}
              plusDisabled={atFinest}
              onMinus={() => zoomTo(zoomLevel(-1))}
              onPlus={() => zoomTo(zoomLevel(1))}
            >
              <span className="flex h-full min-w-24 items-center justify-center px-2 text-sm whitespace-nowrap tabular-nums" title={t("timeline.stepTitle")} aria-live="polite">
                {t(stepKey, { count: scaleTicks?.step ?? 1 })}
              </span>
            </StepperGroup>
          </>
        )}
        {/* Le panneau de droite : l'événement choisi, ou les époques (un second clic le referme). */}
        <div className={SEGMENTED_GROUP} role="group" aria-label={t("timeline.panel")}>
          {(["event", "eras"] as const).map((value) => {
            const Icon = value === "event" ? CalendarRange : Flag;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={panel === value}
                aria-controls="timeline-panel"
                onClick={() => togglePanel(value)}
                title={panel === value ? t("timeline.hidePanel") : t(`timeline.show.${value}`)}
                className={cn(SEGMENTED_ITEM, panel === value && SEGMENTED_ON)}
              >
                <Icon aria-hidden="true" />
                {t(`timeline.tabs.${value}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("grid min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] lg:overflow-hidden", panelOpen && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
        {/* Frise et événements sans année */}
        <div className="min-w-0 space-y-6 p-4 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label={t("timeline.title")}>
            {/* Comment lire la frise : à la demande (bouton « Légende »). */}
            {range && legendOpen && (
              <div id="timeline-legend" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2 text-xs text-muted-foreground select-none">
                <span className="font-medium text-foreground">{t("timeline.legend")}</span>
                <LegendItem mark={<span className="size-2.5 rounded-full bg-primary" />}>{t("timeline.legendPoint")}</LegendItem>
                <LegendItem mark={<span className="h-2.5 w-6 rounded-full bg-primary/25" />}>{t("timeline.legendSpan")}</LegendItem>
                <LegendItem mark={<span className="h-3 w-6 rounded-full border border-dashed border-muted-foreground" />}>{t("timeline.legendPast")}</LegendItem>
                <LegendItem mark={<span className="h-3 w-6 rounded-full border bg-card opacity-60" />}>
                  <span className="italic">{t("timeline.legendDefault", { year: yearText(DEFAULT_YEAR) })}</span>
                </LegendItem>
                {view.storyStart !== null && <LegendItem mark={<span className="h-3 border-l-2 border-dashed border-primary" />}>{t("timeline.storyStart")}</LegendItem>}
              </div>
            )}

            <div ref={viewportRef} className="overflow-hidden">
              {!range ? (
                <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                  <CalendarRange className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-base font-medium">{t("timeline.emptyTitle")}</p>
                  <p className="max-w-md text-sm text-muted-foreground">{t("timeline.empty")}</p>
                  <Button onClick={openBoard}>
                    <Columns3 />
                    {t("timeline.openBoard")}
                  </Button>
                </div>
              ) : (
                <div className="relative pt-3 pb-2">
                  {/* Époques, en bandeaux nommés (le nom reste lisible au bord gauche). */}
                  {data.eras.length > 0 && (
                    <div className="relative mb-1 h-7 overflow-hidden" style={{ marginLeft: laneHead }}>
                      {data.eras.map((era) => {
                        const left = Math.max(x(era.from), 0);
                        const right = Math.min(x(era.to), trackW);
                        if (right <= 0 || left >= trackW) return null;
                        const name = era.name || t("timeline.newEra");
                        return (
                          <button
                            type="button"
                            key={era.id}
                            onClick={() => openEras(era.id)}
                            className={cn("absolute top-0 flex h-6 items-center gap-1.5 overflow-hidden rounded-md border-l-2 px-2 text-xs font-medium whitespace-nowrap text-foreground transition-shadow hover:shadow-sm", FOCUS_RING)}
                            style={{ left, width: Math.max(4, right - left - 3), borderLeftColor: era.color, background: `color-mix(in oklab, ${era.color} 14%, var(--card))` }}
                            title={`${name} (${yearText(era.from)} – ${yearText(era.to)}) · ${t("timeline.editEras")}`}
                          >
                            <Flag className="size-3 shrink-0" style={{ color: era.color }} aria-hidden="true" />
                            <span className="truncate">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Graduations ; à gauche, où l'on est quand elles n'écrivent plus l'année. */}
                  <div className="flex h-6 border-b select-none" aria-hidden="true">
                    <div className="flex shrink-0 items-end px-3 pb-1 text-xs font-medium text-foreground" style={{ width: laneHead }}>
                      <span className="truncate">{context}</span>
                    </div>
                    <div className="relative flex-1 overflow-hidden">
                      {columns.map(({ tick, left, right }) => {
                        if (right < 0 || left > trackW) return null;
                        const place = labelPlace(left, right);
                        return (
                          <span
                            key={tick.at}
                            className={cn(
                              "absolute bottom-1 text-xs whitespace-nowrap tabular-nums",
                              place.align === "center" ? "-translate-x-1/2" : place.align === "end" && "-translate-x-full",
                              tick.major && scaleTicks?.unit !== "year" ? "font-medium text-foreground" : "text-muted-foreground",
                            )}
                            style={{ left: place.left }}
                          >
                            {tickLabel(tick)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Début du récit : son étiquette sur une ligne à elle, pour ne jamais cacher un événement. */}
                  {view.storyStart !== null && (
                    <div className="flex h-7 select-none" aria-hidden={!storyVisible}>
                      <div className="shrink-0" style={{ width: laneHead }} />
                      <div className="relative flex-1 overflow-hidden">
                        {storyVisible && (
                          <div className="absolute top-1 bottom-0 border-l-2 border-dashed border-primary" style={{ left: storyX! }}>
                            <span className={cn("absolute top-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary", storyX! > trackW - 12 * rem ? "right-1.5" : "left-1.5")}>
                              {t("timeline.storyStart")} · {instantText(view.storyStart)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Trames : glisser pour se déplacer dans le temps. */}
                  <div className="relative">
                    <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 bottom-0 overflow-hidden" style={{ left: laneHead }}>
                      {/* Les époques, en fond léger derrière toutes les trames. */}
                      {data.eras.map((era) => {
                        const left = Math.max(x(era.from), 0);
                        const right = Math.min(x(era.to), trackW);
                        return right > left ? (
                          <div key={era.id} className="absolute top-0 bottom-0" style={{ left, width: right - left, background: `color-mix(in oklab, ${era.color} 6%, transparent)` }} />
                        ) : null;
                      })}
                      {/* Une colonne sur deux, en fond léger, pour suivre une date vers le bas. */}
                      {columns.map(({ tick, left, right, striped }) =>
                        striped && right > 0 && left < trackW ? <span key={`band-${tick.at}`} className="absolute top-0 bottom-0 bg-muted/50" style={{ left, width: right - left }} /> : null,
                      )}
                      {/* Lignes des graduations. */}
                      {ticks.map((tick) => (
                        <span key={tick.at} className={cn("absolute top-0 bottom-0 w-px", tick.major && scaleTicks?.unit !== "year" ? "bg-border" : "bg-border/60")} style={{ left: x(tick.at) }} />
                      ))}
                      {storyVisible && <div className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-primary" style={{ left: storyX! }} />}
                    </div>
                    {lanes.map((lane) => {
                      const laneItems = view.items.filter((item) => item.event.laneId === lane.id);
                      const placed = packTracks(laneItems, x, rem);
                      const tracks = Math.max(1, ...placed.map((p) => p.track + 1));
                      const character = lane.characterId ? links.character(lane.characterId) : undefined;
                      return (
                        // Survol : toute la ligne de la trame, nom compris, s'éclaircit pour la suivre d'un bout à l'autre.
                        <div key={lane.id} className="group flex border-b last:border-b-0" style={{ minHeight: (tracks * TRACK + 2 * LANE_PAD) * rem }}>
                          <div className="relative z-20 flex shrink-0 items-center gap-2 border-r bg-card py-2 pr-3 pl-4 transition-colors select-none group-hover:bg-muted" style={{ width: laneHead }}>
                            <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full" style={{ background: lane.color }} aria-hidden="true" />
                            {/* La barre de gauche porte la couleur ; l'avatar seulement si la trame suit un personnage. */}
                            {character && <CharacterAvatar projectId={projectId} character={character} size="sm" />}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium" title={lane.name}>
                                {lane.name}
                              </span>
                            </span>
                          </div>
                          <div
                            className={cn("relative flex-1 touch-pan-y overflow-hidden transition-colors group-hover:bg-muted/30", canZoom && scale > 1.001 && "cursor-grab active:cursor-grabbing")}
                            onPointerDown={onTrackPointerDown}
                            onPointerMove={onTrackPointerMove}
                            onPointerUp={onTrackPointerUp}
                            onPointerCancel={onTrackPointerUp}
                          >
                            {placed.map(({ item, track, left }) => {
                              const { event } = item;
                              const period = item.to > item.from;
                              const right = period ? x(item.to) : left + CHIP_MAX * rem;
                              // Hors de la partie visible : rien à dessiner.
                              if (right < -rem || left > trackW + rem) return null;
                              const past = event.row < 0;
                              const on = event.id === selectedId;
                              // Sans année : placé en l'an 2000 en attendant, montré plus pâle et en italique.
                              const byDefault = event.year === null;
                              // Une longue période est coupée aux bords, son titre reste lisible.
                              const drawLeft = period ? Math.max(left, -rem) : left - DOT_OFFSET * rem;
                              const drawRight = period ? Math.min(right, trackW + rem) : 0;
                              const when =
                                event.year === null
                                  ? `${yearText(DEFAULT_YEAR)} (${t("timeline.defaultYear")})`
                                  : `${whenText(event.year, event.yearDetail)}${event.yearEnd !== null && period ? ` – ${whenText(event.yearEnd, event.yearEndDetail)}` : ""}`;
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  data-timeline-event={event.id}
                                  onClick={() => select(on ? null : event.id)}
                                  aria-pressed={on}
                                  title={`${event.title || t("untitled")} · ${when}`}
                                  className={cn(
                                    "absolute flex h-7 max-w-64 items-center gap-1.5 rounded-full border text-xs whitespace-nowrap shadow-sm transition-shadow hover:z-10 hover:shadow-md",
                                    FOCUS_RING,
                                    period ? "px-2.5" : "pr-2.5 pl-1",
                                    period && "max-w-none",
                                    past && "border-dashed",
                                    byDefault && !on && "italic opacity-60",
                                    on && "z-10 font-medium shadow-md",
                                  )}
                                  style={{
                                    left: drawLeft,
                                    top: (LANE_PAD + track * TRACK) * rem,
                                    width: period ? Math.max(drawRight - drawLeft, 2.5 * rem) : undefined,
                                    background: period || on ? `color-mix(in oklab, ${lane.color} ${on ? 24 : 16}%, var(--card))` : "var(--card)",
                                    borderColor: on ? lane.color : period ? `color-mix(in oklab, ${lane.color} 45%, var(--border))` : "var(--border)",
                                    boxShadow: on ? `0 0 0 2px ${lane.color}` : undefined,
                                  }}
                                >
                                  {!period && <span className="size-3 shrink-0 rounded-full border-2 border-card" style={{ background: lane.color }} aria-hidden="true" />}
                                  <span className="truncate">{event.title || t("untitled")}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Vue d'ensemble : où l'on est dans toute la frise (zoom seulement). */}
                  {scale > 1.001 && (
                    <div className="flex items-center border-t pt-2 select-none">
                      {/* Sans titre : on comprend d'un coup d'œil (le nom reste pour les lecteurs d'écran). */}
                      <span className="shrink-0" style={{ width: laneHead }} aria-hidden="true" />
                      <div
                        role="slider"
                        tabIndex={0}
                        aria-label={t("timeline.overview")}
                        aria-valuemin={range.from}
                        aria-valuemax={Math.max(range.from, range.to - visibleYears)}
                        aria-valuenow={startNow}
                        aria-valuetext={t("timeline.overviewValue", { value: instantText(startNow) })}
                        className={cn("relative h-6 shrink-0 cursor-pointer touch-none overflow-hidden rounded-md bg-muted", FOCUS_RING)}
                        style={{ width: trackW - rem / 2 }}
                        onKeyDown={(event) => {
                          // Les flèches déplacent la vue ici (et non d'un événement à l'autre).
                          const moves: Record<string, number> = { ArrowLeft: -0.2, ArrowRight: 0.2, PageUp: -1, PageDown: 1 };
                          if (event.key in moves) {
                            event.preventDefault();
                            event.stopPropagation();
                            setStart(startNow + moves[event.key] * visibleYears);
                          } else if (event.key === "Home" || event.key === "End") {
                            event.preventDefault();
                            event.stopPropagation();
                            setStart(event.key === "Home" ? range.from : range.to);
                          }
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          dragRef.current = { x: event.clientX, start: startNow, moved: true, overview: true };
                          event.currentTarget.setPointerCapture(event.pointerId);
                          overviewTo(event.clientX, event.currentTarget);
                        }}
                        onPointerMove={(event) => dragRef.current?.overview && overviewTo(event.clientX, event.currentTarget)}
                        onPointerUp={() => (dragRef.current = null)}
                        onPointerCancel={() => (dragRef.current = null)}
                      >
                        {data.eras.map((era) => (
                          <span
                            key={era.id}
                            aria-hidden="true"
                            className="absolute top-0 bottom-0"
                            style={{ left: ox(era.from), width: Math.max(1, ox(era.to) - ox(era.from)), background: `color-mix(in oklab, ${era.color} 25%, transparent)` }}
                          />
                        ))}
                        {view.items.map((item) => (
                          <span
                            key={item.event.id}
                            aria-hidden="true"
                            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ left: ox(item.from), background: laneOf(data, item.event.laneId)?.color }}
                          />
                        ))}
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 rounded-md border-2 border-primary bg-primary/10"
                          style={{ left: ox(startNow), width: Math.max(rem / 2, ox(startNow + visibleYears) - ox(startNow)) }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Événements sans année (repliable) : seulement s'il y en a. */}
          {view.undated.length > 0 && (
            <section ref={undatedRef} className="scroll-mt-4 rounded-xl border bg-card shadow-sm" aria-labelledby="timeline-undated">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setUndatedOpen((open) => !open)}
                  aria-expanded={undatedOpen}
                  aria-controls="timeline-undated-list"
                  className={cn("-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:text-foreground", FOCUS_RING)}
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !undatedOpen && "-rotate-90")} aria-hidden="true" />
                  <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <h2 id="timeline-undated" className="truncate text-sm font-semibold">
                    {t("timeline.undated")}
                  </h2>
                </button>
                <InfoTip>{t("timeline.undatedInfo", { year: yearText(DEFAULT_YEAR) })}</InfoTip>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning tabular-nums">
                  <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                  {view.undated.length}
                </span>
              </div>
              {undatedOpen && (
                <div id="timeline-undated-list" className="border-t px-4 pt-3 pb-3">
                    <p className="text-xs text-muted-foreground">{t("timeline.undatedHint", { year: yearText(DEFAULT_YEAR) })}</p>
                    <ul className="mt-2 divide-y">
                      {view.undated.map((event) => {
                        const lane = laneOf(data, event.laneId);
                        const inputId = `timeline-undated-${event.id}`;
                        return (
                          <li key={event.id} className="flex items-center gap-3 py-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: lane?.color }} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => select(event.id)}
                                className={cn("block max-w-full truncate rounded-sm text-left text-sm font-medium hover:text-primary", FOCUS_RING)}
                              >
                                {event.title || t("untitled")}
                              </button>
                              <span className="block truncate text-xs text-muted-foreground">
                                {lane?.name} · {t("board.moment", { number: momentNumber(event.row) })}
                              </span>
                            </span>
                            <YearInput
                              id={inputId}
                              value={event.year}
                              placeholder={String(DEFAULT_YEAR)}
                              aria-label={`${t("event.year")} : ${event.title || t("untitled")}`}
                              onChange={(year) =>
                                mutate((d) => {
                                  const e = eventOf(d, event.id);
                                  if (e) e.year = year;
                                }, `ev:${event.id}:year`)
                              }
                              className="w-36 shrink-0"
                            />
                          </li>
                        );
                      })}
                    </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Panneau : l'événement choisi, ou les époques. */}
        {panel && (
          <aside id="timeline-panel" aria-label={t(`timeline.tabs.${panel}`)} className="flex min-h-0 min-w-0 flex-col border-t bg-card/40 lg:border-t-0 lg:border-l">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-gutter:stable]">
              {panel === "eras" ? (
                <ErasEditor data={data} mutate={mutate} yearText={yearText} openId={openEraId} onOpenChange={setOpenEraId} onShow={showEra} />
              ) : !selected ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CalendarRange className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="max-w-56 text-sm text-muted-foreground">{t("timeline.select")}</p>
                  {ordered.length > 0 && (
                    <Button variant="outline" onClick={() => go(1)}>
                      {t("timeline.first")}
                      <ChevronRight />
                    </Button>
                  )}
                </div>
              ) : (
                <EventPanel
                  projectId={projectId}
                  data={data}
                  eventId={selected.id}
                  index={selectedIndex}
                  total={ordered.length}
                  yearText={yearText}
                  whenText={whenText}
                  links={links}
                  mutate={mutate}
                  onPrevious={() => go(-1)}
                  onNext={() => go(1)}
                  onOpenBoard={() => {
                    requestFocus(selected.id);
                    openBoard();
                  }}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

function LegendItem({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex shrink-0 items-center">
        {mark}
      </span>
      {children}
    </span>
  );
}

/** Fiche de l'événement choisi : trame, années, lieu, âges, navigation. */
function EventPanel({
  projectId,
  data,
  eventId,
  index,
  total,
  yearText,
  whenText,
  links,
  mutate,
  onPrevious,
  onNext,
  onOpenBoard,
}: {
  projectId: string;
  data: PlotData;
  eventId: string;
  index: number;
  total: number;
  yearText: (year: number) => string;
  whenText: (year: number, detail: YearDetail | null) => string;
  links: ReturnType<typeof usePlotLinks>;
  mutate: (fn: (d: PlotData) => void, key?: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenBoard: () => void;
}) {
  const { t } = useTranslation("plot");
  const event = eventOf(data, eventId)!;
  const lane = laneOf(data, event.laneId);
  const people = [...new Set([event.povId, ...event.characterIds].filter((id): id is string => !!id))]
    .map((id) => links.character(id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const place = event.locationId ? links.locationName(event.locationId) : null;
  // Durée en années, seulement pour une période qui change d'année.
  const duration = event.year !== null && event.yearEnd !== null && event.yearEnd > event.year ? event.yearEnd - event.year : null;

  return (
    <div className="space-y-4">
      {/* Navigation dans le temps */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={onPrevious} disabled={index <= 0} aria-label={t("timeline.previous")} title={`${t("timeline.previous")} (←)`}>
          <ChevronLeft />
        </Button>
        <span className="flex-1 text-center text-xs text-muted-foreground tabular-nums">{index >= 0 ? t("timeline.position", { index: index + 1, total }) : "—"}</span>
        <Button variant="outline" size="icon-sm" onClick={onNext} disabled={index < 0 || index >= total - 1} aria-label={t("timeline.next")} title={`${t("timeline.next")} (→)`}>
          <ChevronRight />
        </Button>
      </div>

      {/* En-tête : trame, titre, années */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="h-1.5" style={{ background: lane?.color }} aria-hidden="true" />
        <div className="space-y-2 p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: lane?.color }} aria-hidden="true" />
            <span className="truncate">{lane?.name}</span>
            {lane?.hidden && <span>({t("timeline.hiddenLane")})</span>}
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{t("board.moment", { number: momentNumber(event.row) })}</span>
          </p>
          <h2 className="text-base leading-snug font-semibold">{event.title || t("untitled")}</h2>
          <p className={cn("text-lg font-semibold tabular-nums", event.year === null && "text-muted-foreground italic")}>
            {event.year === null ? yearText(DEFAULT_YEAR) : whenText(event.year, event.yearDetail)}
            {event.yearEnd !== null && <span className="font-normal text-muted-foreground"> → {whenText(event.yearEnd, event.yearEndDetail)}</span>}
          </p>
          {(event.date || duration !== null || place) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {event.date && (
                <>
                  <dt className="text-muted-foreground">{t("timeline.date")}</dt>
                  <dd>{event.date}</dd>
                </>
              )}
              {duration !== null && (
                <>
                  <dt className="text-muted-foreground">{t("timeline.span")}</dt>
                  <dd>{t("timeline.years", { count: duration })}</dd>
                </>
              )}
              {place && (
                <>
                  <dt className="text-muted-foreground">{t("timeline.place")}</dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{place}</span>
                  </dd>
                </>
              )}
            </dl>
          )}
          {event.note && <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground">{event.note}</p>}
        </div>
      </div>

      {/* Sans année : expliquer où il est placé et quoi faire. */}
      {event.year === null && (
        <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("timeline.noYearNotice", { year: yearText(DEFAULT_YEAR) })}
        </p>
      )}

      {/* Quand */}
      <Section title={t("timeline.when")} info={t("timeline.whenHint")} icon={<CalendarRange className="size-4 text-primary" aria-hidden="true" />}>
        <EventWhenFields
          event={event}
          precision={data.timePrecision}
          idPrefix={`timeline-${event.id}`}
          onChange={(which, patch, key) =>
            mutate((d) => {
              const e = eventOf(d, event.id);
              if (e) updateWhen(e, which, patch);
            }, key)
          }
        />
      </Section>

      {/* Âges */}
      {event.year !== null && (
        <Section title={t("timeline.ages")} icon={<Users className="size-4 text-primary" aria-hidden="true" />}>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("timeline.noCharactersInEvent")}</p>
          ) : (
            <ul className="space-y-1.5">
              {people.map((character) => {
                const born = yearInText(character.fields.birthDate);
                const age = ageAt(born, event.year!);
                return (
                  <li key={character.id} className="flex items-center gap-2">
                    <CharacterAvatar projectId={projectId} character={character} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{fullName(character)}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs tabular-nums",
                        age !== null ? "bg-primary/10 font-medium text-primary" : "border text-muted-foreground italic",
                      )}
                    >
                      {age !== null ? t("timeline.age", { count: age }) : born === null ? t("timeline.unknownBirth") : t("timeline.notBorn")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <Button variant="outline" className="w-full" onClick={onOpenBoard}>
        <Columns3 />
        {t("timeline.openOnBoard")}
      </Button>
    </div>
  );
}

function Section({ title, info, icon, children }: { title: string; info?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {children}
    </section>
  );
}
