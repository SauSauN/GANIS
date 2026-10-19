import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, PenLine, RotateCcw } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/errors";
import { goalPercent } from "@/lib/novel";
import { cn } from "@/lib/utils";
import { sessionWords, useWritingStore } from "@/stores/writingStore";

/*
 * Mots écrits aujourd'hui (roman) : barre d'état, en-tête du texte agrandi
 * et carte « Aujourd'hui » du suivi de rédaction. Les chiffres viennent de
 * `writingStore`, relus après chaque enregistrement d'un texte.
 */

function useToday() {
  const projectId = useWritingStore((s) => s.projectId);
  const stats = useWritingStore((s) => s.stats);
  const session = useWritingStore((s) => s.session);
  return { projectId, stats, session, sessionWords: sessionWords(stats, session) };
}

/** Barre d'état : « 640 / 1 000 aujourd'hui ». */
export function WritingTodayStatus() {
  const { t } = useTranslation("novel");
  const { stats, sessionWords: session } = useToday();
  if (!stats) return null;
  const words = Math.max(0, stats.wordsToday);
  const reached = stats.dailyGoal !== null && words >= stats.dailyGoal;
  return (
    <span
      className={cn("flex items-center gap-1 tabular-nums", reached && "text-success")}
      title={t("today.sessionHint", { count: session })}
    >
      <PenLine className="h-3 w-3" aria-hidden="true" />
      {stats.dailyGoal
        ? t("today.statusGoal", { words: words.toLocaleString(), goal: stats.dailyGoal.toLocaleString() })
        : t("today.status", { count: words, words: words.toLocaleString() })}
    </span>
  );
}

/** En-tête du texte agrandi : mots du jour et barre vers l'objectif. */
export function WritingTodayInline() {
  const { t } = useTranslation("novel");
  const { stats } = useToday();
  if (!stats) return null;
  const words = Math.max(0, stats.wordsToday);
  const percent = goalPercent(words, stats.dailyGoal);
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
      {stats.dailyGoal
        ? t("today.statusGoal", { words: words.toLocaleString(), goal: stats.dailyGoal.toLocaleString() })
        : t("today.status", { count: words, words: words.toLocaleString() })}
      {percent !== null && <ProgressBar percent={percent} className="w-20" />}
    </span>
  );
}

/** Heure courte (« 14:32 »). */
function clock(ms: number, language: string) {
  return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

/** Carte « Aujourd'hui » du suivi de rédaction. */
export function WritingTodayCard({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation("novel");
  const { stats, session, sessionWords: sessionCount } = useToday();
  const setGoal = useWritingStore((s) => s.setGoal);
  const newSession = useWritingStore((s) => s.newSession);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(stats?.dailyGoal ? String(stats.dailyGoal) : ""), [stats?.dailyGoal]);

  if (!stats) return null;
  const words = Math.max(0, stats.wordsToday);
  const goal = stats.dailyGoal;
  const percent = goalPercent(words, goal);
  const max = Math.max(goal ?? 0, ...stats.days.map((d) => d.words), 1);

  async function commit() {
    const value = draft.trim() === "" ? null : Number.parseInt(draft, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setDraft(goal ? String(goal) : "");
      return;
    }
    if ((value || null) === goal) return;
    setError(null);
    try {
      await setGoal(projectId, value || null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00`));

  return (
    <section className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{t("today.title")}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {words.toLocaleString()}
              {goal ? <span className="text-lg font-normal text-muted-foreground"> / {goal.toLocaleString()}</span> : null}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:items-end">
            {t("today.goal")}
            <input
              type="number"
              min={0}
              step={100}
              value={draft}
              placeholder={t("today.goalPlaceholder")}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(e) => e.key === "Enter" && void commit()}
              className="h-9 w-32 rounded-md border border-input bg-background px-3 text-right text-sm font-normal tabular-nums outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        {percent !== null && goal ? (
          <div className="space-y-1.5">
            <ProgressBar percent={percent} className="h-2" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {words >= goal ? t("today.reached") : t("today.remaining", { value: (goal - words).toLocaleString() })}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="tabular-nums">
            {t("today.session", { count: sessionCount, words: sessionCount.toLocaleString() })}
            {session && <span className="text-muted-foreground"> · {t("today.since", { time: clock(session.startedAt, i18n.language) })}</span>}
          </span>
          <Button variant="ghost" size="sm" className="-ml-2 h-7" onClick={newSession} title={t("today.newSessionHint")}>
            <RotateCcw />
            {t("today.newSession")}
          </Button>
          {goal ? (
            <span className={cn("flex items-center gap-1 tabular-nums", stats.streak > 0 ? "text-foreground" : "text-muted-foreground")}>
              <Flame className={cn("size-4", stats.streak > 0 ? "text-warning" : "text-muted-foreground")} aria-hidden="true" />
              {t("today.streak", { count: stats.streak })}
              {stats.bestStreak > stats.streak && <span className="text-muted-foreground"> · {t("today.best", { count: stats.bestStreak })}</span>}
            </span>
          ) : null}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* 30 derniers jours */}
      <figure className="min-w-0">
        <figcaption className="mb-2 text-sm text-muted-foreground">{t("today.recent")}</figcaption>
        <div className="relative flex h-28 items-end gap-[3px]" role="img" aria-label={t("today.recent")}>
          {goal ? (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40" style={{ bottom: `${(goal / max) * 100}%` }} aria-hidden="true" />
          ) : null}
          {stats.days.map((day) => {
            const value = Math.max(0, day.words);
            const met = goal !== null && value >= goal;
            return (
              <div
                key={day.day}
                className="group relative flex h-full flex-1 items-end"
                title={`${dayLabel(day.day)} · ${t("words", { count: value })}`}
              >
                <div
                  className={cn(
                    "w-full rounded-t-sm",
                    met ? "bg-success" : value > 0 ? "bg-primary/70" : "bg-muted",
                    day.day === stats.today && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card",
                  )}
                  style={{ height: value > 0 ? `${Math.max(4, (value / max) * 100)}%` : "3px" }}
                />
              </div>
            );
          })}
        </div>
      </figure>
    </section>
  );
}
