import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, ChevronDown, ChevronRight, ExternalLink, ListChecks } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { ExportMenu } from "@/components/novel/ExportMenu";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import { buildBreakdownDoc, buildScheduleDoc, dayOrNight, shootingSchedule, type BreakdownLabels, type BreakdownScene } from "@/lib/filmDocs";
import { notifyError } from "@/lib/notify";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useSceneBreakdowns } from "@/stores/seriesStore";
import { useWorldEntries } from "@/stores/worldStore";
import { BREAKDOWN_FIELDS, type BreakdownField, type Project, type SceneBreakdown, type ScenePlace } from "@/types";
import { useFilmScript } from "./useFilmScript";

const EMPTY: SceneBreakdown = { extras: "", props: "", costumes: "", makeup: "", vehicles: "", effects: "", sound: "", notes: "" };

interface FilmBreakdownViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Dépouillement du film : pour chaque scène, ce que la régie doit prévoir.
 * L'en-tête, les personnages et leur état, les objets et autres fiches du
 * monde liés à la scène viennent du reste du projet ; figurants,
 * accessoires, costumes, maquillage, véhicules, effets, son et notes
 * s'écrivent ici. Le plan de travail regroupe les scènes par décor et par
 * moment. Exports pour la régie.
 */
export function FilmBreakdownView({ project, feature, onOpenFeature }: FilmBreakdownViewProps) {
  const { t } = useTranslation("series");
  const script = useFilmScript(project);
  const { entries, numbers, times, headingOf, characters, locations, links, duration, loading } = script;
  const { breakdowns, save } = useSceneBreakdowns(project.id);
  const items = useWorldEntries(project.id, "item").entries;
  const species = useWorldEntries(project.id, "species").entries;
  const factions = useWorldEntries(project.id, "faction").entries;
  const peoples = useWorldEntries(project.id, "people").entries;
  const magic = useWorldEntries(project.id, "magic").entries;
  const [tab, setTab] = useState<"scenes" | "schedule">("scenes");
  const [open, setOpen] = useState<string | null>(null);

  const scenes = useMemo<BreakdownScene[]>(() => {
    const worldName = (kind: string, id: string) => {
      const list = { item: items, species, faction: factions, people: peoples, magic }[kind] ?? [];
      return list.find((e) => e.id === id)?.name ?? null;
    };
    return entries.map((entry) => {
      const id = entry.scene.id;
      const castLinks = (links?.characters ?? []).filter((l) => l.nodeId === id);
      const speakers = new Set((script.byScene.get(id) ?? []).filter((b) => b.kind === "dialogue" && b.characterId).map((b) => b.characterId!));
      const castIds = [...new Set([...castLinks.map((l) => l.characterId), ...speakers])];
      const cast = castIds
        .map((cid) => ({ id: cid, name: script.characterName(cid), state: castLinks.find((l) => l.characterId === cid)?.state ?? "" }))
        .filter((c) => characters.some((x) => x.id === c.id));
      const worldEntries = (links?.entries ?? [])
        .filter((l) => l.nodeId === id)
        .map((l) => ({ kind: l.kind, name: worldName(l.kind, l.entryId) }))
        .filter((e): e is { kind: typeof e.kind; name: string } => e.name !== null);
      const locationId = entry.scene.sceneLocationId;
      return {
        sceneId: id,
        number: numbers.get(id) ?? "",
        heading: headingOf(entry.scene),
        place: entry.scene.scenePlace,
        time: entry.scene.sceneTime,
        locationId,
        location: (locationId && locations.find((l) => l.id === locationId)?.name) || "",
        minutes: times.get(id)?.minutes ?? 0,
        cast,
        entries: worldEntries,
        breakdown: breakdowns?.get(id) ?? EMPTY,
      };
    });
  }, [entries, numbers, times, headingOf, links, script, characters, locations, breakdowns, items, species, factions, peoples, magic]);

  const schedule = useMemo(() => shootingSchedule(scenes), [scenes]);

  const labels: BreakdownLabels = {
    subtitle: t("breakdown.subtitle"),
    scheduleSubtitle: t("breakdown.scheduleSubtitle"),
    fields: {
      ...(Object.fromEntries(BREAKDOWN_FIELDS.map((f) => [f, t(`breakdown.fields.${f}`)])) as Record<BreakdownField, string>),
      cast: t("breakdown.cast"),
      entries: t("breakdown.entries"),
      duration: t("breakdown.duration"),
    },
    place: (v: ScenePlace) => t(`place.${v}`),
    moment: (v) => t(`breakdown.moment.${v}`),
    noLocation: t("breakdown.noLocation"),
    scenes: t("breakdown.scenes"),
  };

  const ready = !loading && breakdowns !== null && scenes.length > 0;
  const toolbar = ready ? (
    <>
      <div className={SEGMENTED_GROUP} role="tablist" aria-label={feature.label}>
        {(["scenes", "schedule"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn(SEGMENTED_ITEM, tab === id && SEGMENTED_ON)}>
            {id === "scenes" ? <ListChecks aria-hidden="true" /> : <CalendarRange aria-hidden="true" />}
            {t(`breakdown.tabs.${id}`)}
          </button>
        ))}
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {tab === "scenes" ? t("breakdown.sceneCount", { count: scenes.length }) : t("breakdown.groupCount", { count: schedule.length })}
      </p>
      <div className="ml-auto">
        {tab === "scenes" ? (
          <ExportMenu
            label={t("breakdown.export")}
            dialogTitle={t("breakdown.exportTitle")}
            fileBase={`${project.name} — ${t("breakdown.subtitle")}`}
            build={() => buildBreakdownDoc(project, scenes, duration, labels)}
          />
        ) : (
          <ExportMenu
            label={t("breakdown.export")}
            dialogTitle={t("breakdown.exportScheduleTitle")}
            fileBase={`${project.name} — ${t("breakdown.scheduleSubtitle")}`}
            build={() => buildScheduleDoc(project, schedule, duration, labels)}
          />
        )}
      </div>
    </>
  ) : (
    <span className="h-8" />
  );

  return (
    <PageShell title={feature.label} toolbar={toolbar}>
      {loading || !breakdowns ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoadingDots className="size-4" aria-hidden="true" />
          {t("read.loading")}
        </p>
      ) : scenes.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("film.empty")}</p>
      ) : (
        <div className="space-y-5">
          {tab === "scenes" ? (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm" data-testid="breakdown-scenes">
              {scenes.map((s) => {
                const expanded = open === s.sceneId;
                const filled = BREAKDOWN_FIELDS.filter((f) => s.breakdown[f].trim()).length;
                return (
                  <li key={s.sceneId}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : s.sceneId)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
                    >
                      {expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                      <span className="w-10 shrink-0 font-mono font-semibold tabular-nums">{s.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono font-semibold">{s.heading}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.cast.map((c) => c.name).join(", ") || t("breakdown.noCast")}
                          {s.entries.length > 0 && ` · ${s.entries.map((e) => e.name).join(", ")}`}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", dayOrNight(s.time) === "night" ? "bg-slate-800 text-slate-100" : "bg-amber-100 text-amber-900")}>
                        {t(`breakdown.moment.${dayOrNight(s.time)}`)}
                      </span>
                      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{duration(s.minutes)}</span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{t("breakdown.filled", { count: filled })}</span>
                    </button>
                    {expanded && <BreakdownEditor scene={s} onSave={(b) => save(s.sceneId, b)} onOpen={() => onOpenFeature(structureNodeTabId(s.sceneId))} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="space-y-3" data-testid="shooting-schedule">
              <p className="text-sm text-muted-foreground">{t("breakdown.scheduleHint")}</p>
              {schedule.map((g) => (
                <section key={`${g.location}-${g.place}-${g.moment}`} className="rounded-xl border bg-card p-4 shadow-sm">
                  <h2 className="flex flex-wrap items-baseline gap-2 font-mono text-sm font-semibold">
                    <span>{[g.place ? t(`place.${g.place}`) : "", g.location || t("breakdown.noLocation")].filter(Boolean).join(" ").toUpperCase()}</span>
                    <span className="text-muted-foreground">— {t(`breakdown.moment.${g.moment}`).toUpperCase()}</span>
                    <span className="ml-auto font-sans font-normal tabular-nums text-muted-foreground">
                      {t("breakdown.groupMeta", { count: g.scenes.length, duration: duration(g.minutes) })}
                    </span>
                  </h2>
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{t("breakdown.scenes")} : </span>
                    {g.scenes.map((s) => s.number).join(", ")}
                  </p>
                  {g.cast.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{t("breakdown.cast")} : </span>
                      {g.cast.join(", ")}
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

/** Champs du dépouillement d'une scène ; chacun s'enregistre quand on le quitte. */
function BreakdownEditor({ scene, onSave, onOpen }: { scene: BreakdownScene; onSave: (b: SceneBreakdown) => Promise<void>; onOpen: () => void }) {
  const { t } = useTranslation("series");
  const [draft, setDraft] = useState<SceneBreakdown>(scene.breakdown);
  useEffect(() => setDraft(scene.breakdown), [scene.breakdown]);

  async function commit(field: BreakdownField) {
    if (draft[field] === scene.breakdown[field]) return;
    try {
      await onSave({ ...scene.breakdown, [field]: draft[field] });
    } catch (e) {
      notifyError(errorText(e), "series:breakdown");
    }
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4 sm:px-12">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <p>
          <span className="font-medium">{t("breakdown.cast")} : </span>
          {scene.cast.length ? scene.cast.map((c) => (c.state ? `${c.name} (${c.state})` : c.name)).join(", ") : "—"}
        </p>
        <p>
          <span className="font-medium">{t("breakdown.entries")} : </span>
          {scene.entries.length ? scene.entries.map((e) => e.name).join(", ") : "—"}
        </p>
        <button type="button" onClick={onOpen} className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3.5" />
          {t("read.openScene")}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {BREAKDOWN_FIELDS.map((field) => (
          <label key={field} className="block space-y-1">
            <span className="text-xs font-medium">{t(`breakdown.fields.${field}`)}</span>
            <textarea
              rows={2}
              value={draft[field]}
              placeholder={t(`breakdown.placeholders.${field}`)}
              onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
              onBlur={() => void commit(field)}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
