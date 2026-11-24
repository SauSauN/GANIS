import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "@/lib/errors";
import { beatsReport, speakingStats } from "@/lib/filmTools";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { FILM_BEATS, type FilmBeat, type Project } from "@/types";
import { useFilmScript } from "./useFilmScript";

const VERDICT_CLASS = {
  missing: "bg-muted text-muted-foreground",
  early: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  onTime: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  late: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
} as const;

/**
 * Suivi du film, en plus des actes et des séquences :
 * - repères de structure : chaque moment clé placé sur une scène, avec la
 *   minute où il tombe et l'écart avec sa place attendue ;
 * - temps de parole par personnage : répliques, minutes, scènes, minutes
 *   par acte, et plus longue absence.
 */
export function FilmProgressExtras({ project }: { project: Project }) {
  const { t } = useTranslation("series");
  const { film, details, saveDetails, entries, byScene, times, numbers, headingOf, present, characterName, duration, labelOf } = useFilmScript(project);
  const total = useMemo(() => [...times.values()].reduce((sum, v) => sum + v.minutes, 0), [times]);
  const runtime = details?.runtimeGoal ?? total;
  const report = useMemo(() => beatsReport(details?.beats ?? {}, times, runtime), [details?.beats, times, runtime]);
  // Film : minutes par acte ; série : par épisode.
  const groupOf = useMemo(() => (film ? (e: (typeof entries)[number]) => e.season?.id ?? "" : (e: (typeof entries)[number]) => e.episode?.id ?? ""), [film]);
  const stats = useMemo(() => speakingStats(entries, byScene, present, groupOf), [entries, byScene, present, groupOf]);
  const acts = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const e of entries) {
      const node = film ? e.season : e.episode;
      if (node && !out.some((a) => a.id === node.id)) out.push({ id: node.id, label: labelOf(node) });
    }
    return out;
  }, [entries, labelOf, film]);
  const maxMinutes = stats[0]?.minutes ?? 0;

  async function setBeat(beat: FilmBeat, sceneId: string) {
    if (!details) return;
    const beats = { ...details.beats };
    if (sceneId) beats[beat] = sceneId;
    else delete beats[beat];
    try {
      await saveDetails({ ...details, beats });
    } catch (e) {
      notifyError(errorText(e), "series:beats");
    }
  }

  return (
    <>
      {film && (
        <section className="rounded-xl border bg-card p-5 shadow-sm" data-testid="film-beats">
          <h2 className="text-sm font-semibold">{t("beats.title")}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("beats.hint")}</p>
          <ol className="space-y-3">
            {report.map((r, index) => (
              <li key={r.beat} className="grid items-center gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_10rem_7rem]">
                <span className="text-sm font-medium">
                  {index + 1}. {t(`beats.names.${r.beat}`)}
                  <span className="block text-xs font-normal text-muted-foreground">{t("beats.expected", { minute: Math.round(r.expected) })}</span>
                </span>
                <select
                  aria-label={t(`beats.names.${r.beat}`)}
                  value={r.sceneId ?? ""}
                  disabled={!details}
                  onChange={(e) => void setBeat(FILM_BEATS[index], e.target.value)}
                  className="h-8 min-w-0 rounded-md border border-input bg-background px-2 pr-7 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t("beats.choose")}</option>
                  {entries.map((e) => (
                    <option key={e.scene.id} value={e.scene.id}>
                      {numbers.get(e.scene.id)}. {headingOf(e.scene)}
                    </option>
                  ))}
                </select>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {r.minute !== null ? t("beats.at", { minute: Math.round(r.minute), share: Math.round((r.share ?? 0) * 100) }) : "—"}
                </span>
                <span className={cn("justify-self-start rounded-full px-2 py-0.5 text-xs font-medium sm:justify-self-end", VERDICT_CLASS[r.verdict])}>
                  {t(`beats.verdict.${r.verdict}`)}
                </span>
              </li>
            ))}
          </ol>
          {/* Frise : où tombent les repères sur la durée du film. */}
          {runtime > 0 && (
            <div className="relative mt-5 h-8 rounded bg-muted" aria-hidden="true">
              {report.map((r) => (
                <span key={`t-${r.beat}`} className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: `${(r.expected / runtime) * 100}%` }} />
              ))}
              {report
                .filter((r) => r.minute !== null)
                .map((r) => (
                  <span
                    key={`m-${r.beat}`}
                    className={cn(
                      "absolute top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-background text-center text-[10px] font-bold leading-4",
                      VERDICT_CLASS[r.verdict],
                    )}
                    style={{ left: `${Math.min(100, ((r.minute ?? 0) / runtime) * 100)}%` }}
                  >
                    {FILM_BEATS.indexOf(r.beat) + 1}
                  </span>
                ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-sm" data-testid="speaking-stats">
        <h2 className="text-sm font-semibold">{t("stats.title")}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t("stats.hint")}</p>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("stats.none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">{t("stats.columns.character")}</th>
                  <th className="px-3 py-2 font-medium">{t("stats.columns.minutes")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("stats.columns.lines")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("stats.columns.scenes")}</th>
                  {acts.map((a) => (
                    <th key={a.id} className="px-3 py-2 text-right font-medium">
                      {a.label}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">{t("stats.columns.gap")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.characterId} className="border-b last:border-0">
                    <td className="max-w-48 truncate py-2 pr-3">{characterName(s.characterId)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${maxMinutes ? (s.minutes / maxMinutes) * 100 : 0}%` }} />
                        </span>
                        <span className="tabular-nums">{duration(s.minutes)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.lines}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.scenes}</td>
                    {acts.map((a) => (
                      <td key={a.id} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.byAct.get(a.id) ? duration(s.byAct.get(a.id)!) : "—"}
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                      {s.longestGap > 0 ? (
                        <>
                          {duration(s.longestGap)}
                          <span className="block text-xs">{t("stats.gapFrom", { minute: Math.round(s.gapFrom ?? 0) })}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
