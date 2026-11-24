import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { LoadingDots } from "@/components/common/LoadingDots";
import { NumberStepper } from "@/components/common/NumberStepper";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { CharactersEmptyState } from "@/components/characters/CharactersEmptyState";
import { usePlotLinks } from "@/components/plot/usePlotLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { cardClass, cardContentClass, cardHeaderClass, fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { ARC_MAX, ARC_MIN, ARC_TYPE_GROUPS, arcDeltas, arcSummary, newArcId, orderedBeats, type ArcBeat, type ArcType, type CharacterArcData } from "@/lib/arcs";
import { characterTabId, fullName } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { arcCharacterOf, useArcStore, useProjectArcs } from "@/stores/arcStore";
import { askConfirm } from "@/stores/confirmStore";

interface CharacterArcsViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Carte d'une étape, pour y revenir depuis un point de la courbe. */
const beatDomId = (id: string) => `arc-beat-${id}`;

/** Courbe de l'état intérieur, étape par étape (SVG à l'échelle -5 → +5). */
function ArcChart({
  beats,
  color,
  labels,
  selectedId,
  onSelect,
  mini = false,
}: {
  beats: ArcBeat[];
  color: string;
  labels?: string[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  mini?: boolean;
}) {
  const { t } = useTranslation("characters");
  const w = mini ? 200 : 760;
  const h = mini ? 44 : 250;
  const padL = mini ? 4 : 96;
  const padR = mini ? 4 : 20;
  const padT = mini ? 4 : 16;
  const padB = mini ? 4 : 34;
  const x = (i: number) => (beats.length <= 1 ? (padL + w - padR) / 2 : padL + (i / (beats.length - 1)) * (w - padL - padR));
  const y = (v: number) => padT + ((ARC_MAX - v) / (ARC_MAX - ARC_MIN)) * (h - padT - padB);
  const points = beats.map((beat, i) => [x(i), y(beat.value)] as const);
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${points[points.length - 1][0].toFixed(1)},${y(ARC_MIN)} L${points[0][0].toFixed(1)},${y(ARC_MIN)} Z` : "";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full overflow-visible" role={mini ? "img" : "group"} aria-label={t("arcs.chartLabel")}>
      {!mini &&
        [ARC_MIN, 0, ARC_MAX].map((v) => (
          <g key={v} aria-hidden="true">
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted-foreground)">
              {v === ARC_MAX ? t("arcs.truthPole") : v === ARC_MIN ? t("arcs.liePole") : "0"}
            </text>
          </g>
        ))}
      {points.length > 0 && (
        <g aria-hidden="true">
          <path d={area} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={mini ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
        </g>
      )}
      {!mini &&
        beats.map((beat, i) => {
          const on = beat.id === selectedId;
          const name = beat.step || t("arcs.untitledStep");
          const choose = () => onSelect?.(beat.id);
          return (
            <g key={beat.id}>
              {labels?.[i] && (
                <text x={x(i)} y={h - 10} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)" aria-hidden="true">
                  {labels[i].length > 14 ? `${labels[i].slice(0, 13)}…` : labels[i]}
                </text>
              )}
              {/* Chaque point se choisit à la souris et au clavier : il amène à son étape. */}
              <g
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={t("arcs.pointLabel", { number: i + 1, name, value: signed(beat.value) })}
                onClick={choose}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                  }
                }}
                className="group/point cursor-pointer outline-none"
              >
                <circle cx={points[i][0]} cy={points[i][1]} r={14} fill="transparent" />
                <circle cx={points[i][0]} cy={points[i][1]} r={11} fill="none" stroke="var(--ring)" strokeWidth={3} opacity={0} className="group-focus-visible/point:opacity-50" />
                <circle cx={points[i][0]} cy={points[i][1]} r={on ? 7 : 5} fill={on ? color : "var(--card)"} stroke={color} strokeWidth={2.5} />
                <title>{`${name} (${signed(beat.value)})`}</title>
              </g>
            </g>
          );
        })}
      {mini && points.length > 0 && <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={3} fill={color} />}
    </svg>
  );
}

/** Champ de texte avec son libellé au-dessus (et une aide facultative derrière un « i »). */
function TextField({ id, label, info, value, placeholder, maxLength, rows = 2, onChange }: { id: string; label: string; info?: ReactNode; value: string; placeholder: string; maxLength: number; rows?: number; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <textarea id={id} rows={rows} maxLength={maxLength} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, "resize-y py-2 leading-6 placeholder:text-muted-foreground")} />
    </div>
  );
}

/** Changement d'état depuis l'étape précédente : icône, texte et couleur (jamais la couleur seule). */
function DeltaBadge({ delta }: { delta: number }) {
  const { t } = useTranslation("characters");
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium tabular-nums",
        delta > 0 ? "bg-success/10 text-success" : delta < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
      title={t("arcs.deltaHint")}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {delta === 0 ? t("arcs.deltaSame") : signed(delta)}
      <span className="sr-only">{t("arcs.deltaHint")}</span>
    </span>
  );
}

/**
 * Arcs de personnage : pour chaque personnage, ce qu'il croit au départ et
 * ce qu'il comprend à la fin, son désir et son besoin, puis la courbe de
 * son état intérieur au fil du récit (une étape par chapitre ou scène,
 * avec le choix qui la provoque et sa conséquence).
 */
export function CharacterArcsView({ projectId, feature, onOpenFeature }: CharacterArcsViewProps) {
  const { t } = useTranslation("characters");
  const links = usePlotLinks(projectId);
  const { arcs, loaded, error } = useProjectArcs(projectId);
  const update = useArcStore((s) => s.update);
  // Le personnage se choisit dans la liste du panneau du milieu (voir `SideBarCharacters`).
  const characterId = useArcStore((s) => s.selectedCharacterId);
  const selectCharacter = useArcStore((s) => s.selectCharacter);
  const [selectedBeat, setSelectedBeat] = useState<string | null>(null);

  const characters = links.characters;
  const current = arcCharacterOf(characters, characterId);

  // Autre personnage : aucune étape choisie.
  useEffect(() => setSelectedBeat(null), [current?.id]);

  const arc: CharacterArcData | undefined = current ? arcs[current.id] : undefined;
  const beats = useMemo(() => (arc ? orderedBeats(arc, links.structureOrder) : []), [arc, links.structureOrder]);
  const deltas = arcDeltas(beats);
  const summary = arcSummary(beats);
  const color = "var(--primary)";

  const edit = (fn: (draft: CharacterArcData) => void) => current && update(projectId, current.id, fn);
  const editBeat = (id: string, fn: (beat: ArcBeat) => void) =>
    edit((draft) => {
      const beat = draft.beats.find((b) => b.id === id);
      if (beat) fn(beat);
    });

  /** Choisit une étape et l'amène à l'écran (clic sur un point de la courbe). */
  const showBeat = (id: string) => {
    setSelectedBeat(id);
    requestAnimationFrame(() => document.getElementById(beatDomId(id))?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const addBeat = () => {
    const id = newArcId();
    const last = beats[beats.length - 1];
    edit((draft) => {
      draft.beats.push({ id, nodeId: null, value: last?.value ?? 0, step: "", choice: "", consequence: "" });
    });
    showBeat(id);
  };

  /** Les arcs n'ont pas d'annulation : une étape déjà remplie se supprime après confirmation. */
  const deleteBeat = async (beat: ArcBeat) => {
    const filled = [beat.step, beat.choice, beat.consequence].some((text) => text.trim());
    if (filled) {
      const confirmed = await askConfirm({
        title: t("arcs.deleteBeatTitle"),
        description: t("arcs.deleteBeatText", { name: beat.step.trim() || t("arcs.untitledStep") }),
        confirmLabel: t("arcs.deleteBeatConfirm"),
      });
      if (!confirmed) return;
    }
    edit((draft) => void (draft.beats = draft.beats.filter((b) => b.id !== beat.id)));
  };

  if (!loaded || !links.ready) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <span className="inline-flex items-center gap-2" role="status">
            <LoadingDots className="size-4" />
            {t("arcs.loading")}
          </span>
        )}
      </main>
    );
  }

  if (!current) {
    return (
      // Même écran vide que la liste des personnages.
      <PageShell title={feature.label}>
        <CharactersEmptyState message={t("arcs.noCharacters")} onCreate={() => onOpenFeature("characters.create")} />
      </PageShell>
    );
  }

  const labels = beats.map((beat) => (beat.nodeId ? (links.nodeLabel(beat.nodeId) ?? "") : ""));
  const others = characters.filter((character) => character.id !== current.id && arcs[character.id]?.beats.length);

  return (
    <PageShell
      title={feature.label}
      toolbar={
        <>
          {/* Le personnage dont on écrit l'arc, et son type d'arc. */}
          <span className="flex min-w-0 items-center gap-2">
            <CharacterAvatar projectId={projectId} character={current} size="sm" />
            <span className="truncate text-sm font-semibold">{t("arcs.title", { name: fullName(current) })}</span>
          </span>
          <label className="sr-only" htmlFor="arc-type">
            {t("arcs.type")}
          </label>
          <select id="arc-type" value={arc?.type ?? "positive"} onChange={(e) => edit((draft) => void (draft.type = e.target.value as ArcType))} className={cn(fieldClass, "h-8 w-auto")} title={t("arcs.type")}>
            {/* Rangés par sens du changement : en mieux, sans changement, en pire. */}
            {ARC_TYPE_GROUPS.map((group) => (
              <optgroup key={group.id} label={t(`arcs.typeGroups.${group.id}`)}>
                {group.types.map((type) => (
                  <option key={type} value={type}>
                    {t(`arcs.types.${type}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="flex-1" />
          <Button variant="outline" onClick={() => onOpenFeature(characterTabId(current.id))}>
            <UserRound />
            {t("arcs.openSheet")}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Le cœur de l'arc : ce qui change en lui, et ce qui le pousse. */}
        <Card className={cardClass}>
          <CardHeader className={cardHeaderClass}>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold">{t("arcs.core")}</h2>
              <InfoTip>{t("arcs.coreHint")}</InfoTip>
            </div>
          </CardHeader>
          <CardContent className={cn(cardContentClass, "grid gap-x-8 gap-y-4 md:grid-cols-2")}>
            <div className="space-y-4">
              <TextField id="arc-lie" label={t("arcs.fields.lie")} value={arc?.lie ?? ""} placeholder={t("arcs.placeholders.lie")} maxLength={300} onChange={(value) => edit((draft) => void (draft.lie = value))} />
              <TextField id="arc-truth" label={t("arcs.fields.truth")} value={arc?.truth ?? ""} placeholder={t("arcs.placeholders.truth")} maxLength={300} onChange={(value) => edit((draft) => void (draft.truth = value))} />
            </div>
            <div className="space-y-4">
              <TextField id="arc-want" label={t("arcs.fields.want")} value={arc?.want ?? ""} placeholder={t("arcs.placeholders.want")} maxLength={300} onChange={(value) => edit((draft) => void (draft.want = value))} />
              <TextField id="arc-need" label={t("arcs.fields.need")} value={arc?.need ?? ""} placeholder={t("arcs.placeholders.need")} maxLength={300} onChange={(value) => edit((draft) => void (draft.need = value))} />
            </div>
          </CardContent>
        </Card>

        {/* Courbe de l'état intérieur */}
        <Card className={cardClass}>
          <CardHeader className={cn(cardHeaderClass, "flex flex-wrap items-center gap-x-4 gap-y-2")}>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold">{t("arcs.chart")}</h2>
              <InfoTip>{t("arcs.chartHint")}</InfoTip>
            </div>
            {summary && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground tabular-nums">{t("arcs.start", { value: signed(summary.first) })}</span>
                <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground tabular-nums">{t("arcs.end", { value: signed(summary.last) })}</span>
                {summary.worstDrop < 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive tabular-nums">
                    <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />
                    {t("arcs.worstDrop", { value: signed(summary.worstDrop) })}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className={cardContentClass}>
            {beats.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("arcs.noBeats")}</p>
            ) : (
              <div className="overflow-x-auto [scrollbar-gutter:stable]">
                <div className="min-w-[34rem] px-2 py-1">
                  <ArcChart beats={beats} color={color} labels={labels} selectedId={selectedBeat} onSelect={showBeat} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Étapes, dans l'ordre du récit, reliées comme une frise verticale. */}
        <section className="space-y-4" aria-labelledby="arc-beats-title">
          <div className="flex items-center gap-1.5">
            <h2 id="arc-beats-title" className="text-base font-semibold">
              {t("arcs.beats")}
            </h2>
            <InfoTip>{t("arcs.beatsHint")}</InfoTip>
          </div>

          {beats.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <TrendingUp className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground">{t("arcs.noBeats")}</p>
              <Button onClick={addBeat}>
                <Plus />
                {t("arcs.addBeat")}
              </Button>
            </div>
          ) : (
            <>
              <ol className="space-y-4">
                {beats.map((beat, index) => {
                  const delta = deltas[index];
                  const on = beat.id === selectedBeat;
                  const last = index === beats.length - 1;
                  return (
                    <li key={beat.id} id={beatDomId(beat.id)} className="relative flex scroll-mt-20 gap-4">
                      {/* Numéro de l'étape, à hauteur de l'en-tête de sa carte, et fil continu jusqu'à la suivante. */}
                      <div className="flex shrink-0 flex-col items-center" aria-hidden="true">
                        <span className="h-3.5 w-px" />
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        {!last && <span className="-mb-4 w-px flex-1 bg-border" />}
                      </div>

                      <article
                        onFocus={() => setSelectedBeat(beat.id)}
                        aria-label={t("arcs.stepNumber", { number: index + 1 })}
                        className={cn("min-w-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm transition-colors", on && "border-primary")}
                      >
                        {/* Une seule ligne : titre, chapitre ou scène, état intérieur (et son changement), suppression ; largeurs fixes pour que tout reste à la même place d'une étape à l'autre. */}
                        <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-3 transition-colors", on ? "bg-primary/5" : "bg-muted/40")}>
                          <Input
                            value={beat.step}
                            maxLength={300}
                            placeholder={t("arcs.placeholders.step")}
                            aria-label={t("arcs.step")}
                            onChange={(e) => editBeat(beat.id, (b) => void (b.step = e.target.value))}
                            className="min-w-48 flex-1 bg-card font-semibold dark:bg-card"
                          />
                          <select
                            value={beat.nodeId ?? ""}
                            aria-label={t("arcs.node")}
                            title={t("arcs.node")}
                            onChange={(e) => editBeat(beat.id, (b) => void (b.nodeId = e.target.value || null))}
                            className={cn(fieldClass, "h-9 w-56 shrink-0")}
                          >
                            <option value="">{t("arcs.noNode")}</option>
                            {links.nodes.map((node) => (
                              <option key={node.id} value={node.id}>
                                {`${"  ".repeat(node.depth)}${links.nodeLabel(node.id) ?? ""}`}
                              </option>
                            ))}
                          </select>
                          <span className="flex shrink-0 items-center gap-2">
                            <NumberStepper
                              value={beat.value}
                              min={ARC_MIN}
                              max={ARC_MAX}
                              format={signed}
                              aria-label={t("arcs.state")}
                              title={`${t("arcs.state")} : ${t("arcs.stateHint")}`}
                              onChange={(v) => v !== null && editBeat(beat.id, (b) => void (b.value = Math.round(v)))}
                              valueClassName="w-12"
                            />
                            {/* Place toujours réservée (même vide à la 1re étape) : les boutons restent alignés d'une étape à l'autre. */}
                            <span className="flex w-20 shrink-0 justify-center">{delta !== null && <DeltaBadge delta={delta} />}</span>
                          </span>
                          <Button variant="ghost" size="icon-lg" aria-label={t("arcs.deleteBeat")} title={t("arcs.deleteBeat")} onClick={() => void deleteBeat(beat)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 />
                          </Button>
                        </div>

                        {/* Contenu de l'étape : ce qu'il choisit, et ce que ça entraîne. */}
                        <div className="grid gap-4 p-4 md:grid-cols-2">
                          <TextField id={`arc-choice-${beat.id}`} label={t("arcs.choice")} value={beat.choice} placeholder={t("arcs.placeholders.choice")} maxLength={2000} rows={4} onChange={(value) => editBeat(beat.id, (b) => void (b.choice = value))} />
                          <TextField id={`arc-consequence-${beat.id}`} label={t("arcs.consequence")} value={beat.consequence} placeholder={t("arcs.placeholders.consequence")} maxLength={2000} rows={4} onChange={(value) => editBeat(beat.id, (b) => void (b.consequence = value))} />
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
              <div className="pl-12">
                <Button variant="outline" className="w-full" onClick={addBeat}>
                  <Plus />
                  {t("arcs.addBeat")}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* Comparer avec les arcs des autres personnages */}
        {others.length > 0 && (
          <section className="space-y-4" aria-labelledby="arc-compare-title">
            <h2 id="arc-compare-title" className="text-base font-semibold">
              {t("arcs.compare")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {others.map((character) => {
                const other = arcs[character.id];
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => selectCharacter(character.id)}
                    title={t("arcs.showArcOf", { name: fullName(character) })}
                    className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <CharacterAvatar projectId={projectId} character={character} size="sm" />
                      <span className="truncate">{fullName(character)}</span>
                    </span>
                    <ArcChart beats={orderedBeats(other, links.structureOrder)} color="var(--chart-3)" mini />
                    <span className="text-xs text-muted-foreground">{t(`arcs.types.${other.type}`)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
