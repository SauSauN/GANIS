import { NumberStepper } from "@/components/common/NumberStepper";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Film } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { goalPercent } from "@/lib/novel";
import { EMPTY_FILM, formatMinutes } from "@/lib/series";
import type { FilmDetails } from "@/types";

const input = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface FilmDetailsCardProps {
  /** Fiche enregistrée (`null` pendant le chargement). */
  details: FilmDetails | null;
  /** Durée estimée du film entier (minutes). */
  minutes: number;
  onSave: (details: FilmDetails) => Promise<FilmDetails>;
  /** Bouton d'export du dossier du film, en tête de la fiche. */
  action?: ReactNode;
}

/** Textes du dossier du film, plus longs : ils se déplient. */
const DOSSIER: Array<{ key: "pitch" | "intention"; rows: number }> = [
  { key: "pitch", rows: 3 },
  { key: "intention", rows: 6 },
];

/**
 * Fiche du film entier, en tête du Suivi du film : logline, durée visée et
 * scénariste (imprimés sur la page de titre de l'export), avec la durée
 * estimée par rapport à la durée visée ; pitch et note d'intention du
 * dossier du film (exporté avec le synopsis du projet, le séquencier et le
 * traitement). Chaque champ s'enregistre quand on le quitte.
 */
export function FilmDetailsCard({ details, minutes, onSave, action }: FilmDetailsCardProps) {
  const { t } = useTranslation("series");
  const saved = details ?? EMPTY_FILM;
  const [logline, setLogline] = useState(saved.logline);
  const [writer, setWriter] = useState(saved.writer);
  const [goal, setGoal] = useState(saved.runtimeGoal ? String(saved.runtimeGoal) : "");

  useEffect(() => setLogline(saved.logline), [saved.logline]);
  useEffect(() => setWriter(saved.writer), [saved.writer]);
  useEffect(() => setGoal(saved.runtimeGoal ? String(saved.runtimeGoal) : ""), [saved.runtimeGoal]);
  const [dossier, setDossier] = useState({ pitch: saved.pitch, intention: saved.intention });
  useEffect(() => setDossier({ pitch: saved.pitch, intention: saved.intention }), [saved.pitch, saved.intention]);

  // Deux champs quittés coup sur coup : chaque enregistrement part de la
  // fiche la plus récente (pas de celle affichée au moment du clic) et ils
  // passent l'un après l'autre, sinon le second effacerait le premier.
  const latest = useRef<FilmDetails>(saved);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Enregistrements en attente : tant qu'il y en a, la réponse d'un
  // enregistrement plus ancien ne remplace pas les valeurs plus récentes.
  const pending = useRef(0);
  useEffect(() => {
    if (details && pending.current === 0) latest.current = details;
  }, [details]);

  function save(changes: Partial<FilmDetails>) {
    latest.current = { ...latest.current, ...changes };
    const next = latest.current;
    pending.current += 1;
    const run = queue.current.then(async () => {
      try {
        await onSave(next);
      } catch (e) {
        notifyError(errorText(e), "series:film");
      } finally {
        pending.current -= 1;
      }
    });
    queue.current = run;
  }

  function commitGoal(text = goal) {
    const value = text.trim() === "" ? null : Number.parseInt(text, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setGoal(saved.runtimeGoal ? String(saved.runtimeGoal) : "");
      return;
    }
    if ((value || null) !== latest.current.runtimeGoal) void save({ runtimeGoal: value || null });
  }

  const duration = (value: number) =>
    formatMinutes(value, {
      lessThanOne: t("duration.lessThanOne"),
      minutes: (n) => t("duration.minutes", { count: n }),
      hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
    });
  const percent = goalPercent(minutes, saved.runtimeGoal);
  // Les champs restent ouverts pendant un enregistrement : ils passent en file.
  const disabled = details === null;

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm" aria-labelledby="film-details-title">
      <div className="flex items-start gap-3">
        <Film className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 id="film-details-title" className="text-sm font-semibold">
            {t("film.details.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("film.details.description")}</p>
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("episode.logline")}</span>
        <textarea
          rows={2}
          value={logline}
          disabled={disabled}
          placeholder={t("film.details.loglinePlaceholder")}
          onChange={(e) => setLogline(e.target.value)}
          onBlur={() => logline !== latest.current.logline && void save({ logline })}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("episode.estimated")}</p>
          <p className="flex h-9 items-center text-lg font-semibold tabular-nums">
            {saved.runtimeGoal ? t("film.details.ofGoal", { duration: duration(minutes), goal: duration(saved.runtimeGoal) }) : duration(minutes)}
          </p>
          {percent !== null && <ProgressBar percent={percent} />}
        </div>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">{t("episode.runtimeGoal")}</span>
          <NumberStepper
            value={saved.runtimeGoal ?? null}
            min={0}
            step={5}
            allowEmpty
            disabled={disabled}
            placeholder={t("film.details.runtimeGoalPlaceholder")}
            aria-label={t("episode.runtimeGoal")}
            onChange={(value) => {
              const text = value === null ? "" : String(Math.round(value));
              setGoal(text);
              commitGoal(text);
            }}
            valueClassName="w-16"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">{t("episode.writer")}</span>
          <input
            value={writer}
            maxLength={300}
            disabled={disabled}
            placeholder={t("film.details.writerPlaceholder")}
            onChange={(e) => setWriter(e.target.value)}
            onBlur={() => writer.trim() !== latest.current.writer && void save({ writer })}
            onKeyDown={(e) => e.key === "Enter" && writer.trim() !== latest.current.writer && void save({ writer })}
            className={input}
          />
        </label>
      </div>

      {DOSSIER.map(({ key, rows }) => (
        <label key={key} className="block space-y-1.5">
          <span className="text-sm font-medium">{t(`dossier.fields.${key}`)}</span>
          <span className="block text-xs text-muted-foreground">{t(`dossier.hints.${key}`)}</span>
          <textarea
            rows={rows}
            value={dossier[key]}
            disabled={disabled}
            placeholder={t(`dossier.placeholders.${key}`)}
            onChange={(e) => setDossier((d) => ({ ...d, [key]: e.target.value }))}
            onBlur={() => dossier[key] !== latest.current[key] && void save({ [key]: dossier[key] })}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      ))}
    </section>
  );
}
