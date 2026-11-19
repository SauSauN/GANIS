import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { goalPercent } from "@/lib/novel";
import { EPISODE_STATUS_COLORS, episodeProgress, episodeStatusOf, formatMinutes, seriesLevels, type EpisodeProgress } from "@/lib/series";
import { structureNodeTabId } from "@/lib/structure";
import { useProjectCharacters } from "@/stores/characterStore";
import { useSeriesBlocks } from "@/stores/seriesStore";
import { useStructureStore } from "@/stores/structureStore";
import { EPISODE_STATUSES, type EpisodeStatus, type Project, type StructureNode } from "@/types";

interface SeriesProgressViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Suivi des épisodes : statut (modifiable ici), scénariste, scènes écrites,
 * durée estimée par rapport à la durée visée, saison par saison ; répliques
 * par personnage sur toute la série.
 */
export function SeriesProgressView({ project, feature, onOpenFeature }: SeriesProgressViewProps) {
  const { t } = useTranslation("series");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { blocks, error } = useSeriesBlocks(project.id);
  const { characters } = useProjectCharacters(project.id);
  const applyNode = useStructureStore((s) => s.applyNode);

  const levelCount = structure?.levels.length ?? 0;
  const progress = useMemo(() => (structure && blocks ? episodeProgress(structure.nodes, levelCount, blocks) : []), [structure, levelCount, blocks]);

  // Épisodes regroupés par saison (niveau juste au-dessus).
  const seasons = useMemo(() => {
    if (!structure) return [];
    const seasonLevel = seriesLevels(levelCount).episode - 1;
    const byId = new Map(structure.nodes.map((n) => [n.id, n]));
    const seasonOf = (node: StructureNode): StructureNode | null => {
      let current = node.parentId ? byId.get(node.parentId) : undefined;
      while (current && current.level > seasonLevel) current = current.parentId ? byId.get(current.parentId) : undefined;
      return seasonLevel >= 0 && current?.level === seasonLevel ? current : null;
    };
    const groups: Array<{ season: StructureNode | null; episodes: EpisodeProgress[] }> = [];
    for (const item of progress) {
      const season = seasonOf(item.episode);
      const last = groups[groups.length - 1];
      if (last && last.season?.id === season?.id) last.episodes.push(item);
      else groups.push({ season, episodes: [item] });
    }
    return groups;
  }, [structure, levelCount, progress]);

  const duration = (minutes: number) =>
    formatMinutes(minutes, {
      lessThanOne: t("duration.lessThanOne"),
      minutes: (n) => t("duration.minutes", { count: n }),
      hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
    });

  const totals = progress.reduce(
    (sum, p) => ({
      minutes: sum.minutes + p.minutes,
      goal: sum.goal + (p.episode.runtimeGoal ?? 0),
      scenes: sum.scenes + p.scenes,
      written: sum.written + p.writtenScenes,
      final: sum.final + (episodeStatusOf(p.episode) === "final" ? 1 : 0),
    }),
    { minutes: 0, goal: 0, scenes: 0, written: 0, final: 0 },
  );
  const cast = useMemo(() => {
    const lines = new Map<string, number>();
    for (const p of progress) for (const [id, n] of p.lines) lines.set(id, (lines.get(id) ?? 0) + n);
    return [...lines.entries()]
      .map(([id, count]) => ({ character: characters.find((c) => c.id === id), count }))
      .filter((row) => row.character)
      .sort((a, b) => b.count - a.count);
  }, [progress, characters]);
  const maxLines = cast[0]?.count ?? 0;

  async function setStatus(episode: StructureNode, status: EpisodeStatus) {
    try {
      applyNode(
        project.id,
        await api.setSeriesEpisode(project.id, episode.id, { logline: episode.logline, runtimeGoal: episode.runtimeGoal, episodeStatus: status, writer: episode.writer }),
      );
    } catch (e) {
      notifyError(errorText(e), "series:progress");
    }
  }

  return (
    <PageShell title={feature.label}>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("progress.failed")}
        </p>
      ) : !structure || !blocks ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("progress.loading")}
        </p>
      ) : progress.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("progress.empty")}</p>
      ) : (
        <div className="space-y-6">
          {/* Totaux */}
          <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("progress.episodes", { count: progress.length })}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {totals.final}
                <span className="text-lg font-normal text-muted-foreground"> / {progress.length}</span>
              </p>
              <p className="text-xs text-muted-foreground">{t("progress.final")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("progress.totalDuration")}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {duration(totals.minutes)}
                {totals.goal > 0 && <span className="text-lg font-normal text-muted-foreground"> / {duration(totals.goal)}</span>}
              </p>
              {totals.goal > 0 && <ProgressBar percent={goalPercent(totals.minutes, totals.goal) ?? 0} className="h-2 max-w-60" />}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("progress.scenesWritten")}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {totals.written}
                <span className="text-lg font-normal text-muted-foreground"> / {totals.scenes}</span>
              </p>
              {totals.scenes > 0 && <ProgressBar percent={goalPercent(totals.written, totals.scenes) ?? 0} className="h-2 max-w-60" />}
            </div>
          </section>

          {/* Épisodes par saison */}
          {seasons.map((group) => {
            const minutes = group.episodes.reduce((sum, p) => sum + p.minutes, 0);
            return (
              <section key={group.season?.id ?? "none"} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <h2 className="border-b px-5 py-3 text-sm font-semibold">
                  {t("progress.season", { label: group.season ? labelOf(group.season) : t("progress.noSeason"), duration: duration(minutes) })}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-5 py-2 font-medium">{t("progress.columns.episode")}</th>
                        <th className="px-3 py-2 font-medium">{t("progress.columns.status")}</th>
                        <th className="px-3 py-2 font-medium">{t("progress.columns.writer")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("progress.columns.scenes")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("progress.columns.duration")}</th>
                        <th className="px-5 py-2 text-right font-medium">{t("progress.columns.goal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.episodes.map((p) => {
                        const status = episodeStatusOf(p.episode);
                        const over = p.episode.runtimeGoal !== null && p.minutes > p.episode.runtimeGoal * 1.1;
                        return (
                          <tr key={p.episode.id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="max-w-72 px-5 py-2">
                              <button
                                type="button"
                                className="block max-w-full truncate text-left font-medium hover:underline"
                                onClick={() => onOpenFeature(structureNodeTabId(p.episode.id))}
                              >
                                {labelOf(p.episode)}
                              </button>
                              {p.episode.logline && <p className="truncate text-xs text-muted-foreground">{p.episode.logline}</p>}
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: EPISODE_STATUS_COLORS[status] }} aria-hidden="true" />
                                <select
                                  aria-label={t("progress.columns.status")}
                                  value={status}
                                  onChange={(e) => void setStatus(p.episode, e.target.value as EpisodeStatus)}
                                  className="h-7 rounded border-transparent bg-transparent pr-6 text-sm outline-none hover:border-input focus:ring-2 focus:ring-ring"
                                >
                                  {EPISODE_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {t(`status.${s}`)}
                                    </option>
                                  ))}
                                </select>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{p.episode.writer || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {p.writtenScenes} / {p.scenes}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                {over && <AlertTriangle className="size-3.5 text-warning" aria-label={t("progress.overGoal")} />}
                                {duration(p.minutes)}
                              </span>
                            </td>
                            <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{p.episode.runtimeGoal ? duration(p.episode.runtimeGoal) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {/* Répliques par personnage */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{t("progress.cast")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("progress.castHint")}</p>
            {cast.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("progress.noLines")}</p>
            ) : (
              <ul className="space-y-2">
                {cast.map(({ character, count }) => (
                  <li key={character!.id} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate">{fullName(character!) || "—"}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(count / maxLines) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
