import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Lock, LockOpen, PenLine } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { ActionMenu } from "@/components/documents/ActionMenu";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { continuitySelect } from "@/components/structure/ContinuityControls";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import { lockNumbers, revisedBlocks, scenesOfCharacter } from "@/lib/filmTools";
import { notifyError } from "@/lib/notify";
import { renderScreenplay } from "@/lib/screenplayExport";
import { buildFountain, buildSeriesExport } from "@/lib/series";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { REVISION_COLORS, type FilmDetails, type Project, type RevisionColor, type SceneBlock } from "@/types";
import { useFilmScript } from "./useFilmScript";

/** Couleur d'écran de chaque révision de tournage. */
export const REVISION_SWATCH: Record<RevisionColor, string> = {
  white: "#ffffff",
  blue: "#9cc3f0",
  pink: "#f4a7c0",
  yellow: "#f5e17a",
  green: "#9fd8a6",
  goldenrod: "#e0b54a",
  buff: "#e9d5b0",
  salmon: "#f2a48a",
};

interface SeriesReadViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Lecture du scénario de série ou de film : toutes les scènes dans l'ordre
 * du plan, au format du scénario (en-tête, action, réplique centrée,
 * transition à droite), filtrables par saison ou par épisode (par acte ou
 * par séquence pour un film), ou par comédien (ses scènes seulement, pour
 * les auditions). Export Word, PDF, texte et Fountain de la sélection, au
 * format standard (Courier 12, pagination à 55 lignes, « (SUITE) »).
 *
 * Film : numéros de scène verrouillables pour le tournage, et révisions en
 * couleur ; ce qui a changé depuis le début de la révision est marqué d'un
 * astérisque, à l'écran comme à l'export.
 */
export function SeriesReadView({ project, feature, onOpenFeature }: SeriesReadViewProps) {
  const { t } = useTranslation("series");
  const script = useFilmScript(project);
  const {
    film,
    details,
    saveDetails,
    structure,
    labelOf,
    entries: allEntries,
    byScene,
    numbers,
    present,
    characters,
    headingOf,
    characterName,
    duration,
    layoutLabels,
    exportInput,
    error,
  } = script;
  // Sélection : « » (tout), ou l'identifiant d'une saison ou d'un épisode (d'un acte ou d'une séquence).
  const [filter, setFilter] = useState("");
  // Extraits d'un comédien : ses scènes seulement.
  const [actor, setActor] = useState("");

  const byPart = useMemo(() => (filter ? allEntries.filter((e) => e.episode?.id === filter || e.season?.id === filter) : allEntries), [allEntries, filter]);
  const entries = useMemo(() => (actor ? scenesOfCharacter(byPart, byScene, actor, present) : byPart), [byPart, actor, byScene, present]);

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
  const speakers = useMemo(() => {
    const ids = new Set<string>();
    for (const list of byScene.values()) for (const b of list) if (b.kind === "dialogue" && b.characterId) ids.add(b.characterId);
    for (const set of present.values()) for (const id of set) ids.add(id);
    return characters.filter((c) => ids.has(c.id));
  }, [byScene, present, characters]);

  const revision = details?.revision ?? null;
  const revisionLabel = revision
    ? t("revision.label", { color: t(`revision.colors.${revision.color}`), date: new Date(revision.since).toLocaleDateString() })
    : undefined;
  // Série : numéros dans tout le scénario (comme avant) ; film : numéros verrouillables.
  // Film : 1, 2, 12A… ; série : épisode.scène (2.5). Verrouillables pour le tournage.
  const exportOptions = { labels: numbers, revisionSince: revision?.since, header: revisionLabel, layout: layoutLabels };
  // Même estimation que le Suivi (une page de scénario par minute).
  const minutes = useMemo(() => entries.reduce((sum, e) => sum + (script.times.get(e.scene.id)?.minutes ?? 0), 0), [entries, script.times]);

  const selected = options.find((o) => o.id === filter);
  const actorName = actor ? characterName(actor) : "";
  const fileBase = [project.name, selected?.label, actor ? t("sides.file", { name: actorName }) : ""].filter(Boolean).join(" — ");

  async function update(changes: Partial<FilmDetails>) {
    if (!details) return;
    try {
      await saveDetails({ ...details, ...changes });
    } catch (e) {
      notifyError(errorText(e), "series:revision");
    }
  }
  const locked = Object.keys(details?.lockedNumbers ?? {}).length > 0;
  const nextColor = (): RevisionColor => {
    if (!revision) return "blue";
    const index = REVISION_COLORS.indexOf(revision.color);
    return REVISION_COLORS[(index + 1) % REVISION_COLORS.length];
  };

  let season: string | null | undefined;
  let episode: string | null | undefined;

  return (
    <PageShell
      title={feature.label}
      toolbar={
        <>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">{t("read.filter")}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={cn(continuitySelect, "w-56 text-foreground")}>
              <option value="">{film ? t("film.all") : t("read.all")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {"   ".repeat(o.depth)}
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">{t("sides.label")}</span>
            <select
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              aria-label={t("sides.label")}
              className={cn(continuitySelect, "w-56 text-foreground")}
            >
              <option value="">{t("sides.everyone")}</option>
              {speakers.map((c) => (
                <option key={c.id} value={c.id}>
                  {characterName(c.id)}
                </option>
              ))}
            </select>
          </label>
          {!script.loading && entries.length > 0 && (
            <p className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground" data-testid="runtime-estimate">
              {t("read.estimate", { duration: duration(minutes) })}
            </p>
          )}
          <div className={cn("flex shrink-0 items-center gap-2", (script.loading || entries.length === 0) && "ml-auto")}>
            {details && (
              <ActionMenu
                label={t("revision.menu")}
                className="h-8 w-auto gap-2 border px-3 text-sm text-foreground"
                trigger={
                  <>
                    {revision ? (
                      <span className="size-3 rounded-full border" style={{ backgroundColor: REVISION_SWATCH[revision.color] }} aria-hidden="true" />
                    ) : (
                      <PenLine className="size-4" />
                    )}
                    {revision ? t(`revision.colors.${revision.color}`) : t("revision.menu")}
                  </>
                }
                items={[
                  {
                    id: "next",
                    label: t("revision.start", { color: t(`revision.colors.${nextColor()}`) }),
                    icon: PenLine,
                    run: () => void update({ revision: { color: nextColor(), since: new Date().toISOString() } }),
                  },
                  ...(revision ? [{ id: "stop", label: t("revision.stop"), icon: PenLine, run: () => void update({ revision: null }) }] : []),
                  locked
                    ? { id: "unlock", label: t("revision.unlock"), icon: LockOpen, separated: true, run: () => void update({ lockedNumbers: {} }) }
                    : {
                        id: "lock",
                        label: t("revision.lock"),
                        icon: Lock,
                        separated: true,
                        run: () => void update({ lockedNumbers: lockNumbers(allEntries, {}, script.baseNumbers) }),
                      },
                ]}
              />
            )}
            <ExportMenu
              label={t("read.export")}
              dialogTitle={t("read.dialogTitle")}
              fileBase={fileBase}
              build={() => buildSeriesExport(exportInput(entries))}
              render={(format) => renderScreenplay(exportInput(entries), format, exportOptions)}
              fountain={{ label: t("read.fountain"), build: () => buildFountain({ ...exportInput(entries), numbers }) }}
              disabled={script.loading || entries.length === 0}
            />
          </div>
        </>
      }
    >
      <div className="space-y-6">
        {revision && (
          <p
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: `${REVISION_SWATCH[revision.color]}33` }}
            data-testid="revision-bar"
          >
            <span className="size-3 rounded-full border" style={{ backgroundColor: REVISION_SWATCH[revision.color] }} aria-hidden="true" />
            {revisionLabel} — {t("revision.hint")}
            {locked && (
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                <Lock className="size-3.5" />
                {t("revision.locked")}
              </span>
            )}
          </p>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t("read.failed")}
          </p>
        ) : !structure || script.loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoadingDots className="size-4" aria-hidden="true" />
            {t("read.loading")}
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {actor ? t("sides.none") : film ? t("film.empty") : t("read.empty")}
          </p>
        ) : (
          <article
            className="mx-auto max-w-3xl rounded-xl border bg-card px-6 py-10 font-mono text-sm leading-6 shadow-sm sm:px-14"
            data-testid="series-script"
          >
            {film && !filter && !actor && (
              <header className="mb-10 border-b pb-8 text-center font-sans" data-testid="film-title">
                <h2 className="text-2xl font-semibold">{project.name}</h2>
                {details?.writer.trim() && <p className="mt-2 text-sm text-muted-foreground">{t("film.writtenBy", { writer: details.writer.trim() })}</p>}
                {details?.logline.trim() && <p className="mx-auto mt-4 max-w-xl text-sm italic text-muted-foreground">{details.logline}</p>}
              </header>
            )}
            {actor && (
              <p className="mb-8 text-center font-sans text-sm text-muted-foreground">{t("sides.heading", { name: actorName, count: entries.length })}</p>
            )}
            {entries.map((entry) => {
              const parts = [];
              if ((entry.season?.id ?? null) !== season) {
                season = entry.season?.id ?? null;
                if (entry.season)
                  parts.push(
                    <h2
                      key={`s-${entry.season.id}`}
                      className={cn(
                        "mb-6 mt-10 text-center font-sans first:mt-0",
                        film ? "text-xs font-semibold uppercase tracking-widest text-muted-foreground" : "text-xl font-semibold",
                      )}
                    >
                      {labelOf(entry.season)}
                    </h2>,
                  );
              }
              if ((entry.episode?.id ?? null) !== episode) {
                episode = entry.episode?.id ?? null;
                if (entry.episode)
                  parts.push(
                    film ? (
                      // Film : la séquence ne s'imprime pas, elle aide seulement à se repérer.
                      <p key={`e-${entry.episode.id}`} className="mb-4 mt-6 font-sans text-xs text-muted-foreground first:mt-0">
                        {labelOf(entry.episode)}
                      </p>
                    ) : (
                      <header key={`e-${entry.episode.id}`} className="mb-6 mt-8 border-b pb-3 font-sans first:mt-0">
                        <h3 className="text-lg font-semibold">{labelOf(entry.episode)}</h3>
                        {entry.episode.logline.trim() && <p className="mt-1 text-sm italic text-muted-foreground">{entry.episode.logline}</p>}
                      </header>
                    ),
                  );
              }
              const list = byScene.get(entry.scene.id) ?? [];
              const revised = revisedBlocks(list, revision?.since);
              parts.push(
                <section key={entry.scene.id} className="group mb-6">
                  <h4 className="flex items-center gap-2 font-bold">
                    <span className="w-12 shrink-0 tabular-nums">{numbers.get(entry.scene.id)}</span>
                    <span className="min-w-0 flex-1">{headingOf(entry.scene)}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums">{numbers.get(entry.scene.id)}</span>
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
                    withContd(list).map(({ block, contd }) => (
                      <ScriptBlock
                        key={block.id}
                        block={block}
                        speaker={characterName(block.characterId).toUpperCase()}
                        contd={contd ? layoutLabels.contd : ""}
                        revised={revised.has(block.id)}
                        dim={!!actor && block.kind === "dialogue" && block.characterId !== actor}
                        highlight={!!actor && block.characterId === actor}
                      />
                    ))
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

/** Éléments d'une scène, avec « (SUITE) » quand un personnage reprend après une action. */
function withContd(blocks: SceneBlock[]): Array<{ block: SceneBlock; contd: boolean }> {
  let last: string | null = null;
  let interrupted = false;
  return blocks.map((block) => {
    if (block.kind === "note" || !block.content.trim()) return { block, contd: false };
    if (block.kind === "dialogue") {
      const contd = last !== null && last === block.characterId && interrupted;
      last = block.characterId;
      interrupted = false;
      return { block, contd };
    }
    if (block.kind === "transition") last = null;
    else interrupted = last !== null;
    return { block, contd: false };
  });
}

/** Un élément du scénario, mis en page comme sur la page imprimée. */
function ScriptBlock({
  block,
  speaker,
  contd,
  revised,
  dim,
  highlight,
}: {
  block: SceneBlock;
  speaker: string;
  contd: string;
  revised: boolean;
  dim: boolean;
  highlight: boolean;
}) {
  const content = block.content.trim();
  if (!content || block.kind === "note") return null;
  const mark = revised ? (
    <span className="absolute -right-6 top-0 font-bold text-primary" title="*" aria-label="révisé">
      *
    </span>
  ) : null;
  if (block.kind === "dialogue") {
    return (
      <div
        className={cn("relative mx-auto mt-3 max-w-[22rem]", dim && "opacity-50", highlight && "rounded bg-amber-100/60 px-2 dark:bg-amber-900/30")}
        data-revised={revised || undefined}
      >
        {mark}
        <p className="text-center font-bold">
          {speaker || "—"}
          {contd && ` ${contd}`}
        </p>
        {block.parenthetical.trim() && <p className="px-6 text-center italic">({block.parenthetical.trim().replace(/^\(|\)$/g, "")})</p>}
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    );
  }
  return (
    <p
      className={cn(
        "relative mt-3 whitespace-pre-wrap",
        block.kind === "transition" && "text-right font-bold uppercase",
        block.kind === "shot" && "font-bold uppercase",
      )}
      data-revised={revised || undefined}
    >
      {mark}
      {content}
    </p>
  );
}
