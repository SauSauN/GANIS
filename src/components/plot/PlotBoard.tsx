import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BookOpen,
  Columns3,
  LayoutTemplate,
  ListTree,
  MoreHorizontal,
  Eye,
  EyeOff,
  Footprints,
  Loader2,
  Maximize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import {
  addEvent,
  addEventSmart,
  addLane,
  createLink,
  createLinkedEvent,
  deleteEvent,
  deleteLink,
  moveEvent,
  nudgeSelected,
  openOrCreateAt,
} from "@/components/plot/actions";
import {
  cardOrigin,
  cellCenter,
  clampZoom,
  GUTTER,
  HEAD,
  linkPath,
  metrics,
  rowAt,
  rowTop,
  slotAt,
  smoothPath,
  TENSION_W,
} from "@/components/plot/geometry";
import { KindIcon } from "@/components/plot/KindIcon";
import { PlotPanel } from "@/components/plot/PlotPanel";
import { PlotStructureImportDialog, PlotTemplatesDialog } from "@/components/plot/PlotDialogs";
import { ActionMenu } from "@/components/documents/ActionMenu";
import { PlotTour, type TourState } from "@/components/plot/PlotTour";
import { PlotViewMenu, type PlotView } from "@/components/plot/PlotViewMenu";
import { usePlotLinks } from "@/components/plot/usePlotLinks";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { useRegisterCommands } from "@/lib/commands";
import {
  computeFocus,
  EMPTY_FILTER,
  eventOf,
  filterActive,
  matchesFilter,
  momentNumber,
  occupant,
  pastRowsCount,
  rowsCount,
  STATUS_COLORS,
  visibleLanes,
  type PlotData,
  type PlotEvent,
  type PlotFilter,
} from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";

// v2 : la colonne de tension est désormais cachée par défaut.
const VIEW_KEY = "ganis.plot.view.v2";
const PANEL_KEY = "ganis.plot.panel";

const DEFAULT_VIEW: PlotView = {
  zoom: 1,
  kinds: { impact: true, influence: true, meeting: true },
  labels: true,
  notes: true,
  tension: false,
  rowLines: true,
};

function readView(): PlotView {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<PlotView> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_VIEW;
    return {
      zoom: typeof raw.zoom === "number" ? clampZoom(raw.zoom) : 1,
      kinds: { ...DEFAULT_VIEW.kinds, ...(raw.kinds ?? {}) },
      labels: raw.labels !== false,
      notes: raw.notes !== false,
      tension: raw.tension === true,
      rowLines: raw.rowLines !== false,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

function writeView(view: PlotView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Préférence gardée pour cette séance.
  }
}

type Drag =
  | { type: "move"; id: string; left: number; top: number; column: number; row: number; moved: boolean }
  | { type: "link"; from: string; x: number; y: number; over: string | null; slot: { column: number; row: number } | null }
  | { type: "lane"; id: string; dx: number; target: number; moved: boolean }
  | null;

interface PlotBoardProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Plateau de la trame : une colonne par trame, le temps vers le bas, les
 * événements dans les cases, les liens de cause à effet entre eux, la
 * colonne de tension à droite. Le panneau de droite montre ce qui est
 * choisi (événement, lien, trame, moment) ou l'ensemble du projet.
 */
export function PlotBoard({ projectId, feature, onOpenFeature }: PlotBoardProps) {
  const { t } = useTranslation(["plot", "common"]);
  const { data, loading, error } = useProjectPlot(projectId);
  const links = usePlotLinks(projectId);
  const selection = usePlotStore((s) => s.selection);
  const select = usePlotStore((s) => s.select);
  const undo = usePlotStore((s) => s.undo);
  const redo = usePlotStore((s) => s.redo);
  const canUndo = usePlotStore((s) => s.undoStack.length > 0);
  const canRedo = usePlotStore((s) => s.redoStack.length > 0);
  const flush = usePlotStore((s) => s.flush);
  const mutate = usePlotStore((s) => s.mutate);
  const focusRequest = usePlotStore((s) => s.focusRequest);

  const [view, setViewState] = useState<PlotView>(readView);
  const [filter, setFilter] = useState<PlotFilter>(EMPTY_FILTER);
  const [clean, setClean] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem(PANEL_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [tour, setTour] = useState<TourState | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const tensionPainting = useRef(false);
  const tensionRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<"templates" | "import" | null>(null);
  /** Vrai juste après un glisser : le « click » qui suit ne doit rien désélectionner. */
  const justDragged = useRef(false);
  const markDragged = () => {
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 0);
  };

  /** Lignes du passé narratif, au-dessus du début de l'histoire. */
  const past = data ? pastRowsCount(data) : 0;
  const m = metrics(view.zoom, past);
  const setView = useCallback((next: PlotView) => {
    setViewState(next);
    writeView(next);
  }, []);

  const lanes = data ? visibleLanes(data) : [];
  /** Moments de l'histoire principale (à partir du début). */
  const rows = data ? rowsCount(data) : 10;
  /** Lignes affichées : passé narratif + histoire principale. */
  const total = past + rows;
  const width = lanes.length * m.lane;
  const height = total * m.row;
  const columnOf = useCallback((laneId: string) => lanes.findIndex((l) => l.id === laneId), [lanes]);

  // Textes liés à chaque événement (pour la recherche et la mise en avant).
  const linkedText = useCallback(
    (event: PlotEvent) =>
      [
        ...event.characterIds.map(links.characterName),
        event.povId ? links.characterName(event.povId) : "",
        event.locationId ? links.locationName(event.locationId) : "",
        event.nodeId ? links.nodeLabel(event.nodeId) : "",
      ]
        .filter(Boolean)
        .join(" "),
    [links],
  );

  const focus = data ? computeFocus(data, selection) : null;
  const active = filterActive(filter);
  const dimmed = useCallback(
    (event: PlotEvent) => Boolean((focus && !focus.nodes.has(event.id)) || (active && !matchesFilter(event, filter, linkedText(event)))),
    [focus, active, filter, linkedText],
  );


  // --- Commandes de l'application (Ctrl+N, Ctrl+S) ------------------------

  useRegisterCommands({
    new: { label: t("toolbar.newEvent"), run: () => void addEventSmart(projectId) },
    save: { run: () => void flush() },
  });

  // Enregistrement en quittant l'onglet.
  useEffect(() => () => void usePlotStore.getState().flush(), []);

  // --- Zoom ----------------------------------------------------------------

  const setZoom = useCallback(
    (zoom: number) => {
      const next = clampZoom(zoom);
      if (next === view.zoom) return;
      const scroller = scrollerRef.current;
      const ratio = next / view.zoom;
      const cx = scroller ? scroller.scrollLeft + scroller.clientWidth / 2 : 0;
      const cy = scroller ? scroller.scrollTop + scroller.clientHeight / 2 : 0;
      setView({ ...view, zoom: next });
      if (scroller) {
        requestAnimationFrame(() => {
          scroller.scrollLeft = (cx - GUTTER) * ratio + GUTTER - scroller.clientWidth / 2;
          scroller.scrollTop = (cy - HEAD) * ratio + HEAD - scroller.clientHeight / 2;
        });
      }
    },
    [view, setView],
  );

  const fitZoom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !lanes.length) return;
    setZoom(Math.min(1.4, (scroller.clientWidth - GUTTER - 6 - (view.tension ? TENSION_W : 0)) / (lanes.length * 236)));
    scroller.scrollLeft = 0;
  }, [lanes.length, setZoom, view.tension]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(view.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [setZoom, view.zoom]);

  // --- Faire défiler jusqu'à un événement ----------------------------------

  const scrollToEvent = useCallback((id: string, center = false) => {
    requestAnimationFrame(() => {
      const node = stageRef.current?.querySelector<HTMLElement>(`[data-event="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: center ? "center" : "nearest", inline: center ? "center" : "nearest", behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    if (!focusRequest || !data) return;
    const event = eventOf(data, focusRequest.eventId);
    if (!event) return;
    if (data.lanes.find((l) => l.id === event.laneId)?.hidden) {
      mutate(projectId, (d) => {
        const lane = d.lanes.find((l) => l.id === event.laneId);
        if (lane) lane.hidden = false;
      });
    }
    scrollToEvent(event.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.at, Boolean(data)]);

  // --- Glisser : cartes, liens, trames, tension ----------------------------

  const pointer = useRef({ x: 0, y: 0 });
  const autoScroll = useRef<number | null>(null);

  const stagePoint = useCallback(() => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: pointer.current.x - rect.left, y: pointer.current.y - rect.top };
  }, []);

  const startAutoScroll = useCallback((apply: () => void) => {
    const tick = () => {
      const scroller = scrollerRef.current;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const M = 56;
        const p = pointer.current;
        let dx = 0;
        let dy = 0;
        if (p.y > r.bottom - M) dy = Math.min(20, (p.y - (r.bottom - M)) / 3 + 2);
        else if (p.y < r.top + HEAD + M) dy = -Math.min(20, (r.top + HEAD + M - p.y) / 3 + 2);
        if (p.x > r.right - M) dx = Math.min(20, (p.x - (r.right - M)) / 3 + 2);
        else if (p.x < r.left + GUTTER + M) dx = -Math.min(20, (r.left + GUTTER + M - p.x) / 3 + 2);
        if (dx || dy) {
          scroller.scrollLeft += dx;
          scroller.scrollTop += dy;
          apply();
        }
      }
      autoScroll.current = requestAnimationFrame(tick);
    };
    autoScroll.current = requestAnimationFrame(tick);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }, []);

  function startMove(event: ReactPointerEvent, plotEvent: PlotEvent) {
    if ((event.pointerType === "mouse" && event.button !== 0) || editing === plotEvent.id) return;
    const column = columnOf(plotEvent.laneId);
    const origin = cardOrigin(m, column, plotEvent.row);
    const rect = stageRef.current!.getBoundingClientRect();
    const offset = { x: event.clientX - rect.left - origin.left, y: event.clientY - rect.top - origin.top };
    const start = { x: event.clientX, y: event.clientY };
    pointer.current = start;
    let moved = false;
    let last: Drag = null;

    const apply = () => {
      const p = stagePoint();
      const left = p.x - offset.x;
      const top = p.y - offset.y;
      const slot = slotAt(m, left + m.node / 2, top + m.nodeHeight / 2, lanes.length, total);
      last = { type: "move", id: plotEvent.id, left, top, column: slot.column, row: slot.row, moved: true };
      setDrag(last);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!moved) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
        moved = true;
        startAutoScroll(apply);
      }
      apply();
    };
    const end = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      stopAutoScroll();
      setDrag(null);
      if (!moved) {
        if (commit) select({ type: "event", id: plotEvent.id });
        return;
      }
      markDragged();
      const d = last as Extract<Drag, { type: "move" }> | null;
      if (commit && d) {
        const lane = lanes[d.column];
        if (lane && (lane.id !== plotEvent.laneId || d.row !== plotEvent.row)) moveEvent(projectId, plotEvent.id, lane.id, d.row);
        select({ type: "event", id: plotEvent.id });
      }
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function startLink(event: ReactPointerEvent, plotEvent: PlotEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointer.current = { x: event.clientX, y: event.clientY };
    let last: Extract<Drag, { type: "link" }> | null = null;

    const apply = () => {
      const p = stagePoint();
      const under = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest<HTMLElement>("[data-event]");
      const over = under && under.dataset.event !== plotEvent.id ? under.dataset.event! : null;
      const inside = p.x >= 0 && p.x < lanes.length * m.lane && p.y >= 0;
      last = { type: "link", from: plotEvent.id, x: p.x, y: p.y, over, slot: !over && inside ? slotAt(m, p.x, p.y, lanes.length, total) : null };
      setDrag(last);
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (autoScroll.current === null) startAutoScroll(apply);
      apply();
    };
    const end = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      stopAutoScroll();
      setDrag(null);
      markDragged();
      if (!commit || !last || !data) return;
      if (last.over) {
        createLink(projectId, plotEvent.id, last.over);
        return;
      }
      if (last.slot) {
        const lane = lanes[last.slot.column];
        const occ = occupant(data, lane.id, last.slot.row);
        if (occ?.id === plotEvent.id) return;
        if (occ) createLink(projectId, plotEvent.id, occ.id);
        else createLinkedEvent(projectId, plotEvent.id, lane.id, last.slot.row);
      }
    };
    const onUp = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      apply();
      end(true);
    };
    const onCancel = () => end(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function startLaneDrag(event: ReactPointerEvent, laneId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const from = columnOf(laneId);
    if (from < 0) return;
    const startX = event.clientX;
    const scroll0 = scrollerRef.current?.scrollLeft ?? 0;
    pointer.current = { x: event.clientX, y: event.clientY };
    let moved = false;
    let target = from;

    const apply = () => {
      const p = stagePoint();
      target = Math.min(lanes.length - 1, Math.max(0, Math.floor(p.x / m.lane)));
      setDrag({ type: "lane", id: laneId, dx: pointer.current.x - startX + ((scrollerRef.current?.scrollLeft ?? 0) - scroll0), target, moved: true });
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!moved) {
        if (Math.abs(e.clientX - startX) < 6) return;
        moved = true;
        startAutoScroll(apply);
      }
      apply();
    };
    const end = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      stopAutoScroll();
      setDrag(null);
      if (!moved) {
        if (commit) select({ type: "lane", id: laneId });
        return;
      }
      markDragged();
      if (commit && target !== from) {
        mutate(projectId, (d) => {
          const v = visibleLanes(d);
          const lane = d.lanes.find((l) => l.id === laneId)!;
          const to = d.lanes.indexOf(v[target]);
          d.lanes.splice(d.lanes.indexOf(lane), 1);
          d.lanes.splice(to, 0, lane);
        });
        select({ type: "lane", id: laneId });
      }
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Valeur de tension sous le pointeur (colonne Tension, à gauche). */
  const tensionAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!tensionRef.current) return null;
      const rect = tensionRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        row: rowAt(m, y, total),
        value: Math.min(10, Math.max(0, Math.round(((x - 8) / (TENSION_W - 16)) * 10))),
      };
    },
    [m, total],
  );

  function onTensionPointerDown(event: ReactPointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const first = tensionAt(event.clientX, event.clientY);
    if (!first) return;
    event.preventDefault();
    tensionPainting.current = true;
    const paint = (tn: { row: number; value: number }) =>
      mutate(projectId, (d) => {
        d.tension[tn.row] = tn.value;
      }, { key: "tension-paint" });
    paint(first);
    const onMove = (e: PointerEvent) => {
      const tn = tensionAt(e.clientX, e.clientY);
      if (tn) paint(tn);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTimeout(() => (tensionPainting.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onTensionDoubleClick(event: React.MouseEvent) {
    const tn = tensionAt(event.clientX, event.clientY);
    if (tn && data?.tension[tn.row] !== undefined) {
      mutate(projectId, (d) => {
        delete d.tension[tn.row];
      });
    }
  }

  function onStageDoubleClick(event: React.MouseEvent) {
    if (!data) return;
    const target = event.target as Element;
    if (target !== event.currentTarget && !target.closest("svg")) return;
    if (target.closest("[data-link]")) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const slot = slotAt(m, event.clientX - rect.left, event.clientY - rect.top, lanes.length, total);
    const lane = lanes[slot.column];
    if (lane) openOrCreateAt(projectId, lane.id, slot.row);
  }

  // --- Parcours ------------------------------------------------------------

  const startTour = useCallback(
    (mode: TourState["mode"] = "structure", laneId: string | null = null) => {
      if (!data?.events.length) return;
      setTour({ mode, laneId, startId: selection?.type === "event" ? selection.id : null });
    },
    [data?.events.length, selection],
  );

  // --- Clavier -------------------------------------------------------------

  function onKeyDown(event: ReactKeyboardEvent) {
    const el = event.target as HTMLElement;
    const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && !typing && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !typing && key === "y") {
      event.preventDefault();
      event.stopPropagation();
      redo();
      return;
    }
    if (mod && key === "b") {
      event.preventDefault();
      togglePanel();
      return;
    }
    if (event.key === "Escape") {
      if (tour) setTour(null);
      else if (menuOpen) setMenuOpen(false);
      else if (selection) select(null);
      else if (clean) setClean(false);
      else return;
      event.stopPropagation();
      return;
    }
    if (typing) return;
    if (tour && (event.key === "ArrowRight" || event.key === "ArrowLeft")) return; // géré par le parcours
    if ((event.key === "Delete" || event.key === "Backspace") && selection) {
      if (selection.type === "event") {
        event.preventDefault();
        deleteEvent(projectId, selection.id);
      } else if (selection.type === "link") {
        event.preventDefault();
        deleteLink(projectId, selection.id);
      }
      return;
    }
    if (event.altKey && selection?.type === "event") {
      const delta = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[event.key];
      if (delta) {
        event.preventDefault();
        nudgeSelected(projectId, delta[0], delta[1]);
        scrollToEvent(selection.id);
      }
      return;
    }
    if (!mod && !event.altKey) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom(view.zoom * 1.15);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom(view.zoom / 1.15);
      } else if (event.key === "0") {
        event.preventDefault();
        fitZoom();
      }
    }
  }

  function togglePanel() {
    setPanelOpen((open) => {
      try {
        localStorage.setItem(PANEL_KEY, open ? "0" : "1");
      } catch {
        // Préférence gardée pour cette séance.
      }
      return !open;
    });
  }

  // Choix fait ailleurs (panneau, parcours) : la carte reste visible.
  useLayoutEffect(() => {
    if (selection?.type === "event" && !drag) scrollToEvent(selection.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.type === "event" ? selection.id : null]);

  // --- Passé narratif : ouverture au début de l'histoire --------------------

  // À l'ouverture, le plateau montre le début de l'histoire (moment 1) ; le
  // passé narratif est au-dessus, on y remonte en faisant défiler.
  const positioned = useRef(false);
  const lastPast = useRef(past);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !data) return;
    if (!positioned.current) {
      positioned.current = true;
      lastPast.current = past;
      // Un mince bandeau du passé reste visible en haut : il montre le repère
      // « Début de l'histoire » et invite à remonter.
      scroller.scrollTop = Math.max(0, past * m.row - Math.round(m.row * 0.35));
      return;
    }
    // Le passé s'agrandit (événement plus ancien) ou se réduit : on compense
    // pour que ce qui est à l'écran ne saute pas.
    if (past !== lastPast.current) {
      scroller.scrollTop += (past - lastPast.current) * m.row;
      lastPast.current = past;
    }
  }, [Boolean(data), past, m.row]);

  // --- Rendu ---------------------------------------------------------------

  const geometryOf = useCallback(
    (event: PlotEvent) => {
      if (drag?.type === "move" && drag.id === event.id) {
        return { cx: drag.left + m.node / 2, cy: drag.top + m.nodeHeight / 2, column: drag.column, color: lanes[drag.column]?.color ?? "#888" };
      }
      const column = columnOf(event.laneId);
      if (column < 0) return null;
      return { ...cellCenter(m, column, event.row), column, color: lanes[column].color };
    },
    [drag, m, lanes, columnOf],
  );

  const svg = useMemo(() => {
    if (!data) return null;
    return <BoardSvg data={data} m={m} lanes={lanes} rows={total} width={width} height={height} view={view} selection={selection} focus={focus} geometryOf={geometryOf} dimmed={dimmed} />;
  }, [data, m, lanes, total, width, height, view, selection, focus, geometryOf, dimmed]);

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

  const written = data.events.filter((e) => e.status === "written" || e.status === "revised").length;
  const unplaced = links.nodes.length ? data.events.filter((e) => !e.nodeId).length : 0;
  const selectedLane = selection?.type === "lane" ? selection.id : null;

  return (
    <main ref={rootRef} className="relative flex min-h-0 flex-1 flex-col outline-none" onKeyDown={onKeyDown} tabIndex={-1}>
      <h1 className="sr-only">{feature.label}</h1>

      {/* Barre d'outils : l'essentiel visible, le reste dans « Plus » */}
      {!clean && (
        <div className="flex items-center gap-2 border-b bg-card/60 px-3 py-1.5">
          <div className="flex items-center" role="group" aria-label={t("toolbar.zoom")}>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(view.zoom / 1.15)} aria-label={t("toolbar.zoomOut")} title={`${t("toolbar.zoomOut")} (-)`}>
              <Minus />
            </Button>
            <button type="button" onClick={fitZoom} title={`${t("toolbar.fit")} (0)`} className="h-7 min-w-11 rounded-md px-1 text-xs text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground">
              {Math.round(view.zoom * 100)} %
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => setZoom(view.zoom * 1.15)} aria-label={t("toolbar.zoomIn")} title={`${t("toolbar.zoomIn")} (+)`}>
              <Plus />
            </Button>
          </div>

          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={undo} aria-label={t("toolbar.undo")} title={`${t("toolbar.undo")} (Ctrl+Z)`}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={redo} aria-label={t("toolbar.redo")} title={`${t("toolbar.redo")} (Ctrl+Y)`}>
            <Redo2 />
          </Button>

          <span className="h-5 w-px bg-border" aria-hidden="true" />
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view.tension}
            onClick={() => setView({ ...view, tension: !view.tension })}
            title={view.tension ? t("toolbar.tensionHide") : t("toolbar.tensionShow")}
            className={cn(view.tension && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
          >
            <Activity />
            {t("board.tension")}
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" onClick={() => addEventSmart(projectId)} title={`${t("toolbar.newEvent")} (Ctrl+N)`}>
              <Plus />
              {t("toolbar.newEvent")}
            </Button>
            <Button size="sm" onClick={() => void addLane(projectId)} title={t("toolbar.newLaneHint")}>
              <Plus />
              {t("toolbar.newLaneShort")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenFeature("plot.reading")} title={t("toolbar.readingHint")}>
              <BookOpen />
              {t("toolbar.reading")}
            </Button>
            <Button
              ref={viewButtonRef}
              variant="ghost"
              size="icon-sm"
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("toolbar.view")}
              title={t("toolbar.view")}
              className={cn(active && "text-primary")}
            >
              <SlidersHorizontal />
            </Button>
            <ActionMenu
              label={t("toolbar.more")}
              trigger={<MoreHorizontal className="size-4" />}
              items={[
                { id: "tour", label: t("toolbar.tour"), icon: Footprints, disabled: !data.events.length, run: () => startTour() },
                { id: "import", label: t("project.fromStructure"), icon: ListTree, separated: true, run: () => setDialog("import") },
                { id: "templates", label: t("project.templates"), icon: LayoutTemplate, run: () => setDialog("templates") },
                { id: "clean", label: t("toolbar.clean"), icon: EyeOff, separated: true, run: () => setClean(true) },
              ]}
            />
            <Button variant="ghost" size="icon-sm" onClick={togglePanel} aria-label={t("toolbar.panel")} aria-expanded={panelOpen} title={`${t("toolbar.panel")} (Ctrl+B)`}>
              {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Plateau */}
        <div className="relative min-w-0 flex-1">
        {lanes.length === 0 && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-muted/30 p-6">
            <div className="max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
              <Columns3 className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">{data.lanes.length ? t("board.allHiddenTitle") : t("board.noLanesTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{data.lanes.length ? t("board.allHiddenHint") : t("board.noLanesHint")}</p>
              {!data.lanes.length && (
                <Button className="mt-4" onClick={() => void addLane(projectId)}>
                  <Plus />
                  {t("toolbar.newLaneShort")}
                </Button>
              )}
            </div>
          </div>
        )}
        <div ref={scrollerRef} className="absolute inset-0 overflow-auto overscroll-contain bg-muted/30">
          {/* En-têtes des trames */}
          <div className="sticky top-0 z-20 flex w-max min-w-full border-b bg-background" style={{ height: HEAD }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-end justify-center border-r bg-background pb-2 text-xs text-muted-foreground italic" style={{ width: GUTTER }}>
              {t("board.time")}
            </div>
            {view.tension && (
              <div
                className="sticky z-30 flex shrink-0 flex-col items-center justify-center border-r bg-background text-center"
                style={{ left: GUTTER, width: TENSION_W }}
                title={t("board.tensionHelp")}
              >
                <span className="text-xs font-semibold">{t("board.tension")}</span>
                <span className="text-[0.65rem] text-muted-foreground">{t("board.tensionHint")}</span>
              </div>
            )}
            {lanes.map((lane, index) => {
              const dragging = drag?.type === "lane" && drag.id === lane.id;
              return (
                <div
                  key={lane.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedLane === lane.id}
                  onPointerDown={(e) => !(e.target as Element).closest("[data-add]") && startLaneDrag(e, lane.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select({ type: "lane", id: lane.id }))}
                  className={cn(
                    "group relative flex shrink-0 cursor-pointer flex-col justify-center border-r border-border/60 pr-10 pl-6 select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                    lane.main && "bg-[color-mix(in_oklch,var(--lane)_10%,transparent)]",
                    selectedLane === lane.id && "shadow-[inset_0_-3px_0_var(--lane)]",
                    dragging && "z-40 cursor-grabbing bg-card opacity-95 shadow-lg",
                  )}
                  style={{
                    width: m.lane,
                    borderTop: `${lane.main ? 6 : 4}px solid ${lane.color}`,
                    ["--lane" as string]: lane.color,
                    transform: dragging ? `translateX(${drag.dx}px)` : undefined,
                  }}
                  title={`${lane.main ? t("board.mainLane") : lane.characterId && links.characterName(lane.characterId) ? t("board.characterLane", { name: links.characterName(lane.characterId) }) : t("board.parallelLane")} · ${t("board.dragLane")}`}
                  aria-label={t("board.laneAria", { name: lane.name, index: index + 1 })}
                >
                  <span className="absolute top-1/2 left-2 h-5 w-2.5 -translate-y-1/2 cursor-grab opacity-40 group-hover:opacity-90" aria-hidden="true" style={{ background: "radial-gradient(circle, currentColor 1.2px, transparent 1.6px) 0 0 / 5px 6px" }} />
                  <span className={cn("truncate font-semibold", lane.main ? "text-[0.95rem]" : "text-sm")}>{lane.name || t("untitled")}</span>
                  <button
                    type="button"
                    data-add
                    onClick={() => addEvent(projectId, lane.id)}
                    aria-label={t("board.addTo", { name: lane.name })}
                    title={t("board.addTo", { name: lane.name })}
                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:border-[var(--lane)] hover:text-[var(--lane)] focus-visible:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex w-max min-w-full">
            {/* Moments */}
            <div className="sticky left-0 z-10 shrink-0 border-r bg-background" style={{ width: GUTTER, height }}>
              {Array.from({ length: total }, (_, index) => {
                const row = index - past;
                const isRow = selection?.type === "row" && selection.id === row;
                const label = data.rowLabels[row];
                return (
                  <button
                    key={row}
                    type="button"
                    onClick={() => select({ type: "row", id: row })}
                    title={row < 0 ? t("board.pastMoment", { number: momentNumber(row) }) : t("board.moment", { number: momentNumber(row) })}
                    className={cn(
                      "absolute inset-x-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center hover:bg-muted",
                      row < 0 && "text-muted-foreground",
                      isRow && "bg-muted shadow-[inset_3px_0_0_var(--foreground)]",
                    )}
                    style={{ top: index * m.row, height: m.row }}
                  >
                    <span className="text-sm font-semibold tabular-nums">{momentNumber(row)}</span>
                    {label && <span className="line-clamp-2 text-[0.65rem] leading-tight break-words text-muted-foreground">{label}</span>}
                  </button>
                );
              })}
            </div>

            {/* Tension (à gauche, toujours visible) */}
            {view.tension && (
              <div
                ref={tensionRef}
                className="sticky z-10 shrink-0 cursor-crosshair touch-none border-r bg-background"
                style={{ left: GUTTER, width: TENSION_W, height }}
                onPointerDown={onTensionPointerDown}
                onDoubleClick={onTensionDoubleClick}
                role="img"
                aria-label={t("board.tensionAria")}
                title={t("board.tensionHelp")}
              >
                <TensionCurve data={data} rows={total} past={past} rowHeight={m.row} width={TENSION_W} rowLines={view.rowLines} />
              </div>
            )}

            {/* Scène */}
            <div
              ref={stageRef}
              className="relative isolate shrink-0"
              style={{ width, height }}
              onDoubleClick={onStageDoubleClick}
              onClick={(e) => {
                if (tensionPainting.current || justDragged.current) return;
                if (e.target === e.currentTarget && selection) select(null);
              }}
            >
              {svg}

              {/* Liens en cours de création */}
              {drag?.type === "link" && (() => {
                const from = eventOf(data, drag.from);
                const a = from && geometryOf(from);
                if (!a) return null;
                const dir = drag.x >= a.cx ? 1 : -1;
                const x1 = a.cx + (dir * m.node) / 2;
                const dx = Math.max(30, Math.abs(drag.x - x1) * 0.5);
                return (
                  <svg className="pointer-events-none absolute inset-0 z-30 overflow-visible" width={width} height={height} aria-hidden="true">
                    <path d={`M${x1},${a.cy} C${x1 + dir * dx},${a.cy} ${drag.x - dir * dx},${drag.y} ${drag.x},${drag.y}`} fill="none" stroke={a.color} strokeWidth={3} strokeDasharray="2 6" strokeLinecap="round" />
                  </svg>
                );
              })()}

              {/* Cases d'arrivée */}
              {drag?.type === "move" && lanes[drag.column] && (
                <div
                  className="pointer-events-none absolute z-[1] rounded-md border-2 border-dashed"
                  style={{ ...cardOrigin(m, drag.column, drag.row), width: m.node, height: m.nodeHeight, borderColor: lanes[drag.column].color, background: `color-mix(in oklch, ${lanes[drag.column].color} 12%, transparent)` }}
                />
              )}
              {drag?.type === "link" && drag.slot && lanes[drag.slot.column] && (
                <div
                  className="pointer-events-none absolute z-[1] rounded-md border-2 border-dashed"
                  style={{ ...cardOrigin(m, drag.slot.column, drag.slot.row), width: m.node, height: m.nodeHeight, borderColor: lanes[drag.slot.column].color }}
                />
              )}
              {drag?.type === "lane" && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-0 border-2 border-dashed"
                  style={{ left: drag.target * m.lane, width: m.lane, borderColor: lanes[columnOf(drag.id)]?.color }}
                />
              )}

              {/* Cartes */}
              {data.events.map((event) => {
                const column = columnOf(event.laneId);
                if (column < 0) return null;
                const lane = lanes[column];
                const isDragging = drag?.type === "move" && drag.id === event.id;
                const origin = isDragging ? { left: drag.left, top: drag.top } : cardOrigin(m, column, event.row);
                const selected = selection?.type === "event" && selection.id === event.id;
                const people = event.characterIds.map((id) => ({ id, name: links.characterName(id) })).filter((p) => p.name);
                const pov = event.povId ? links.characterName(event.povId) : null;
                const place = event.locationId ? links.locationName(event.locationId) : null;
                const node = event.nodeId ? links.nodeLabel(event.nodeId) : null;
                const target = drag?.type === "link" && drag.over === event.id;
                return (
                  <div
                    key={event.id}
                    data-event={event.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={t("board.eventAria", { title: event.title || t("untitled"), lane: lane.name, moment: momentNumber(event.row), status: t(`status.${event.status}`) })}
                    title={event.note || undefined}
                    onPointerDown={(e) => {
                      if ((e.target as Element).closest("[data-handle]") || (e.target as Element).closest("textarea")) return;
                      startMove(e, event);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditing(event.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select({ type: "event", id: event.id });
                      } else if (e.key === "F2") {
                        e.preventDefault();
                        setEditing(event.id);
                      }
                    }}
                    className={cn(
                      "group/card absolute z-[2] cursor-grab touch-none overflow-visible rounded-md border bg-card shadow-sm transition-[opacity,box-shadow] select-none hover:border-[var(--lane)] focus-visible:outline-none",
                      lane.main && "bg-[color-mix(in_oklch,var(--lane)_6%,var(--card))]",
                      selected && "outline-[2.5px] outline-offset-2 outline-[var(--lane)] outline-solid",
                      dimmed(event) && !selected && "opacity-25",
                      isDragging && "z-30 cursor-grabbing shadow-xl transition-none",
                      target && "outline-[3px] outline-offset-[3px] outline-primary outline-solid",
                    )}
                    style={{
                      ...origin,
                      width: m.node,
                      height: m.nodeHeight,
                      borderLeft: `${Math.max(3, Math.round((lane.main ? 8 : 6) * m.zoom))}px solid ${lane.color}`,
                      padding: `${7 * m.zoom}px ${9 * m.zoom}px ${6 * m.zoom}px ${11 * m.zoom}px`,
                      ["--lane" as string]: lane.color,
                    }}
                  >
                    {editing === event.id ? (
                      <InlineTitle
                        initial={event.title}
                        fontSize={Math.max(9, 13.5 * m.zoom)}
                        label={t("board.editTitle")}
                        onDone={(value) => {
                          setEditing(null);
                          if (value !== null && value !== event.title) {
                            mutate(projectId, (d) => {
                              const e = eventOf(d, event.id);
                              if (e) e.title = value || t("untitled");
                            });
                          }
                        }}
                      />
                    ) : (
                      <p className={cn("leading-tight font-semibold", m.zoom < 0.75 ? "line-clamp-3" : "line-clamp-2")} style={{ fontSize: Math.max(9, 13.5 * m.zoom) }}>
                        {event.title || t("untitled")}
                      </p>
                    )}
                    {view.notes && m.zoom >= 0.75 && event.note && (
                      <p className="mt-0.5 truncate text-muted-foreground" style={{ fontSize: Math.max(8, 11.5 * m.zoom) }}>
                        {event.note}
                      </p>
                    )}
                    {m.zoom >= 0.75 && (
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground" style={{ fontSize: Math.max(8, 10.5 * m.zoom) }}>
                        <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[event.status] }} title={t(`status.${event.status}`)} />
                        <span className="min-w-0 truncate">
                          {pov && <b className="font-semibold text-foreground">{pov}</b>}
                          {people.filter((p) => p.id !== event.povId).map((p, i) => (
                            <span key={p.id}>
                              {pov || i > 0 ? ", " : ""}
                              {p.name}
                            </span>
                          ))}
                          {place && <i className="opacity-90"> {place}</i>}
                          {!pov && !people.length && !place && (node ?? t(`status.${event.status}`))}
                        </span>
                      </p>
                    )}
                    {event.pivot && (
                      <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border-2 border-background text-[0.6rem] text-white" style={{ backgroundColor: lane.color }} title={t("board.pivot")}>
                        ◆
                      </span>
                    )}
                    {node && m.zoom >= 0.75 && (pov || people.length > 0 || place) && (
                      <span className="absolute -bottom-2 left-2 max-w-[70%] truncate rounded-full border bg-background px-1.5 text-[0.6rem] leading-4 text-muted-foreground" title={node}>
                        {node}
                      </span>
                    )}
                    <span
                      data-handle
                      onPointerDown={(e) => startLink(e, event)}
                      title={t("board.handle")}
                      className={cn(
                        "absolute top-1/2 -right-2.5 size-[18px] -translate-y-1/2 cursor-crosshair touch-none rounded-full border-[2.5px] border-card opacity-0 transition-opacity group-hover/card:opacity-100 after:absolute after:-inset-2",
                        (selected || (drag?.type === "link" && drag.from === event.id)) && "opacity-100",
                      )}
                      style={{ backgroundColor: lane.color }}
                    />
                  </div>
                );
              })}

              {/* Noms des liens et débuts d'actes */}
              <div className="pointer-events-none absolute inset-0 z-[3]">
                {view.labels &&
                  data.links.map((link) => {
                    if (!view.kinds[link.kind] || !link.label) return null;
                    const a = eventOf(data, link.from);
                    const b = eventOf(data, link.to);
                    const ga = a && geometryOf(a);
                    const gb = b && geometryOf(b);
                    if (!ga || !gb) return null;
                    const path = linkPath(m, ga, gb);
                    const selected = selection?.type === "link" && selection.id === link.id;
                    const dim = (focus && !focus.links.has(link.id)) || (active && a && b && !(matchesFilter(a, filter, linkedText(a)) && matchesFilter(b, filter, linkedText(b))));
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => select({ type: "link", id: link.id })}
                        title={link.label}
                        className={cn(
                          "pointer-events-auto absolute max-w-[150px] truncate rounded-full select-none border-[1.5px] bg-card px-2 text-[0.7rem] leading-[1.55] font-medium shadow-sm transition-opacity",
                          path.sameColumn ? "-translate-y-1/2" : "-translate-x-1/2 -translate-y-1/2",
                          dim && "opacity-20",
                          selected && "text-white",
                        )}
                        style={{ left: path.mx, top: path.my, borderColor: ga.color, backgroundColor: selected ? ga.color : undefined }}
                      >
                        {link.label}
                      </button>
                    );
                  })}
                {/* Début de l'histoire principale : le passé narratif est au-dessus */}
                <span
                  className="pointer-events-auto absolute right-2 z-[3] -translate-y-1/2 rounded-full border border-primary/40 bg-background px-2.5 py-0.5 text-xs font-medium text-primary shadow-sm select-none"
                  style={{ top: past * m.row }}
                  title={t("board.storyStartHint")}
                >
                  {t("board.storyStart")}
                </span>
                {Object.entries(data.acts).map(([row, act]) => (
                  <button
                    key={row}
                    type="button"
                    onClick={() => select({ type: "row", id: Number(row) })}
                    title={t("board.actHint")}
                    className="pointer-events-auto absolute left-2 max-w-[260px] truncate rounded-b bg-foreground px-2.5 py-0.5 text-xs font-semibold text-background"
                    style={{ top: rowTop(m, Number(row)) }}
                  >
                    {act}
                  </button>
                ))}
              </div>

              {!data.events.length && lanes.length > 0 && (
                <div className="pointer-events-none absolute top-8 left-6 z-[4] max-w-sm rounded-lg border bg-card/95 p-4 text-sm shadow-sm">
                  <p className="font-medium">{t("board.empty.title")}</p>
                  <p className="mt-1 text-muted-foreground">{t("board.empty.hint")}</p>
                </div>
              )}
            </div>
          </div>
          <div className="h-10" />
        </div>

        {tour && (
          <PlotTour
            data={data}
            links={links}
            state={tour}
            onChange={setTour}
            onClose={() => setTour(null)}
            onOpenFeature={onOpenFeature}
          />
        )}
        </div>

        {/* Panneau */}
        {panelOpen && !clean && selection && (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l bg-card/40" aria-label={t("panel.label")}>
            <PlotPanel
              projectId={projectId}
              data={data}
              links={links}
              onOpenFeature={onOpenFeature}
              onStartTour={startTour}
              filter={filter}
              onFilter={setFilter}
            />
          </aside>
        )}
      </div>

      {/* Pied : types de liens et avancement */}
      {!clean && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
          {(["impact", "influence", "meeting"] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <KindIcon kind={kind} className="text-foreground" />
              {t(`kinds.${kind}.name`)}
            </span>
          ))}
          <span className="flex-1" />
          {unplaced > 0 && (
            <button
              type="button"
              aria-pressed={!!filter.unplaced}
              onClick={() => setFilter({ ...filter, unplaced: !filter.unplaced })}
              title={t("board.unplacedHint")}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 hover:border-foreground/40",
                filter.unplaced ? "border-amber-500 bg-amber-500/15 text-foreground" : "border-amber-500/40",
              )}
            >
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              {t("board.unplaced", { count: unplaced })}
            </button>
          )}
          <span className="inline-flex items-center gap-2" title={t("board.writtenHint")}>
            {t("board.written")}
            <span className="h-2 w-20 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-success" style={{ width: `${data.events.length ? Math.round((written / data.events.length) * 100) : 0}%` }} />
            </span>
            <span className="tabular-nums">
              {written} / {data.events.length}
            </span>
          </span>
        </footer>
      )}

      <PlotTemplatesDialog open={dialog === "templates"} projectId={projectId} data={data} onClose={() => setDialog(null)} />
      <PlotStructureImportDialog open={dialog === "import"} projectId={projectId} data={data} links={links} onClose={() => setDialog(null)} />

      {menuOpen && (
        <PlotViewMenu
          projectId={projectId}
          data={data}
          links={links}
          view={view}
          onView={setView}
          filter={filter}
          onFilter={setFilter}
          anchor={viewButtonRef.current}
          onClose={() => setMenuOpen(false)}
        />
      )}


      {clean && (
        <div className="absolute right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-lg border bg-card p-1.5 opacity-60 shadow-md transition-opacity hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(view.zoom / 1.15)} aria-label={t("toolbar.zoomOut")}>
            <Minus />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums">{Math.round(view.zoom * 100)} %</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(view.zoom * 1.15)} aria-label={t("toolbar.zoomIn")}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={fitZoom} aria-label={t("toolbar.fit")} title={t("toolbar.fit")}>
            <Maximize2 />
          </Button>
          <Button size="sm" onClick={() => setClean(false)} title={t("keys.escape")}>
            <Eye />
            {t("toolbar.unclean")}
          </Button>
        </div>
      )}
    </main>
  );
}

// ----------------------------------------------------------------------------
// Fond du plateau (grille, actes, trames, tension, liens)
// ----------------------------------------------------------------------------

interface BoardSvgProps {
  data: PlotData;
  m: ReturnType<typeof metrics>;
  lanes: PlotData["lanes"];
  rows: number;
  width: number;
  height: number;
  view: PlotView;
  selection: ReturnType<typeof usePlotStore.getState>["selection"];
  focus: ReturnType<typeof computeFocus>;
  geometryOf: (event: PlotEvent) => { cx: number; cy: number; column: number; color: string } | null;
  dimmed: (event: PlotEvent) => boolean;
}

function BoardSvg({ data, m, lanes, rows, width, height, view, selection, focus, geometryOf, dimmed }: BoardSvgProps) {
  const select = usePlotStore((s) => s.select);
  const acts = Object.keys(data.acts).map(Number).sort((a, b) => a - b);
  const colors = new Set<string>();

  const linkPaths = data.links.flatMap((link) => {
    if (!view.kinds[link.kind]) return [];
    const a = eventOf(data, link.from);
    const b = eventOf(data, link.to);
    const ga = a && geometryOf(a);
    const gb = b && geometryOf(b);
    if (!a || !b || !ga || !gb) return [];
    colors.add(ga.color);
    colors.add(gb.color);
    const path = linkPath(m, ga, gb);
    const dim = (focus && !focus.links.has(link.id)) || dimmed(a) || dimmed(b);
    const selected = selection?.type === "link" && selection.id === link.id;
    const gradient = !path.sameColumn && path.x1 !== path.x2 && ga.color !== gb.color;
    return [{ link, path, ga, gb, dim, selected, gradient }];
  });

  const hex = (c: string) => c.replace("#", "");

  return (
    <svg className="pointer-events-none absolute top-0 left-0 z-[1] overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        {[...colors].map((c) => (
          <g key={c}>
            <marker id={`plot-arr-${hex(c)}`} viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M1,1.5 L11.5,6 L1,10.5Z" fill={c} />
            </marker>
            <marker id={`plot-dot-${hex(c)}`} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="4.4" fill={c} />
            </marker>
          </g>
        ))}
        {linkPaths
          .filter((l) => l.gradient)
          .map(({ link, path, ga, gb }) => (
            <linearGradient key={link.id} id={`plot-g-${link.id}`} gradientUnits="userSpaceOnUse" x1={path.x1} y1={path.y1} x2={path.x2} y2={path.y2}>
              <stop offset="0" stopColor={ga.color} />
              <stop offset="1" stopColor={gb.color} />
            </linearGradient>
          ))}
      </defs>

      {/* Passé narratif : zone teintée au-dessus du début de l'histoire */}
      {m.past > 0 && <rect x={0} y={0} width={width} height={m.past * m.row} className="fill-muted" opacity={0.55} />}
      {selection?.type === "row" && <rect x={0} y={rowTop(m, selection.id)} width={width} height={m.row} className="fill-foreground" opacity={0.06} />}
      {acts.map((row, i) =>
        i % 2 === 1 ? <rect key={`band-${row}`} x={0} y={rowTop(m, row)} width={width} height={((acts[i + 1] ?? rows - m.past) - row) * m.row} className="fill-foreground" opacity={0.045} /> : null,
      )}
      {view.rowLines &&
        Array.from({ length: rows + 1 }, (_, r) => <line key={`grid-${r}`} x1={0} x2={width} y1={r * m.row} y2={r * m.row} className="stroke-border" strokeWidth={1} />)}
      {acts.map((row) => (
        <line key={`act-${row}`} x1={0} x2={width} y1={rowTop(m, row)} y2={rowTop(m, row)} className="stroke-foreground" strokeWidth={1.6} opacity={0.5} />
      ))}
      {/* Début de l'histoire principale */}
      {m.past > 0 && <line x1={0} x2={width} y1={m.past * m.row} y2={m.past * m.row} className="stroke-primary" strokeWidth={2} strokeDasharray="6 5" opacity={0.7} />}

      {lanes.map((lane, i) => {
        const x = i * m.lane + m.lane / 2;
        const laneRows = data.events.filter((e) => e.laneId === lane.id).map((e) => e.row);
        return (
          <g key={lane.id}>
            {lane.main && <rect x={i * m.lane} y={0} width={m.lane} height={height} fill={lane.color} opacity={0.07} />}
            <line x1={x} x2={x} y1={0} y2={height} stroke={lane.color} strokeOpacity={0.3} strokeWidth={2} strokeDasharray="1 8" strokeLinecap="round" />
            {laneRows.length > 0 && (
              <line
                x1={x}
                x2={x}
                y1={rowTop(m, Math.min(...laneRows)) + m.row / 2}
                y2={rowTop(m, Math.max(...laneRows)) + m.row / 2}
                stroke={lane.color}
                strokeWidth={lane.main ? 7 : 4}
                strokeLinecap="round"
                strokeOpacity={0.8}
              />
            )}
          </g>
        );
      })}


      {linkPaths.map(({ link, path, ga, gb, dim, selected, gradient }) => {
        const width = link.kind === "impact" ? 3.2 : link.kind === "influence" ? 2.4 : 2.8;
        const end = link.kind === "meeting" ? `plot-dot-${hex(gb.color)}` : `plot-arr-${hex(gb.color)}`;
        return (
          <g key={link.id} className="group/link" opacity={dim ? 0.13 : 1} data-link={link.id}>
            <path
              d={path.d}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              className="cursor-pointer"
              style={{ pointerEvents: "stroke" }}
              onClick={() => select({ type: "link", id: link.id })}
            />
            <path
              d={path.d}
              fill="none"
              stroke={gradient ? `url(#plot-g-${link.id})` : ga.color}
              strokeWidth={selected ? 4.5 : width}
              strokeDasharray={link.kind === "influence" ? "7 6" : undefined}
              strokeLinecap="round"
              markerStart={`url(#plot-dot-${hex(ga.color)})`}
              markerEnd={`url(#${end})`}
              className="group-hover/link:[stroke-width:4.5px]"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Titre modifié directement sur la carte (double-clic, F2). */
function InlineTitle({ initial, fontSize, label, onDone }: { initial: string; fontSize: number; label: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? value.trim() : null);
  };
  return (
    <textarea
      autoFocus
      value={value}
      aria-label={label}
      maxLength={200}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="h-[2.6em] w-full resize-none rounded border border-[var(--lane)] bg-card px-1 leading-tight font-semibold outline-none"
      style={{ fontSize }}
    />
  );
}

/** Courbe de tension, moment par moment (0 à gauche, 10 à droite). */
function TensionCurve({ data, rows, past, rowHeight, width, rowLines }: { data: PlotData; rows: number; past: number; rowHeight: number; width: number; rowLines: boolean }) {
  // `rows` : lignes affichées, passé narratif compris (`past` lignes en haut).
  const height = rows * rowHeight;
  const x0 = 8;
  const xw = width - 16;
  const points = Object.keys(data.tension)
    .map(Number)
    .filter((r) => r >= -past && r < rows - past)
    .sort((a, b) => a - b)
    .map((r) => ({ x: x0 + (data.tension[r] / 10) * xw, y: (r + past) * rowHeight + rowHeight / 2, row: r }));
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
      {rowLines && Array.from({ length: rows + 1 }, (_, r) => <line key={r} x1={0} x2={width} y1={r * rowHeight} y2={r * rowHeight} className="stroke-border" strokeWidth={1} />)}
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={x0 + f * xw} x2={x0 + f * xw} y1={0} y2={height} className="stroke-foreground" opacity={0.12} strokeDasharray="3 5" />
      ))}
      {points.length > 1 && (
        <>
          <path d={`M${x0},${points[0].y} L${points.map((p) => `${p.x},${p.y}`).join(" L")} L${x0},${points[points.length - 1].y} Z`} className="fill-primary" opacity={0.12} />
          <path d={smoothPath(points)} fill="none" className="stroke-primary" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {points.map((p) => (
        <circle key={p.row} cx={p.x} cy={p.y} r={4} className="fill-primary" />
      ))}
    </svg>
  );
}