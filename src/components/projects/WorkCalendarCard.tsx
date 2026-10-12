import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight, Flame, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  buildYear,
  formatDuration,
  isoDay,
  levelOf,
  levelThresholds,
  summarize,
  type DayWork,
  type Level,
} from "@/lib/workCalendar";
import type { Project, WorkCalendar } from "@/types";

/** Teinte unique (primaire), du plus clair au plus foncé ; 0 = case vide. */
const LEVEL_STYLE: Record<Level, string> = {
  0: "var(--muted)",
  1: "color-mix(in oklab, var(--primary) 28%, var(--muted))",
  2: "color-mix(in oklab, var(--primary) 52%, var(--muted))",
  3: "color-mix(in oklab, var(--primary) 76%, var(--muted))",
  4: "var(--primary)",
};

const GAP = 3;
/** Largeur réservée aux noms des jours (à gauche du calendrier). */
const LABELS = 32;

interface WorkCalendarCardProps {
  projects: Project[];
  /** Page dédiée : le détail du rythme est déplié d'emblée. */
  expanded?: boolean;
}

/**
 * Rythme de travail : une case par jour de l'année (janvier à décembre),
 * plus ou moins foncée selon le temps passé, comme les contributions de
 * GitHub. Sous le calendrier : volume par mois et détection du rythme
 * (séries, pauses, périodes intenses, tendance).
 */
export function WorkCalendarCard({ projects, expanded = false }: WorkCalendarCardProps) {
  const { t, i18n } = useTranslation("workCalendar");
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [calendar, setCalendar] = useState<WorkCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Cases à la taille de la carte (10 à 16 px) : le calendrier occupe toute la largeur.
  const [CELL, setCell] = useState(12);
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = Math.floor((entry.contentRect.width - LABELS) / 54) - GAP;
      setCell(Math.max(10, Math.min(16, size)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function load(target: number) {
    setError(null);
    try {
      setCalendar(await api.getWorkCalendar(target));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    setSelected(null);
    void load(year);
  }, [year]);

  // Jours du projet choisi (ou de tous les projets).
  const data: DayWork[] = useMemo(
    () =>
      (calendar?.days ?? [])
        .map((day) => {
          if (!projectId) return { day: day.day, minutes: day.minutes, actions: day.actions };
          const part = day.projects.find((item) => item.projectId === projectId);
          return { day: day.day, minutes: part?.minutes ?? 0, actions: part?.actions ?? 0 };
        })
        .filter((day) => day.minutes > 0),
    [calendar, projectId],
  );

  const today = new Date();
  const { cells, weeks, monthStarts } = useMemo(() => buildYear(year, data, today), [year, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const thresholds = useMemo(() => levelThresholds(data), [data]);
  const summary = useMemo(() => summarize(year, data, today), [year, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const language = i18n.language;
  const dayLabel = (day: string, style: "long" | "short" = "long") =>
    new Intl.DateTimeFormat(language, style === "long" ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }).format(
      new Date(`${day}T12:00:00`),
    );
  const monthNames = Array.from({ length: 12 }, (_, m) =>
    new Intl.DateTimeFormat(language, { month: "short" }).format(new Date(2026, m, 1)),
  );
  const weekdayNames = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(language, { weekday: "short" }).format(new Date(2026, 0, 5 + d)),
  );
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? t("unknownProject");

  const firstYear = Math.min(calendar?.firstYear ?? currentYear, currentYear);
  const width = weeks * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;
  const maxMonth = Math.max(...summary.months, 1);
  const hovered = hover ? cells.find((cell) => cell.day === hover.day) : null;
  const selectedDay = selected ? calendar?.days.find((day) => day.day === selected) : null;

  return (
    <section aria-labelledby="work-calendar-title" className="rounded-xl border bg-card shadow-sm">
      {/* En-tête : titre, projet, année */}
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5">
        <div className="min-w-0 flex-1">
          <h2 id="work-calendar-title" className={cn("flex items-center gap-2 text-base font-semibold", expanded && "sr-only")}>
            <Activity className="size-4 text-primary" />
            {t("title")}
          </h2>
          {/* Résumé en une ligne (le détail est replié plus bas). */}
          <p className="text-sm text-muted-foreground tabular-nums">
            {summary.activeDays === 0
              ? t("subtitle")
              : t("summaryLine", {
                  year,
                  time: formatDuration(summary.totalMinutes),
                  days: tt("stats.daysValue", { count: summary.activeDays }),
                })}
            {summary.currentStreak >= 2 && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-foreground">
                <Flame aria-hidden className="size-3.5 text-primary" />
                {tt("streak", { count: summary.currentStreak })}
              </span>
            )}
          </p>
        </div>

        <select
          aria-label={t("project")}
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="h-8 max-w-48 rounded-md border-0 bg-transparent px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-ring"
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1" role="group" aria-label={t("year")}>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={year <= firstYear}
            onClick={() => setYear(year - 1)}
            aria-label={t("previousYear")}
            title={t("previousYear")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">{year}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={year >= currentYear}
            onClick={() => setYear(year + 1)}
            aria-label={t("nextYear")}
            title={t("nextYear")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-center gap-3 px-6 py-6 text-sm text-destructive">
          {error}
          <Button variant="outline" size="sm" onClick={() => void load(year)}>
            <RefreshCw className="mr-1.5 size-3.5" />
            {t("retry")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-6 pt-4 pb-4">

          {/* Calendrier */}
          <div className="relative overflow-x-auto pb-1" ref={gridRef}>
            <div className="inline-flex flex-col gap-1">
              {/* Mois */}
              <div className="relative ml-8 h-4 text-[0.7rem] text-muted-foreground" style={{ width }} aria-hidden>
                {monthStarts.map((week, month) => (
                  <span key={month} className="absolute top-0" style={{ left: week * (CELL + GAP) }}>
                    {monthNames[month]}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                {/* Jours de la semaine (lundi, mercredi, vendredi) */}
                <div className="flex w-6 flex-col justify-between text-[0.65rem] leading-none text-muted-foreground" style={{ height }} aria-hidden>
                  {weekdayNames.map((name, index) => (
                    <span key={index} className={cn("h-3", index % 2 === 1 && "invisible")}>
                      {name}
                    </span>
                  ))}
                </div>

                <div
                  role="grid"
                  aria-label={t("gridLabel", { year })}
                  className="relative"
                  style={{ width, height }}
                  onMouseLeave={() => setHover(null)}
                >
                  {cells.map((cell) => {
                    const level = cell.future ? 0 : levelOf(cell.minutes, thresholds);
                    const label = cell.future
                      ? dayLabel(cell.day)
                      : cell.minutes
                        ? t("cellLabel", { date: dayLabel(cell.day), time: formatDuration(cell.minutes), count: cell.actions })
                        : t("cellEmpty", { date: dayLabel(cell.day) });
                    return (
                      <button
                        key={cell.day}
                        type="button"
                        role="gridcell"
                        aria-label={label}
                        aria-selected={selected === cell.day}
                        disabled={cell.future}
                        onClick={() => setSelected(selected === cell.day ? null : cell.day)}
                        onMouseEnter={() => setHover({ day: cell.day, x: cell.week * (CELL + GAP), y: cell.weekday * (CELL + GAP) })}
                        onFocus={() => setHover({ day: cell.day, x: cell.week * (CELL + GAP), y: cell.weekday * (CELL + GAP) })}
                        onBlur={() => setHover(null)}
                        className={cn(
                          "absolute rounded-[3px] outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring",
                          cell.future && "opacity-40",
                          cell.day === isoDay(today) && "ring-1 ring-foreground/40",
                          selected === cell.day && "ring-2 ring-foreground",
                        )}
                        style={{
                          left: cell.week * (CELL + GAP),
                          top: cell.weekday * (CELL + GAP),
                          width: CELL,
                          height: CELL,
                          background: LEVEL_STYLE[level],
                        }}
                      />
                    );
                  })}

                  {/* Info-bulle */}
                  {hovered && hover && (
                    <div
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
                        // Lignes du haut : sous la case (sinon coupé par le bord).
                        hovered.weekday >= 3 && "-translate-y-full",
                      )}
                      style={{
                        left: Math.min(Math.max(hover.x + CELL / 2, 90), width - 90),
                        top: hovered.weekday >= 3 ? hover.y - 6 : hover.y + CELL + 6,
                      }}
                    >
                      <p className="font-medium first-letter:uppercase">{dayLabel(hovered.day)}</p>
                      <p className="text-muted-foreground">
                        {hovered.future
                          ? t("future")
                          : hovered.minutes
                            ? t("tooltip", { time: formatDuration(hovered.minutes), count: hovered.actions })
                            : t("noWork")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Légende (les seuils au survol) */}
              <div className="ml-8 flex justify-end pt-1 text-xs text-muted-foreground" style={{ width }}>
                <span
                  className="flex items-center gap-1"
                  title={t("legendHint", { a: formatDuration(thresholds[0]), b: formatDuration(thresholds[1]), c: formatDuration(thresholds[2]) })}
                >
                  {t("less")}
                  {([0, 1, 2, 3, 4] as Level[]).map((level) => (
                    <span key={level} className="size-3 rounded-[3px]" style={{ background: LEVEL_STYLE[level] }} aria-hidden />
                  ))}
                  {t("more")}
                </span>
              </div>
            </div>
          </div>

          {/* Détail d'une journée */}
          {selected && (
            <div className="rounded-lg border bg-background px-4 py-3 text-sm">
              <p className="font-medium first-letter:uppercase">{dayLabel(selected)}</p>
              {selectedDay && selectedDay.projects.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {[...selectedDay.projects]
                    .sort((a, b) => b.minutes - a.minutes)
                    .map((part) => (
                      <li key={part.projectId} className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/workspace/${part.projectId}`)}
                          className="truncate text-left hover:text-primary hover:underline"
                        >
                          {projectName(part.projectId)}
                        </button>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {t("tooltip", { time: formatDuration(part.minutes), count: part.actions })}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">{t("noWork")}</p>
              )}
            </div>
          )}

          {/* Détail du rythme : replié par défaut (fonctions secondaires). */}
          <details className="group/details border-t pt-3" open={expanded || undefined}>
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 transition-transform group-open/details:rotate-90" />
              {summary.rhythm !== "none" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{tt(`rhythm.${summary.rhythm}`)}</span>
              )}
              {t("details")}
            </summary>

            <div className="mt-4 space-y-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                {[
                  [t("stats.days"), `${summary.activeDays} / ${summary.elapsedDays}`],
                  [t("stats.average"), formatDuration(summary.averageMinutes)],
                  [t("stats.longest"), tt("stats.daysValue", { count: summary.longestStreak?.days ?? 0 })],
                  [t("stats.current"), tt("stats.daysValue", { count: summary.currentStreak })],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              {/* Volume par mois */}
              <div>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("months")}</h3>
                <div className="flex h-28 items-end gap-1.5" role="list" aria-label={t("months")}>
                  {summary.months.map((minutes, month) => (
                    <div
                      key={month}
                      role="listitem"
                      aria-label={`${monthNames[month]} : ${formatDuration(minutes)}`}
                      title={`${monthNames[month]} : ${formatDuration(minutes)}`}
                      className="group/month flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span
                        className="relative w-full max-w-7 shrink-0 rounded-t-[4px] bg-primary transition-opacity group-hover/month:opacity-80"
                        style={{
                          height: minutes > 0 ? Math.max(3, Math.round((minutes / maxMonth) * 76)) : 0,
                          opacity: month === summary.busiestMonth ? 1 : 0.55,
                        }}
                      >
                        {/* Valeur affichée seulement pour le mois le plus chargé (les autres : au survol). */}
                        {month === summary.busiestMonth && (
                          <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[0.65rem] font-medium whitespace-nowrap text-foreground tabular-nums">
                            {formatDuration(minutes)}
                          </span>
                        )}
                      </span>
                      <span className="text-[0.65rem] text-muted-foreground">{monthNames[month].replace(".", "")}</span>
                    </div>
                  ))}
                </div>
              </div>
  
              {/* Détection du rythme */}
              <div>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("detection.title")}</h3>
                {summary.rhythm === "none" ? (
                  <p className="text-sm text-muted-foreground">{t("detection.none")}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    <li>
                      {t("detection.pace", { days: summary.daysPerWeek.toLocaleString(language, { maximumFractionDigits: 1 }), time: formatDuration(summary.averageMinutes) })}
                    </li>
                    {summary.busiestWeek && (
                      <li>
                        {t("detection.busiestWeek", { date: dayLabel(summary.busiestWeek.monday, "short"), time: formatDuration(summary.busiestWeek.minutes) })}
                      </li>
                    )}
                    {summary.busiestDay && (
                      <li>{t("detection.busiestDay", { date: dayLabel(summary.busiestDay.day), time: formatDuration(summary.busiestDay.minutes) })}</li>
                    )}
                    {summary.favoriteWeekday !== null && (
                      <li>{t("detection.weekday", { day: new Intl.DateTimeFormat(language, { weekday: "long" }).format(new Date(2026, 0, 5 + summary.favoriteWeekday)) })}</li>
                    )}
                    {summary.longestBreak && summary.longestBreak.days >= 7 && (
                      <li>
                        {t("detection.break", {
                          count: summary.longestBreak.days,
                          from: dayLabel(summary.longestBreak.from, "short"),
                          to: dayLabel(summary.longestBreak.to, "short"),
                        })}
                      </li>
                    )}
                    {summary.trend !== null && (
                      <li className="flex items-center gap-1.5">
                        {summary.trend >= 0 ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-muted-foreground" />}
                        {summary.trend >= 0
                          ? t("detection.trendUp", { value: summary.trend })
                          : t("detection.trendDown", { value: Math.abs(summary.trend) })}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
