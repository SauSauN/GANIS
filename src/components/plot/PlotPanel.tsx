import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowLeftRight, ArrowRight, BookOpen, Copy, ExternalLink, ListTree, MapPin, NotebookPen, Palette, Plus, Trash2, X } from "lucide-react";
import { addEvent, createLink, deleteEvent, deleteLane, deleteLink, duplicateEvent, duplicateLane, moveEvent } from "@/components/plot/actions";
import { KindIcon } from "@/components/plot/KindIcon";
import { area, Field, Fold, Head, input, useMutate, type PlotPanelProps } from "@/components/plot/panelParts";
import { Button } from "@/components/ui/button";
import { characterTabId } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import {
  attachToNode,
  eventOf,
  insertMoment,
  laneIndex,
  laneOf,
  LINK_KINDS,
  linkOf,
  momentNumber,
  removeMoment,
  rowFromMoment,
  STATUS_COLORS,
  STATUS_ORDER,
  visibleLanes,
  type PlotEvent,
  type PlotLane,
  type PlotLink,
  type PlotStatus,
} from "@/lib/plot";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useNoteStore } from "@/stores/noteStore";
import { usePlotStore } from "@/stores/plotStore";
import { toast } from "@/stores/toastStore";
import { errorText } from "@/lib/errors";

/** Panneau de droite du plateau : ce qui est choisi, sinon le projet. */
export function PlotPanel(props: PlotPanelProps) {
  const { data } = props;
  const selection = usePlotStore((s) => s.selection);

  if (selection?.type === "event") {
    const event = eventOf(data, selection.id);
    if (event) return <EventPanel {...props} event={event} />;
  }
  if (selection?.type === "link") {
    const link = linkOf(data, selection.id);
    if (link) return <LinkPanel {...props} link={link} />;
  }
  if (selection?.type === "lane") {
    const lane = laneOf(data, selection.id);
    if (lane) return <LanePanel {...props} lane={lane} />;
  }
  if (selection?.type === "row") return <RowPanel {...props} row={selection.id} />;
  return null;
}

// Liens d'un événement (alternative au glisser de la pastille)
// ----------------------------------------------------------------------------

/**
 * Liens d'un événement vers les autres, et une commande « Relier à… » /
 * « Relier depuis… » : sur le plateau, un lien se tire avec la pastille ;
 * ici, il se crée en choisissant l'autre événement dans une liste,
 * utilisable au clavier et sans glisser (WCAG 2.1.1, 2.5.7).
 * Le lien créé est sélectionné : son type et son libellé se règlent
 * ensuite dans ce panneau.
 */
function EventLinks({ projectId, data, event }: Pick<PlotPanelProps, "projectId" | "data"> & { event: PlotEvent }) {
  const { t } = useTranslation(["plot", "common"]);
  const select = usePlotStore((s) => s.select);

  const outgoing = data.links.filter((l) => l.from === event.id);
  const incoming = data.links.filter((l) => l.to === event.id);
  const titleOf = (id: string) => eventOf(data, id)?.title || t("untitled");

  // Autres événements, groupés par trame, dans l'ordre du récit.
  const groups = visibleLanes(data)
    .map((lane) => ({
      lane,
      events: data.events
        .filter((e) => e.laneId === lane.id && e.id !== event.id)
        .sort((a, b) => a.row - b.row),
    }))
    .filter((group) => group.events.length > 0);

  function options(exclude: Set<string>) {
    return groups.map(({ lane, events }) => (
      <optgroup key={lane.id} label={lane.name}>
        {events
          .filter((e) => !exclude.has(e.id))
          .map((e) => (
            <option key={e.id} value={e.id}>
              {t("board.moment", { number: momentNumber(e.row) })} · {e.title || t("untitled")}
            </option>
          ))}
      </optgroup>
    ));
  }

  const linkRow = (link: PlotLink, other: string, direction: "to" | "from") => (
    <li key={link.id}>
      <button
        type="button"
        onClick={() => select({ type: "link", id: link.id })}
        className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
        title={t("event.links.open")}
      >
        {direction === "to" ? (
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("event.links.toAria")} />
        ) : (
          <ArrowLeft className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("event.links.fromAria")} />
        )}
        <span className="truncate">{titleOf(other)}</span>
        {link.label && <span className="truncate text-xs text-muted-foreground">· {link.label}</span>}
      </button>
    </li>
  );

  if (groups.length === 0 && outgoing.length === 0 && incoming.length === 0) return null;

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("event.links.title")}</span>
      {(outgoing.length > 0 || incoming.length > 0) && (
        <ul className="mb-1.5 space-y-0.5">
          {outgoing.map((l) => linkRow(l, l.to, "to"))}
          {incoming.map((l) => linkRow(l, l.from, "from"))}
        </ul>
      )}
      {groups.length > 0 && (
        <div className="grid gap-1.5">
          <select
            aria-label={t("event.links.linkTo")}
            value=""
            onChange={(e) => e.target.value && createLink(projectId, event.id, e.target.value)}
            className={input}
          >
            <option value="">{t("event.links.linkTo")}</option>
            {options(new Set(outgoing.map((l) => l.to)))}
          </select>
          <select
            aria-label={t("event.links.linkFrom")}
            value=""
            onChange={(e) => e.target.value && createLink(projectId, e.target.value, event.id)}
            className={input}
          >
            <option value="">{t("event.links.linkFrom")}</option>
            {options(new Set(incoming.map((l) => l.from)))}
          </select>
        </div>
      )}
    </div>
  );
}

// Événement
// ----------------------------------------------------------------------------

function EventPanel({ projectId, data, links, onOpenFeature, event }: PlotPanelProps & { event: PlotEvent }) {
  const { t } = useTranslation(["plot", "common"]);
  const mutate = useMutate(projectId);
  const requestFocus = usePlotStore((s) => s.requestFocus);
  const createNote = useNoteStore((s) => s.createNote);
  const lane = laneOf(data, event.laneId);
  const set = <K extends keyof PlotEvent>(field: K, value: PlotEvent[K], key?: string) =>
    mutate((d) => {
      const e = eventOf(d, event.id);
      if (e) e[field] = value;
    }, key);

  const present = event.characterIds.map((id) => links.character(id)).filter(Boolean);
  const absent = links.characters.filter((c) => !event.characterIds.includes(c.id));
  const projectSummary = [event.povId && links.characterName(event.povId), event.locationId && links.location(event.locationId)?.name].filter(Boolean).join(" · ");
  const detailsSummary = [lane?.name, t("board.moment", { number: momentNumber(event.row) }).toLowerCase(), event.date].filter(Boolean).join(" · ");
  async function writeScene() {
    try {
      const note = await createNote(projectId, null, event.title || t("untitled"));
      mutate((d) => {
        const e = eventOf(d, event.id);
        if (e && !e.noteIds.includes(note.id)) e.noteIds.push(note.id);
      });
      onOpenFeature(noteTabId(note.id));
    } catch (error) {
      toast({
        message: errorText(error),
        tone: "error",
      });
    }
  }

  return (
    <div className="p-4">
      <Head kind={t("panel.event")} color={lane?.color ?? "#888"} />

      <Field label={t("event.title")}>
        <input value={event.title} maxLength={200} placeholder={t("common:placeholders.eventTitle")} onChange={(e) => set("title", e.target.value, `ev:${event.id}:title`)} className={cn(input, "h-9 text-base font-medium")} />
      </Field>
      <div className="mb-3">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground" id={`status-${event.id}`}>
          {t("event.status")}
        </span>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-labelledby={`status-${event.id}`}>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={event.status === s}
              onClick={() => set("status", s as PlotStatus)}
              className={cn(
                "inline-flex h-7 min-w-0 flex-auto items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
                event.status === s && "bg-background text-foreground shadow-sm",
              )}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
              <span className="truncate">{t(`status.${s}`)}</span>
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={event.pivot} onChange={(e) => set("pivot", e.target.checked)} />
          {t("event.pivot")}
        </label>
      </div>

      <Field label={t("event.note")}>
        <textarea rows={3} value={event.note} placeholder={t("event.notePlaceholder")} onChange={(e) => set("note", e.target.value, `ev:${event.id}:note`)} className={area} />
      </Field>

      {/* Liens avec les autres événements : au clavier comme à la souris. */}
      <EventLinks projectId={projectId} data={data} event={event} />

      {/* Liens avec le reste du projet */}
      <Fold title={t("event.project")} summary={projectSummary} defaultOpen>
        <Field label={t("event.pov")}>
          <div className="flex gap-1.5">
            <select value={event.povId ?? ""} onChange={(e) => set("povId", e.target.value || null)} className={cn(input, "min-w-0 flex-1")}>
              <option value="">{t("event.none")}</option>
              {links.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {links.characterName(c.id)}
                </option>
              ))}
            </select>
            {event.povId && links.character(event.povId) && (
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenFeature(characterTabId(event.povId!))} aria-label={t("event.openSheet")} title={t("event.openSheet")}>
                <ExternalLink />
              </Button>
            )}
          </div>
        </Field>

        <div className="mb-3">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("event.characters")}</span>
          <div className="flex flex-wrap gap-1.5">
            {present.map((c) => (
              <span key={c!.id} className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-xs">
                <button type="button" className="hover:underline" onClick={() => onOpenFeature(characterTabId(c!.id))}>
                  {links.characterName(c!.id)}
                </button>
                <button
                  type="button"
                  aria-label={t("event.removeCharacter", {
                    name: links.characterName(c!.id),
                  })}
                  title={t("event.removeCharacter", {
                    name: links.characterName(c!.id),
                  })}
                  onClick={() =>
                    set(
                      "characterIds",
                      event.characterIds.filter((id) => id !== c!.id),
                    )
                  }
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {absent.length > 0 ? (
            <select aria-label={t("event.addCharacter")} value="" onChange={(e) => e.target.value && set("characterIds", [...event.characterIds, e.target.value])} className={cn(input, "mt-1.5")}>
              <option value="">{t("event.addCharacter")}</option>
              {absent.map((c) => (
                <option key={c.id} value={c.id}>
                  {links.characterName(c.id)}
                </option>
              ))}
            </select>
          ) : (
            !links.characters.length && (
              <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => onOpenFeature("characters.create")}>
                {t("event.createCharacter")}
              </button>
            )
          )}
        </div>

        <Field label={t("event.location")}>
          <div className="flex gap-1.5">
            <select value={event.locationId ?? ""} onChange={(e) => set("locationId", e.target.value || null)} className={cn(input, "min-w-0 flex-1")}>
              <option value="">{t("event.none")}</option>
              {links.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {event.locationId && links.location(event.locationId) ? (
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenFeature(locationTabId(event.locationId!))} aria-label={t("event.openSheet")} title={t("event.openSheet")}>
                <MapPin />
              </Button>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenFeature("locations.create")} aria-label={t("event.createLocation")} title={t("event.createLocation")}>
                <Plus />
              </Button>
            )}
          </div>
        </Field>

        <Field label={t("event.node")}>
          <div className="flex gap-1.5">
            <select
              title={t("event.nodeHint")}
              value={event.nodeId ?? ""}
              onChange={(e) => mutate((d) => attachToNode(d, event.id, e.target.value || null))}
              className={cn(input, "min-w-0 flex-1")}
            >
              <option value="">{t("event.none")}</option>
              {links.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {"  ".repeat(n.depth)}
                  {links.nodeLabel(n.id)}
                </option>
              ))}
            </select>
            {event.nodeId && links.node(event.nodeId) && (
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenFeature(structureNodeTabId(event.nodeId!))} aria-label={t("event.openSheet")} title={t("event.openSheet")}>
                <ListTree />
              </Button>
            )}
          </div>
          {event.nodeId && links.nodes.some((n) => n.parentId === event.nodeId) && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">{t("event.preferScene")}</span>}
        </Field>

        <div className="mb-3">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground" title={t("event.alsoNodesHint")}>
            {t("event.alsoNodes")}
          </span>
          {event.alsoNodeIds.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {event.alsoNodeIds.map((id) => (
                <span key={id} className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-xs">
                  <button type="button" className="truncate hover:underline" onClick={() => onOpenFeature(structureNodeTabId(id))}>
                    {links.nodeLabel(id) ?? "—"}
                  </button>
                  <button
                    type="button"
                    aria-label={t("event.removeAlsoNode", { name: links.nodeLabel(id) ?? "" })}
                    title={t("event.removeAlsoNode", { name: links.nodeLabel(id) ?? "" })}
                    onClick={() => set("alsoNodeIds", event.alsoNodeIds.filter((x) => x !== id))}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <select
            aria-label={t("event.addAlsoNode")}
            value=""
            disabled={!event.nodeId}
            title={event.nodeId ? undefined : t("event.alsoNodesNeedMain")}
            onChange={(e) => e.target.value && set("alsoNodeIds", [...event.alsoNodeIds, e.target.value])}
            className={input}
          >
            <option value="">{event.nodeId ? t("event.addAlsoNode") : t("event.alsoNodesNeedMain")}</option>
            {links.nodes
              .filter((n) => n.id !== event.nodeId && !event.alsoNodeIds.includes(n.id))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {"  ".repeat(n.depth)}
                  {links.nodeLabel(n.id)}
                </option>
              ))}
          </select>
        </div>

        <div className="mb-3">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("event.notes")}</span>
          {event.noteIds.map((id) => {
            const note = links.note(id);
            if (!note) return null;
            return (
              <div key={id} className="mb-1 flex items-center gap-1.5">
                <button type="button" onClick={() => onOpenFeature(noteTabId(id))} className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm hover:underline">
                  <NotebookPen className="size-3.5 shrink-0 text-primary" />
                  {note.title || t("untitled")}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("event.removeNote")}
                  title={t("event.removeNote")}
                  onClick={() =>
                    set(
                      "noteIds",
                      event.noteIds.filter((x) => x !== id),
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            );
          })}
          <div className="mt-1 flex gap-1.5">
            <select aria-label={t("event.addNote")} value="" onChange={(e) => e.target.value && set("noteIds", [...event.noteIds, e.target.value])} className={cn(input, "min-w-0 flex-1")}>
              <option value="">{t("event.addNote")}</option>
              {links.notes
                .filter((n) => !event.noteIds.includes(n.id))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || t("untitled")}
                  </option>
                ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void writeScene()} title={t("event.writeSceneHint")}>
              <NotebookPen />
              {t("event.writeScene")}
            </Button>
          </div>
        </div>
      </Fold>

      <Fold title={t("event.details")} summary={detailsSummary}>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field label={t("event.lane")}>
            <select value={event.laneId} onChange={(e) => moveEvent(projectId, event.id, e.target.value, event.row)} className={input}>
              {visibleLanes(data).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("event.moment")}>
            {/* 1, 2… : histoire principale ; -1, -2… : passé narratif (0 n'existe pas). */}
            <input
              type="number"
              value={event.row >= 0 ? event.row + 1 : event.row}
              placeholder={t("common:placeholders.moment")}
              title={t("event.momentHint")}
              onChange={(e) => {
                const row = rowFromMoment(e.target.value);
                if (row !== null && row !== event.row) moveEvent(projectId, event.id, event.laneId, row);
              }}
              className={input}
            />
          </Field>
        </div>
        <Field label={t("event.date")}>
          <input value={event.date} maxLength={80} placeholder={t("event.datePlaceholder")} onChange={(e) => set("date", e.target.value, `ev:${event.id}:date`)} className={input} />
        </Field>
      </Fold>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            requestFocus(event.id);
            onOpenFeature("plot.reading");
          }}
        >
          <BookOpen />
          {t("event.readFromHere")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => duplicateEvent(projectId, event.id)}>
          <Copy />
          {t("event.duplicate")}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteEvent(projectId, event.id)}>
          <Trash2 />
          {t("event.delete")}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lien
// ----------------------------------------------------------------------------

function LinkPanel({ projectId, data, link }: PlotPanelProps & { link: PlotLink }) {
  const { t } = useTranslation(["plot", "common"]);
  const mutate = useMutate(projectId);
  const select = usePlotStore((s) => s.select);
  const a = eventOf(data, link.from);
  const b = eventOf(data, link.to);
  if (!a || !b) return null;
  const la = laneOf(data, a.laneId);
  const lb = laneOf(data, b.laneId);
  const back = link.kind !== "meeting" && b.row < a.row;
  const set = <K extends keyof PlotLink>(field: K, value: PlotLink[K], key?: string) =>
    mutate((d) => {
      const k = linkOf(d, link.id);
      if (k) k[field] = value;
    }, key);

  const end = (event: PlotEvent, label: string, color?: string) => (
    <button
      type="button"
      onClick={() => select({ type: "event", id: event.id })}
      className="mb-1.5 flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left hover:border-foreground/30"
    >
      <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">{event.title || t("untitled")}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {laneOf(data, event.laneId)?.name}, {t("board.moment", { number: momentNumber(event.row) }).toLowerCase()}
        </span>
      </span>
    </button>
  );

  return (
    <div className="p-4">
      <Head kind={t("panel.link")} color={la?.color ?? "#888"} />
      {end(a, t("link.from"), la?.color)}
      {end(b, t("link.to"), lb?.color)}
      {back && <p className="my-2 rounded-r-md border-l-[3px] border-amber-500 bg-amber-500/10 px-2.5 py-2 text-xs">{t("link.backInTime")}</p>}
      <div className="my-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("link.kind")}>
        {LINK_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={link.kind === kind}
            title={t(`kinds.${kind}.description`)}
            onClick={() => set("kind", kind)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border bg-card px-1 py-2 text-xs font-medium hover:border-foreground/40",
              link.kind === kind && "border-foreground ring-1 ring-foreground",
            )}
          >
            <KindIcon kind={kind} />
            {t(`kinds.${kind}.name`)}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t(`kinds.${link.kind}.description`)}</p>
      <Field label={t("link.label")}>
        <input value={link.label} maxLength={80} placeholder={t("link.labelPlaceholder")} onChange={(e) => set("label", e.target.value, `lk:${link.id}:label`)} className={input} />
      </Field>
      <Field label={t("link.note")}>
        <textarea rows={3} value={link.note} placeholder={t("link.notePlaceholder")} onChange={(e) => set("note", e.target.value, `lk:${link.id}:note`)} className={area} />
      </Field>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            mutate((d) => {
              const k = linkOf(d, link.id);
              if (k) [k.from, k.to] = [k.to, k.from];
            })
          }
        >
          <ArrowLeftRight />
          {t("link.swap")}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteLink(projectId, link.id)}>
          <Trash2 />
          {t("link.delete")}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Trame
// ----------------------------------------------------------------------------

function LanePanel({ projectId, data, links, onOpenFeature, onStartTour, lane }: PlotPanelProps & { lane: PlotLane }) {
  const { t } = useTranslation(["plot", "common"]);
  const mutate = useMutate(projectId);
  const select = usePlotStore((s) => s.select);
  const events = data.events.filter((e) => e.laneId === lane.id);
  const index = laneIndex(data, lane.id);
  const set = <K extends keyof PlotLane>(field: K, value: PlotLane[K], key?: string) =>
    mutate((d) => {
      const l = laneOf(d, lane.id);
      if (l) l[field] = value;
    }, key);
  const swap = (delta: number) =>
    mutate((d) => {
      const i = laneIndex(d, lane.id);
      const j = i + delta;
      if (j < 0 || j >= d.lanes.length) return;
      [d.lanes[i], d.lanes[j]] = [d.lanes[j], d.lanes[i]];
    });

  return (
    <div className="p-4">
      <Head kind={lane.main ? t("board.mainLane") : t("board.parallelLane")} color={lane.color} />
      <Field label={t("lane.name")}>
        <input data-lane-name={lane.id} value={lane.name} maxLength={80} placeholder={t("common:placeholders.laneName")} onChange={(e) => set("name", e.target.value, `ln:${lane.id}`)} className={input} />
      </Field>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="size-5 rounded-full border shadow-sm" style={{ backgroundColor: lane.color }} />
        <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => onOpenFeature("settings:plot")}>
          <Palette className="size-3.5" />
          {t("lane.colorInSettings")}
        </button>
      </div>
      <Field label={t("lane.character")}>
        <select value={lane.characterId ?? ""} onChange={(e) => set("characterId", e.target.value || null)} className={input}>
          <option value="">{t("event.none")}</option>
          {links.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {links.characterName(c.id)}
            </option>
          ))}
        </select>
      </Field>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("lane.count", { count: events.length })}
      </p>
      <div className="mb-2 flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" disabled={index === 0} onClick={() => swap(-1)}>
          <ArrowLeft />
          {t("lane.left")}
        </Button>
        <Button variant="outline" size="sm" className="flex-1" disabled={index === data.lanes.length - 1} onClick={() => swap(1)}>
          {t("lane.right")}
          <ArrowRight />
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Button variant="outline" size="sm" onClick={() => addEvent(projectId, lane.id)}>
          <Plus />
          {t("lane.addEvent")}
        </Button>
        <Button variant="outline" size="sm" disabled={!events.length} onClick={() => onStartTour("lane", lane.id)}>
          {t("lane.tour")}
        </Button>
        {!lane.main && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              mutate((d) => {
                for (const l of d.lanes) l.main = l.id === lane.id;
              })
            }
          >
            {t("lane.makeMain")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={visibleLanes(data).length <= 1}
          onClick={() => {
            mutate((d) => {
              const l = laneOf(d, lane.id);
              if (l) l.hidden = true;
            });
            select(null);
            toast({ message: t("toasts.laneHidden") });
          }}
        >
          {t("lane.hide")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={data.lanes.length <= 1}
          onClick={() =>
            mutate((d) => {
              for (const l of d.lanes) l.hidden = l.id !== lane.id;
            })
          }
        >
          {t("lane.solo")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => duplicateLane(projectId, lane.id)}>
          <Copy />
          {t("lane.duplicate")}
        </Button>
        {lane.characterId && links.character(lane.characterId) && (
          <Button variant="outline" size="sm" onClick={() => onOpenFeature(characterTabId(lane.characterId!))}>
            <ExternalLink />
            {t("lane.openCharacter")}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteLane(projectId, lane.id)}>
          <Trash2 />
          {t("lane.delete")}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Moment
// ----------------------------------------------------------------------------

function RowPanel({ projectId, data, row }: PlotPanelProps & { row: number }) {
  const { t } = useTranslation(["plot", "common"]);
  const mutate = useMutate(projectId);
  const select = usePlotStore((s) => s.select);
  const count = data.events.filter((e) => e.row === row).length;
  const tension = data.tension[row];
  return (
    <div className="p-4">
      <Head kind={row < 0 ? t("board.pastMoment", { number: momentNumber(row) }) : t("board.moment", { number: momentNumber(row) })} color="var(--muted-foreground)" />
      <Field label={t("row.label")}>
        <input
          value={data.rowLabels[row] ?? ""}
          maxLength={60}
          placeholder={t("row.labelPlaceholder")}
          onChange={(e) =>
            mutate((d) => {
              if (e.target.value.trim()) d.rowLabels[row] = e.target.value;
              else delete d.rowLabels[row];
            }, `row:${row}`)
          }
          className={input}
        />
      </Field>
      <Field label={t("row.act")}>
        <input
          value={data.acts[row] ?? ""}
          maxLength={80}
          placeholder={t("row.actPlaceholder")}
          onChange={(e) =>
            mutate((d) => {
              if (e.target.value.trim()) d.acts[row] = e.target.value;
              else delete d.acts[row];
            }, `act:${row}`)
          }
          className={input}
        />
      </Field>
      <div className="mb-3">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">{tension !== undefined ? t("row.tension", { value: tension }) : t("row.tensionNone")}</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={tension ?? 5}
          aria-label={t("board.tension")}
          onChange={(e) =>
            mutate((d) => {
              d.tension[row] = Number.parseInt(e.target.value, 10) || 0;
            }, `tn:${row}`)
          }
          className="w-full accent-primary"
        />
        {tension !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() =>
              mutate((d) => {
                delete d.tension[row];
              })
            }
          >
            {t("row.tensionClear")}
          </Button>
        )}
      </div>
      {count > 0 && <p className="text-xs text-muted-foreground">{t("row.count", { count })}</p>}
      <div className="mt-4 grid gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            let added = row;
            mutate((d) => {
              added = insertMoment(d, row, "before");
            });
            select({ type: "row", id: added });
          }}
        >
          {t("row.insertBefore")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            let added = row + 1;
            mutate((d) => {
              added = insertMoment(d, row, "after");
            });
            select({ type: "row", id: added });
          }}
        >
          {t("row.insertAfter")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={count > 0}
          title={count ? t("row.deleteBlocked") : undefined}
          onClick={() => {
            mutate((d) => {
              removeMoment(d, row);
            });
            select(null);
          }}
        >
          <Trash2 />
          {t("row.delete")}
        </Button>
      </div>
    </div>
  );
}
