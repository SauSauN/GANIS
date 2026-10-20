import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, MessageSquareOff } from "lucide-react";
import { SCRIPT_STATUS_COLORS, scriptStatusOf } from "@/components/manga/MangaChapterCard";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { mangaLevels, pagesInOrder, pageStats, pageVolume, panelsByPage, panelVolume, textStats } from "@/lib/manga";
import { goalPercent } from "@/lib/novel";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useMangaSettings, useMangaStore, useScriptPanels } from "@/stores/mangaStore";
import { useStructureStore } from "@/stores/structureStore";
import { PANEL_TEXT_KINDS, SCRIPT_STATUSES, type Project, type ScriptStatus, type StructureNode } from "@/types";

interface ScriptProgressViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const KIND_COLORS: Record<string, string> = {
  dialogue: "#0ea5e9",
  thought: "#8b5cf6",
  narration: "#f59e0b",
  sfx: "#f43f5e",
  sign: "#10b981",
};

/**
 * Suivi du scénario : pages prévues et écrites par chapitre, cases par
 * page, statuts, volume de texte et alertes (indicatives) selon des seuils
 * réglables.
 */
export function ScriptProgressView({ project, feature, onOpenFeature }: ScriptProgressViewProps) {
  const { t } = useTranslation("manga");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels } = useScriptPanels(project.id);
  const settings = useMangaSettings(project.id);
  const saveSettings = useMangaStore((s) => s.saveSettings);
  const applyNode = useStructureStore((s) => s.applyNode);
  const [error, setError] = useState<string | null>(null);
  const [panelMax, setPanelMax] = useState("");
  const [pageMax, setPageMax] = useState("");

  useEffect(() => {
    setPanelMax(settings?.panelWordsMax ? String(settings.panelWordsMax) : "");
    setPageMax(settings?.pageWordsMax ? String(settings.pageWordsMax) : "");
  }, [settings]);

  const levelCount = structure?.levels.length ?? 0;
  const { chapter: chapterLevel } = mangaLevels(levelCount);
  const entries = useMemo(() => (structure ? pagesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const byPage = useMemo(() => panelsByPage(panels ?? []), [panels]);
  const chapterNodes = useMemo(() => (structure?.nodes ?? []).filter((n) => n.level === chapterLevel), [structure, chapterLevel]);
  const orderedChapters = useMemo(() => {
    const order = new Map<string, number>();
    entries.forEach((e, i) => e.chapter && !order.has(e.chapter.id) && order.set(e.chapter.id, i));
    return [...chapterNodes].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }, [chapterNodes, entries]);

  // Chiffres par chapitre et alertes.
  const rows = orderedChapters.map((chapter) => {
    const pages = entries.filter((e) => e.chapter?.id === chapter.id);
    const written = pages.filter((e) => (byPage.get(e.page.id)?.length ?? 0) > 0).length;
    const panelCount = pages.reduce((sum, e) => sum + (byPage.get(e.page.id)?.length ?? 0), 0);
    const words = pageStats(pages.flatMap((e) => byPage.get(e.page.id) ?? [])).words;
    return { chapter, pages: pages.length, written, panelCount, words };
  });
  const all = pageStats(panels ?? []);
  const writtenPages = entries.filter((e) => (byPage.get(e.page.id)?.length ?? 0) > 0).length;
  // Pages prévues : l'objectif du chapitre, sinon ses pages du découpage.
  const plannedPages = rows.reduce((sum, r) => sum + (r.chapter.pageGoal ?? r.pages), 0);
  const panelTotal = panels?.length ?? 0;

  const issues = entries.flatMap((entry) => {
    const list = byPage.get(entry.page.id) ?? [];
    const out: Array<{ key: string; pageId: string; label: string; kind: "page" | "panel" | "silent"; detail: string }> = [];
    const page = pageStats(list);
    const name = [entry.chapter ? labelOf(entry.chapter) : "", labelOf(entry.page)].filter(Boolean).join(" › ");
    if (pageVolume(page, settings) === "high") out.push({ key: `${entry.page.id}`, pageId: entry.page.id, label: name, kind: "page", detail: t("words", { count: page.words, value: page.words.toLocaleString() }) });
    list.forEach((panel, i) => {
      const stats = textStats(panel.texts);
      const volume = panelVolume(stats, settings);
      if (volume === "high") out.push({ key: panel.id, pageId: entry.page.id, label: `${name} · ${t("panel.title", { number: i + 1 })}`, kind: "panel", detail: t("words", { count: stats.words, value: stats.words.toLocaleString() }) });
      if (volume === "empty") out.push({ key: panel.id, pageId: entry.page.id, label: `${name} · ${t("panel.title", { number: i + 1 })}`, kind: "silent", detail: "" });
    });
    return out;
  });
  const count = (kind: "page" | "panel" | "silent") => issues.filter((i) => i.kind === kind).length;

  async function setStatus(chapter: StructureNode, status: ScriptStatus) {
    setError(null);
    try {
      applyNode(project.id, await api.setMangaChapter(project.id, chapter.id, { narrativeGoal: chapter.narrativeGoal, pageGoal: chapter.pageGoal, scriptStatus: status }));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function commitThresholds() {
    const parse = (v: string) => (v.trim() === "" ? null : Math.max(0, Number.parseInt(v, 10) || 0) || null);
    const next = { panelWordsMax: parse(panelMax), pageWordsMax: parse(pageMax) };
    if (next.panelWordsMax === settings?.panelWordsMax && next.pageWordsMax === settings?.pageWordsMax) return;
    setError(null);
    try {
      await saveSettings(project.id, next);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const percent = goalPercent(writtenPages, plannedPages || null);
  const numberInput = "h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";

  return (
    <PageShell title={feature.label}>
      <div className="space-y-6">
        {/* Totaux */}
        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm sm:grid-cols-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{t("progress.pages")}</p>
            <p className="text-3xl font-semibold tabular-nums">
              {writtenPages}
              {plannedPages ? <span className="text-lg font-normal text-muted-foreground"> / {plannedPages}</span> : null}
            </p>
            {percent !== null && <ProgressBar percent={percent} className="h-2 max-w-60" />}
            <p className="text-xs text-muted-foreground">
              {plannedPages ? t("progress.pagesWritten", { written: writtenPages, goal: plannedPages }) : t("progress.pagesCount", { written: writtenPages })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("progress.panels")}</p>
            <p className="text-3xl font-semibold tabular-nums">{panelTotal}</p>
            <p className="text-xs text-muted-foreground">{t("progress.perPage", { value: writtenPages ? (panelTotal / writtenPages).toFixed(1) : "0" })}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">{t("progress.words")}</p>
            <p className="text-3xl font-semibold tabular-nums">{all.words.toLocaleString()}</p>
            {all.words > 0 && (
              <>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t("progress.breakdown")}>
                  {PANEL_TEXT_KINDS.map((k) => (
                    <div key={k} style={{ width: `${(all.byKind[k] / all.words) * 100}%`, backgroundColor: KIND_COLORS[k] }} title={`${t(`kind.${k}`)} · ${all.byKind[k]}`} />
                  ))}
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {PANEL_TEXT_KINDS.filter((k) => all.byKind[k] > 0).map((k) => (
                    <span key={k} className="flex items-center gap-1 tabular-nums">
                      <span className="size-2 rounded-full" style={{ backgroundColor: KIND_COLORS[k] }} aria-hidden="true" />
                      {t(`kind.${k}`)} {Math.round((all.byKind[k] / all.words) * 100)} %
                    </span>
                  ))}
                </p>
              </>
            )}
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Chapitres */}
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("progress.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("progress.chapter")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("progress.pages")}</th>
                  <th className="w-32 px-3 py-2 font-medium" />
                  <th className="px-3 py-2 text-right font-medium">{t("progress.panels")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("progress.words")}</th>
                  <th className="px-3 py-2 font-medium">{t("progress.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ chapter, pages, written, panelCount, words }) => {
                  const p = goalPercent(written, chapter.pageGoal);
                  const status = scriptStatusOf(chapter);
                  return (
                    <tr key={chapter.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpenFeature(structureNodeTabId(chapter.id))}>
                          {labelOf(chapter)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {written}
                        <span className="text-muted-foreground"> / {chapter.pageGoal ?? pages}</span>
                      </td>
                      <td className="px-3 py-2">{p !== null && <ProgressBar percent={p} />}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {panelCount}
                        {written > 0 && <span className="text-xs text-muted-foreground"> ({(panelCount / written).toFixed(1)})</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{words.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SCRIPT_STATUS_COLORS[status] }} aria-hidden="true" />
                          <select
                            aria-label={t("progress.status")}
                            value={status}
                            onChange={(e) => void setStatus(chapter, e.target.value as ScriptStatus)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                          >
                            {SCRIPT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {t(`status.${s}`)}
                              </option>
                            ))}
                          </select>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Volume de texte */}
        <section className="rounded-xl border bg-card shadow-sm">
          <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-5 py-3">
            <h2 className="font-semibold">{t("progress.volume")}</h2>
            <label className="ml-auto flex items-center gap-2 text-sm">
              {t("progress.panelMax")}
              <input type="number" min={0} value={panelMax} placeholder={t("progress.none")} onChange={(e) => setPanelMax(e.target.value)} onBlur={() => void commitThresholds()} onKeyDown={(e) => e.key === "Enter" && void commitThresholds()} className={numberInput} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              {t("progress.pageMax")}
              <input type="number" min={0} value={pageMax} placeholder={t("progress.none")} onChange={(e) => setPageMax(e.target.value)} onBlur={() => void commitThresholds()} onKeyDown={(e) => e.key === "Enter" && void commitThresholds()} className={numberInput} />
            </label>
          </header>
          <div className="space-y-3 px-5 py-4">
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className={cn("flex items-center gap-1.5", count("page") > 0 && "text-warning")}>
                <AlertTriangle className="size-4" aria-hidden="true" />
                {t("progress.highPages", { count: count("page") })}
              </span>
              <span className={cn("flex items-center gap-1.5", count("panel") > 0 && "text-warning")}>
                <AlertTriangle className="size-4" aria-hidden="true" />
                {t("progress.highPanels", { count: count("panel") })}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MessageSquareOff className="size-4" aria-hidden="true" />
                {t("progress.silentPanels", { count: count("silent") })}
              </span>
            </p>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("progress.allGood")}
              </p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {issues.map((issue) => (
                  <li key={`${issue.kind}-${issue.key}`}>
                    <button type="button" onClick={() => onOpenFeature(structureNodeTabId(issue.pageId))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50">
                      {issue.kind === "silent" ? <MessageSquareOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />}
                      <span className="min-w-0 flex-1 truncate">{issue.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{issue.kind === "silent" ? t("panel.silent") : issue.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("progress.indicative")}</p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
