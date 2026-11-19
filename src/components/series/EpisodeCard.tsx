import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tv } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { goalPercent } from "@/lib/novel";
import { EPISODE_STATUS_COLORS, episodeStatusOf, formatMinutes } from "@/lib/series";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import { EPISODE_STATUSES, type EpisodeFields, type StructureNode } from "@/types";

const input = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface EpisodeCardProps {
  projectId: string;
  node: StructureNode;
  /** Scènes de l'épisode, celles qui sont écrites, et la durée estimée (minutes). */
  scenes: number;
  writtenScenes: number;
  minutes: number;
}

/**
 * Fiche d'un épisode de série : logline, durée visée, statut d'écriture et
 * scénariste. Chaque changement est enregistré aussitôt.
 */
export function EpisodeCard({ projectId, node, scenes, writtenScenes, minutes }: EpisodeCardProps) {
  const { t } = useTranslation(["series", "common"]);
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.seriesEpisode.collapsed");
  const applyNode = useStructureStore((s) => s.applyNode);
  const [logline, setLogline] = useState(node.logline);
  const [writer, setWriter] = useState(node.writer);
  const [goal, setGoal] = useState(node.runtimeGoal ? String(node.runtimeGoal) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => setLogline(node.logline), [node.logline]);
  useEffect(() => setWriter(node.writer), [node.writer]);
  useEffect(() => setGoal(node.runtimeGoal ? String(node.runtimeGoal) : ""), [node.runtimeGoal]);

  const fields: EpisodeFields = { logline: node.logline, runtimeGoal: node.runtimeGoal, episodeStatus: node.episodeStatus, writer: node.writer };

  async function save(changes: Partial<EpisodeFields>) {
    setBusy(true);
    try {
      applyNode(projectId, await api.setSeriesEpisode(projectId, node.id, { ...fields, ...changes }));
    } catch (e) {
      notifyError(errorText(e), "series:episode");
    } finally {
      setBusy(false);
    }
  }

  function commitGoal() {
    const value = goal.trim() === "" ? null : Number.parseInt(goal, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setGoal(node.runtimeGoal ? String(node.runtimeGoal) : "");
      return;
    }
    if ((value || null) !== node.runtimeGoal) void save({ runtimeGoal: value || null });
  }

  const status = episodeStatusOf(node);
  const percent = goalPercent(minutes, node.runtimeGoal);
  const duration = formatMinutes(minutes, {
    lessThanOne: t("duration.lessThanOne"),
    minutes: (n) => t("duration.minutes", { count: n }),
    hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
  });

  return (
    <CollapsibleCard open={open} onOpenChange={setOpen} icon={Tv} title={t("episode.title")} description={t("episode.description")}>
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("episode.logline")}</span>
          <textarea
            rows={2}
            value={logline}
            placeholder={t("episode.loglinePlaceholder")}
            onChange={(e) => setLogline(e.target.value)}
            onBlur={() => logline !== node.logline && void save({ logline })}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("episode.estimated")}</p>
            <p className="flex h-9 items-center text-lg font-semibold tabular-nums">
              {node.runtimeGoal ? t("episode.ofGoal", { duration, goal: node.runtimeGoal }) : duration}
            </p>
            {percent !== null && <ProgressBar percent={percent} />}
          </div>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">{t("episode.runtimeGoal")}</span>
            <input
              type="number"
              min={0}
              value={goal}
              placeholder={t("episode.runtimeGoalPlaceholder")}
              disabled={busy}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={(e) => e.key === "Enter" && commitGoal()}
              className={input}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">{t("episode.writer")}</span>
            <input
              value={writer}
              maxLength={300}
              placeholder={t("episode.writerPlaceholder")}
              onChange={(e) => setWriter(e.target.value)}
              onBlur={() => writer.trim() !== node.writer && void save({ writer })}
              onKeyDown={(e) => e.key === "Enter" && writer.trim() !== node.writer && void save({ writer })}
              className={input}
            />
          </label>
        </div>

        <p className="text-sm text-muted-foreground">{t("episode.scenes", { written: writtenScenes, count: scenes })}</p>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("episode.status")}</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("episode.status")}>
            {EPISODE_STATUSES.map((value) => {
              const selected = status === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => !selected && void save({ episodeStatus: value })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
                    selected && "border-transparent font-medium text-white hover:opacity-90",
                  )}
                  style={selected ? { backgroundColor: EPISODE_STATUS_COLORS[value] } : undefined}
                >
                  {!selected && <span className="size-2 rounded-full" style={{ backgroundColor: EPISODE_STATUS_COLORS[value] }} aria-hidden="true" />}
                  {t(`status.${value}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
