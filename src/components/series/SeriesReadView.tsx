import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2 } from "lucide-react";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import {
  blocksByScene,
  buildFountain,
  buildSeriesExport,
  formatMinutes,
  linesToMinutes,
  sceneHeadingText,
  sceneLines,
  scenesInOrder,
  type SeriesExportInput,
} from "@/lib/series";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useSeriesBlocks } from "@/stores/seriesStore";
import type { Project, SceneBlock, ScenePlace, SceneTime } from "@/types";

interface SeriesReadViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Lecture du scénario de série : toutes les scènes dans l'ordre du plan,
 * au format du scénario (en-tête, action, réplique centrée, transition à
 * droite), filtrables par saison ou par épisode. Export Word, PDF, texte et
 * Fountain de la sélection.
 */
export function SeriesReadView({ project, feature, onOpenFeature }: SeriesReadViewProps) {
  const { t } = useTranslation("series");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { blocks, error } = useSeriesBlocks(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  // Sélection : « » (toute la série), ou l'identifiant d'une saison ou d'un épisode.
  const [filter, setFilter] = useState("");

  const levelCount = structure?.levels.length ?? 0;
  const allEntries = useMemo(() => (structure ? scenesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const entries = useMemo(
    () => (filter ? allEntries.filter((e) => e.episode?.id === filter || e.season?.id === filter) : allEntries),
    [allEntries, filter],
  );
  const byScene = useMemo(() => blocksByScene(blocks ?? []), [blocks]);

  // Choix du filtre : saisons, puis leurs épisodes.
  const options = useMemo(() => {
    const out: Array<{ id: string; label: string; depth: number }> = [];
    const seen = new Set<string>();
    for (const entry of allEntries) {
      if (entry.season && !seen.has(entry.season.id)) {
        seen.add(entry.season.id);
        out.push({ id: entry.season.id, label: labelOf(entry.season), depth: 0 });
      }
      if (entry.episode && !seen.has(entry.episode.id)) {
        seen.add(entry.episode.id);
        out.push({ id: entry.episode.id, label: labelOf(entry.episode), depth: entry.season ? 1 : 0 });
      }
    }
    return out;
  }, [allEntries, labelOf]);

  const labels = {
    place: (v: ScenePlace) => t(`place.${v}`),
    time: (v: SceneTime) => t(`time.${v}`),
  };
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? null;
  const characterName = (id: string | null) => {
    const c = id ? characters.find((item) => item.id === id) : undefined;
    return c ? (fullName(c) || "—").toUpperCase() : "";
  };
  const duration = (minutes: number) =>
    formatMinutes(minutes, {
      lessThanOne: t("duration.lessThanOne"),
      minutes: (n) => t("duration.minutes", { count: n }),
      hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
    });
  const totalMinutes = linesToMinutes(entries.reduce((sum, e) => sum + sceneLines(byScene.get(e.scene.id) ?? []), 0));

  const exportInput = (): SeriesExportInput => ({
    project,
    entries,
    blocks: byScene,
    labelOf,
    characters,
    locations,
    nameOf: (c) => fullName(c) || "—",
    labels: {
      ...labels,
      subtitle: t("read.subtitle"),
      untitledScene: (label) => t("read.untitledScene", { label }),
      logline: t("read.logline"),
      writer: t("read.writer"),
      noScript: t("read.noScript"),
    },
  });
  const selected = options.find((o) => o.id === filter);
  const fileBase = selected ? `${project.name} — ${selected.label}` : project.name;

  let season: string | null | undefined;
  let episode: string | null | undefined;

  return (
    <PageShell title={feature.label}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{t("read.filter")}</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 pr-7 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("read.all")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {"   ".repeat(o.depth)}
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {blocks && <span className="text-sm text-muted-foreground tabular-nums">{t("read.estimate", { duration: duration(totalMinutes) })}</span>}
          <div className="ml-auto">
            <ExportMenu
              label={t("read.export")}
              dialogTitle={t("read.dialogTitle")}
              fileBase={fileBase}
              build={() => buildSeriesExport(exportInput())}
              fountain={{ label: t("read.fountain"), build: () => buildFountain(exportInput()) }}
              disabled={!blocks || entries.length === 0}
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t("read.failed")}
          </p>
        ) : !structure || !blocks ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("read.loading")}
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("read.empty")}</p>
        ) : (
          <article className="mx-auto max-w-3xl rounded-xl border bg-card px-6 py-10 font-mono text-sm leading-6 shadow-sm sm:px-14" data-testid="series-script">
            {entries.map((entry) => {
              const parts = [];
              if ((entry.season?.id ?? null) !== season) {
                season = entry.season?.id ?? null;
                if (entry.season)
                  parts.push(
                    <h2 key={`s-${entry.season.id}`} className="mb-6 mt-10 text-center font-sans text-xl font-semibold first:mt-0">
                      {labelOf(entry.season)}
                    </h2>,
                  );
              }
              if ((entry.episode?.id ?? null) !== episode) {
                episode = entry.episode?.id ?? null;
                if (entry.episode)
                  parts.push(
                    <header key={`e-${entry.episode.id}`} className="mb-6 mt-8 border-b pb-3 font-sans first:mt-0">
                      <h3 className="text-lg font-semibold">{labelOf(entry.episode)}</h3>
                      {entry.episode.logline.trim() && <p className="mt-1 text-sm italic text-muted-foreground">{entry.episode.logline}</p>}
                    </header>,
                  );
              }
              const list = byScene.get(entry.scene.id) ?? [];
              const heading = sceneHeadingText(entry.scene, locationName, labels) || labelOf(entry.scene).toUpperCase();
              parts.push(
                <section key={entry.scene.id} className="group mb-6">
                  <h4 className="flex items-center gap-2 font-bold">
                    <span className="min-w-0 flex-1">{heading}</span>
                    <button
                      type="button"
                      className="rounded p-1 font-sans text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                      aria-label={t("read.openScene")}
                      title={t("read.openScene")}
                      onClick={() => onOpenFeature(structureNodeTabId(entry.scene.id))}
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                  </h4>
                  {list.filter((b) => b.kind !== "note" && b.content.trim()).length === 0 ? (
                    <p className="mt-2 font-sans italic text-muted-foreground">{t("read.noScript")}</p>
                  ) : (
                    list.map((block) => <ScriptBlock key={block.id} block={block} speaker={characterName(block.characterId)} />)
                  )}
                </section>,
              );
              return parts;
            })}
          </article>
        )}
      </div>
    </PageShell>
  );
}

/** Un élément du scénario, mis en page comme sur la page imprimée. */
function ScriptBlock({ block, speaker }: { block: SceneBlock; speaker: string }) {
  const content = block.content.trim();
  if (!content || block.kind === "note") return null;
  if (block.kind === "dialogue") {
    return (
      <div className="mx-auto mt-3 max-w-[22rem]">
        <p className="text-center font-bold">{speaker || "—"}</p>
        {block.parenthetical.trim() && <p className="px-6 text-center italic">({block.parenthetical.trim().replace(/^\(|\)$/g, "")})</p>}
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    );
  }
  return (
    <p className={cn("mt-3 whitespace-pre-wrap", block.kind === "transition" && "text-right font-bold uppercase", block.kind === "shot" && "font-bold uppercase")}>
      {content}
    </p>
  );
}
