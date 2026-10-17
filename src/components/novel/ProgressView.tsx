import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { useManuscript } from "@/components/novel/useManuscript";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { chapterLevel, goalPercent, narrationReport, sceneLevel, STATUS_COLORS, statusOf } from "@/lib/novel";
import { buildStructureTree, structureNodeTabId, type StructureTreeNode } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectStructureLinks, useStructureStore } from "@/stores/structureStore";
import { WRITING_STATUSES, type NovelFields, type Project, type StructureNode, type WritingStatus } from "@/types";

interface ProgressViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const cellInput =
  "h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";

/**
 * Suivi de rédaction d'un roman : mots et objectifs (manuscrit, parties,
 * chapitres, scènes), états de rédaction des chapitres, et narration des
 * scènes avec les changements de personne ou de temps signalés.
 */
export function ProgressView({ project, feature, onOpenFeature }: ProgressViewProps) {
  const { t } = useTranslation("novel");
  const { structure, labelOf } = useProjectStructure(project.id);
  const label = useCallback((node: StructureNode) => labelOf(node), [labelOf]);
  const manuscript = useManuscript(project.id, label);
  const links = useProjectStructureLinks(project.id);
  const { characters } = useProjectCharacters(project.id);
  const applyNode = useStructureStore((s) => s.applyNode);
  const setManuscriptGoal = useStructureStore((s) => s.setManuscriptGoal);

  const [filter, setFilter] = useState<WritingStatus | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState("");

  const goal = structure?.manuscriptGoal ?? null;
  useEffect(() => setGoalDraft(goal ? String(goal) : ""), [goal]);

  const levelCount = structure?.levels.length ?? 0;
  const chapters = chapterLevel(levelCount);
  const scenes = sceneLevel(levelCount);
  const nodes = useMemo(() => structure?.nodes ?? [], [structure]);
  const tree = useMemo(() => buildStructureTree(nodes), [nodes]);

  const chapterNodes = nodes.filter((n) => n.level === chapters);
  const sceneNodes = useMemo(() => nodes.filter((n) => n.level >= scenes), [nodes, scenes]);
  const report = useMemo(() => narrationReport(sceneNodes), [sceneNodes]);
  const total = useMemo(() => nodes.reduce((sum, n) => sum + manuscript.ownWords(n), 0), [nodes, manuscript]);
  const percent = goalPercent(total, goal);

  const counts = useMemo(() => {
    const out = Object.fromEntries(WRITING_STATUSES.map((s) => [s, 0])) as Record<WritingStatus, number>;
    for (const node of chapterNodes) out[statusOf(node)]++;
    return out;
  }, [chapterNodes]);

  const povOf = (nodeId: string) => {
    const id = links?.characters.find((l) => l.nodeId === nodeId && l.role === "pov")?.characterId;
    const character = id ? characters.find((c) => c.id === id) : undefined;
    return character ? fullName(character) : null;
  };

  async function saveFields(node: StructureNode, changes: Partial<NovelFields>) {
    setError(null);
    try {
      const saved = await api.setStructureNodeNovel(project.id, node.id, {
        wordGoal: node.wordGoal,
        writingStatus: node.writingStatus,
        narrativePerson: node.narrativePerson,
        narrativeTense: node.narrativeTense,
        ...changes,
      });
      applyNode(project.id, saved);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function commitManuscriptGoal() {
    const value = goalDraft.trim() === "" ? null : Number.parseInt(goalDraft, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setGoalDraft(goal ? String(goal) : "");
    if ((value || null) === goal) return;
    try {
      await setManuscriptGoal(project.id, value || null);
    } catch (e) {
      setError(errorText(e));
    }
  }

  /** Un élément est montré si le filtre retient un chapitre en lui ou au-dessus. */
  const matches = useCallback(
    (node: StructureTreeNode): boolean => {
      if (filter === "all") return true;
      if (node.level === chapters) return statusOf(node) === filter;
      if (node.level < chapters) return node.children.some(matches);
      return true;
    },
    [filter, chapters],
  );

  if (!structure || !manuscript.ready) {
    return (
      <PageShell title={feature.label}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("text.loading")}
        </p>
      </PageShell>
    );
  }

  const rows: Array<{ node: StructureTreeNode; depth: number }> = [];
  const walk = (list: StructureTreeNode[], depth: number) => {
    for (const node of list) {
      if (!matches(node)) continue;
      rows.push({ node, depth });
      if (!collapsed.has(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const personLabel = report.person ? t(`personShort.${report.person}`) : "";
  const tenseLabel = report.tense ? t(`tense.${report.tense}`).toLowerCase() : "";
  const changes = new Set([...report.personChanges, ...report.tenseChanges]).size;

  return (
    <PageShell title={feature.label}>
      <div className="space-y-6">
        {/* Manuscrit et objectif */}
        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t("progress.manuscript")}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {total.toLocaleString()}
              {goal ? <span className="text-lg font-normal text-muted-foreground"> / {goal.toLocaleString()}</span> : null}
            </p>
            {percent !== null && goal ? (
              <div className="mt-3 max-w-xl space-y-1.5">
                <ProgressBar percent={percent} className="h-2" />
                <p className="text-sm text-muted-foreground tabular-nums">
                  {t("percent", { value: percent })} ·{" "}
                  {total >= goal ? t("progress.reached") : t("progress.remaining", { value: (goal - total).toLocaleString() })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("progress.noGoal")}</p>
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium md:items-end">
            {t("progress.goal")}
            <input
              type="number"
              min={0}
              step={1000}
              value={goalDraft}
              placeholder={t("progress.goalPlaceholder")}
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={() => void commitManuscriptGoal()}
              onKeyDown={(e) => e.key === "Enter" && void commitManuscriptGoal()}
              className="h-9 w-36 rounded-md border border-input bg-background px-3 text-right text-sm font-normal tabular-nums outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </section>

        {/* États des chapitres */}
        <section className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">{t("progress.filter")}</span>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={t("progress.all")} count={chapterNodes.length} />
          {WRITING_STATUSES.map((status) => (
            <FilterChip
              key={status}
              active={filter === status}
              onClick={() => setFilter(filter === status ? "all" : status)}
              label={t(`status.${status}`)}
              count={counts[status]}
              color={STATUS_COLORS[status]}
            />
          ))}
        </section>

        {/* Narration */}
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          {report.person || report.tense ? (
            <>
              {changes > 0 && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
              <span>
                {t("progress.narrationSummary", { person: personLabel || t("notSet"), tense: tenseLabel || t("notSet").toLowerCase() })}{" "}
                {changes > 0 && t("progress.changes", { count: changes })}
              </span>
            </>
          ) : (
            t("progress.narrationNone")
          )}
        </p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Tableau */}
        {chapterNodes.length === 0 && nodes.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("progress.noChapters")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("progress.element")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("progress.words")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("progress.goalColumn")}</th>
                  <th className="w-32 px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">{t("progress.statusColumn")}</th>
                  <th className="px-3 py-2 font-medium">{t("progress.narration")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, depth }) => {
                  const words = manuscript.totals.get(node.id) ?? 0;
                  const rowPercent = goalPercent(words, node.wordGoal);
                  const isChapter = node.level === chapters;
                  const isScene = node.level >= scenes && !node.children.length;
                  const pov = isScene ? povOf(node.id) : null;
                  return (
                    <tr key={node.id} className={cn("border-b last:border-0 hover:bg-muted/30", node.level < chapters && "bg-muted/20 font-medium")}>
                      <td className="px-4 py-1.5">
                        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.1}rem` }}>
                          {node.children.length > 0 ? (
                            <button type="button" onClick={() => toggle(node.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-expanded={!collapsed.has(node.id)}>
                              {collapsed.has(node.id) ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <button type="button" onClick={() => onOpenFeature(structureNodeTabId(node.id))} title={t("progress.open")} className="truncate text-left hover:text-primary hover:underline">
                            {labelOf(node)}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{words.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">
                        <GoalInput value={node.wordGoal} onCommit={(value) => void saveFields(node, { wordGoal: value })} label={`${t("progress.goalColumn")} — ${labelOf(node)}`} />
                      </td>
                      <td className="px-3 py-1.5">
                        {rowPercent !== null && (
                          <div className="flex items-center gap-2" title={rowPercent >= 100 ? t("progress.over") : t("progress.under")}>
                            <ProgressBar percent={rowPercent} />
                            <span className="w-12 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">{t("percent", { value: rowPercent })}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {isChapter && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[statusOf(node)] }} aria-hidden="true" />
                            <select
                              aria-label={`${t("progress.statusColumn")} — ${labelOf(node)}`}
                              value={statusOf(node)}
                              onChange={(e) => void saveFields(node, { writingStatus: e.target.value as WritingStatus })}
                              className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                              {WRITING_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {t(`status.${status}`)}
                                </option>
                              ))}
                            </select>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {isScene && (
                          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                            <span className="text-foreground">{pov ?? t("progress.povMissing")}</span>
                            {node.narrativePerson && (
                              <NarrationTag
                                text={t(`personShort.${node.narrativePerson}`)}
                                warning={report.personChanges.has(node.id) ? t("progress.personChange", { usual: personLabel }) : null}
                              />
                            )}
                            {node.narrativeTense && (
                              <NarrationTag
                                text={t(`tense.${node.narrativeTense}`)}
                                warning={report.tenseChanges.has(node.id) ? t("progress.tenseChange", { usual: tenseLabel }) : null}
                              />
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function FilterChip({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
        active && "border-foreground bg-foreground text-background hover:bg-foreground/90",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function NarrationTag({ text, warning }: { text: string; warning: string | null }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-px", warning && "border-warning/60 bg-warning/10 text-foreground")}
      title={warning ?? undefined}
    >
      {warning && <AlertTriangle className="size-3 text-warning" aria-hidden="true" />}
      {text}
    </span>
  );
}

/** Objectif modifiable dans une ligne du tableau (enregistré en quittant le champ). */
function GoalInput({ value, onCommit, label }: { value: number | null; onCommit: (value: number | null) => void; label: string }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => setDraft(value ? String(value) : ""), [value]);
  const commit = () => {
    const parsed = draft.trim() === "" ? null : Number.parseInt(draft, 10);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return setDraft(value ? String(value) : "");
    if ((parsed || null) !== value) onCommit(parsed || null);
  };
  return (
    <input
      type="number"
      min={0}
      step={100}
      aria-label={label}
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cellInput}
    />
  );
}
