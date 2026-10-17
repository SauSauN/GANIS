import i18n from "@/i18n";
import {
  eventOf,
  laneIndex,
  laneOf,
  linkOf,
  newId,
  nextColor,
  occupant,
  placeEvent,
  visibleLanes,
  type PlotData,
  type PlotEvent,
} from "@/lib/plot";
import { usePlotStore } from "@/stores/plotStore";
import { toast } from "@/stores/toastStore";

/*
 * Gestes sur la trame, partagés par le plateau, le panneau et le parcours.
 * Chaque geste passe par `mutate` (Annuler / Rétablir) ; une suppression
 * propose « Annuler » dans un message.
 */

const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;

const store = () => usePlotStore.getState();
const mutate = (projectId: string, fn: (d: PlotData) => void, key?: string) => store().mutate(projectId, fn, key ? { key } : undefined);

function undoToast(message: string) {
  toast({ message, action: { label: t("plot:undo"), run: () => store().undo() } });
}

export function blankEvent(laneId: string, title: string): PlotEvent {
  return {
    id: newId(),
    laneId,
    row: 0,
    title,
    note: "",
    pivot: false,
    status: "idea",
    tags: [],
    characterIds: [],
    povId: null,
    locationId: null,
    nodeId: null,
    alsoNodeIds: [],
    noteIds: [],
    date: "",
    words: 0,
  };
}

/** Nouvel événement dans une trame : au moment donné, ou sous le dernier de la trame. */
export function addEvent(projectId: string, laneId: string, row?: number, extra?: Partial<PlotEvent>): string | null {
  const data = store().data;
  if (!data || !laneOf(data, laneId)) return null;
  let target = row;
  if (target === undefined) {
    const rows = data.events.filter((e) => e.laneId === laneId).map((e) => e.row);
    target = rows.length ? Math.max(...rows) + 1 : 0;
  }
  const event = { ...blankEvent(laneId, t("plot:defaults.newEvent")), ...extra };
  mutate(projectId, (d) => {
    d.events.push(event);
    placeEvent(d, d.events[d.events.length - 1], laneId, target!);
  });
  store().select({ type: "event", id: event.id });
  return event.id;
}

/** « + Événement » : sous l'événement choisi, sinon dans la trame choisie ou la principale. */
export function addEventSmart(projectId: string): string | null {
  const { data, selection } = store();
  if (!data) return null;
  if (selection?.type === "event") {
    const event = eventOf(data, selection.id);
    if (event) return addEvent(projectId, event.laneId, event.row + 1);
  }
  const lane =
    (selection?.type === "lane" && laneOf(data, selection.id)) ||
    data.lanes.find((l) => l.main && !l.hidden) ||
    visibleLanes(data)[0];
  if (lane) return addEvent(projectId, lane.id);
  // Aucune trame : on recrée d'abord la trame principale.
  const laneId = addLane(projectId);
  return laneId ? addEvent(projectId, laneId) : null;
}

export function addLane(projectId: string, options: { name?: string; characterId?: string | null } = {}): string | null {
  const data = store().data;
  if (!data) return null;
  const id = newId();
  mutate(projectId, (d) => {
    // Plus aucune trame principale (toutes supprimées) : la nouvelle le devient.
    const main = !d.lanes.some((l) => l.main);
    d.lanes.push({
      id,
      name: options.name || (main ? t("plot:defaults.mainLane") : t("plot:defaults.parallelLane", { number: d.lanes.length })),
      color: nextColor(d),
      main,
      hidden: false,
      characterId: options.characterId ?? null,
    });
  });
  store().select({ type: "lane", id });
  return id;
}

export function createLink(projectId: string, from: string, to: string) {
  const data = store().data;
  if (!data || from === to) return;
  const existing = data.links.find((l) => l.from === from && l.to === to);
  if (existing) {
    store().select({ type: "link", id: existing.id });
    return;
  }
  const id = newId();
  mutate(projectId, (d) => {
    d.links.push({ id, from, to, kind: "impact", label: "", note: "" });
  });
  store().select({ type: "link", id });
}

/** Lien tiré dans le vide : crée l'événement d'arrivée, relié au premier. */
export function createLinkedEvent(projectId: string, from: string, laneId: string, row: number) {
  const event = blankEvent(laneId, t("plot:defaults.newEvent"));
  const linkId = newId();
  mutate(projectId, (d) => {
    d.events.push(event);
    placeEvent(d, d.events[d.events.length - 1], laneId, row);
    d.links.push({ id: linkId, from, to: event.id, kind: "impact", label: "", note: "" });
  });
  store().select({ type: "link", id: linkId });
}

/** Déplace un événement dans une case (les occupants descendent). */
export function moveEvent(projectId: string, id: string, laneId: string, row: number) {
  mutate(projectId, (d) => {
    const event = eventOf(d, id);
    if (event) placeEvent(d, event, laneId, row);
  });
}

export function deleteEvent(projectId: string, id: string) {
  const data = store().data;
  const event = data && eventOf(data, id);
  if (!event) return;
  mutate(projectId, (d) => {
    d.events = d.events.filter((e) => e.id !== id);
    d.links = d.links.filter((l) => l.from !== id && l.to !== id);
    d.readingOrder = d.readingOrder.filter((x) => x !== id);
    for (const key of Object.keys(d.sceneOrder)) d.sceneOrder[key] = d.sceneOrder[key].filter((x) => x !== id);
    for (const q of d.questions) if (q.eventId === id) q.eventId = null;
    for (const c of d.clues) if (c.eventId === id) c.eventId = null;
    for (const m of d.mysteries) if (m.payoffEventId === id) m.payoffEventId = null;
  });
  store().select(null);
  undoToast(t("plot:toasts.eventDeleted", { name: event.title || t("plot:untitled") }));
}

export function duplicateEvent(projectId: string, id: string) {
  const data = store().data;
  const event = data && eventOf(data, id);
  if (!event) return;
  const copy: PlotEvent = { ...structuredCloneSafe(event), id: newId(), title: t("plot:defaults.copyOf", { name: event.title }) };
  mutate(projectId, (d) => {
    d.events.push(copy);
    placeEvent(d, d.events[d.events.length - 1], event.laneId, event.row + 1);
  });
  store().select({ type: "event", id: copy.id });
}

export function deleteLink(projectId: string, id: string) {
  const data = store().data;
  if (!data || !linkOf(data, id)) return;
  mutate(projectId, (d) => {
    d.links = d.links.filter((l) => l.id !== id);
  });
  store().select(null);
  undoToast(t("plot:toasts.linkDeleted"));
}

export function deleteLane(projectId: string, id: string) {
  const data = store().data;
  const lane = data && laneOf(data, id);
  if (!data || !lane) return;
  mutate(projectId, (d) => {
    const removed = new Set(d.events.filter((e) => e.laneId === id).map((e) => e.id));
    d.events = d.events.filter((e) => !removed.has(e.id));
    d.links = d.links.filter((l) => !removed.has(l.from) && !removed.has(l.to));
    d.readingOrder = d.readingOrder.filter((x) => !removed.has(x));
    d.lanes = d.lanes.filter((l) => l.id !== id);
    // La première trame qui reste devient la principale.
    if (lane.main && d.lanes.length) d.lanes[0].main = true;
    if (d.lanes.length && d.lanes.every((l) => l.hidden)) d.lanes[0].hidden = false;
  });
  store().select(null);
  undoToast(t("plot:toasts.laneDeleted", { name: lane.name }));
}

export function duplicateLane(projectId: string, id: string) {
  const data = store().data;
  const source = data && laneOf(data, id);
  if (!source) return;
  const newLaneId = newId();
  mutate(projectId, (d) => {
    d.lanes.splice(laneIndex(d, id) + 1, 0, {
      id: newLaneId,
      name: t("plot:defaults.copyOf", { name: source.name }),
      color: nextColor(d),
      main: false,
      hidden: false,
      characterId: source.characterId,
    });
    for (const event of d.events.filter((e) => e.laneId === id)) {
      d.events.push({ ...structuredCloneSafe(event), id: newId(), laneId: newLaneId, words: 0 });
    }
  });
  store().select({ type: "lane", id: newLaneId });
  toast({ message: t("plot:toasts.laneDuplicated"), tone: "success" });
}

/** Alt + flèches : déplace l'événement choisi d'une case. */
export function nudgeSelected(projectId: string, rows: number, columns: number) {
  const { data, selection } = store();
  if (!data || selection?.type !== "event") return;
  const event = eventOf(data, selection.id);
  if (!event) return;
  const lanes = visibleLanes(data);
  const column = lanes.findIndex((l) => l.id === event.laneId);
  const nextColumn = Math.min(lanes.length - 1, Math.max(0, column + columns));
  const nextRow = Math.max(0, event.row + rows);
  if (nextColumn === column && nextRow === event.row) return;
  moveEvent(projectId, event.id, lanes[nextColumn].id, nextRow);
}

/** Double-clic dans une case vide : nouvel événement ; sur une case pleine : le choisir. */
export function openOrCreateAt(projectId: string, laneId: string, row: number) {
  const data = store().data;
  if (!data) return;
  const existing = occupant(data, laneId, row);
  if (existing) store().select({ type: "event", id: existing.id });
  else addEvent(projectId, laneId, row);
}

function structuredCloneSafe<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
