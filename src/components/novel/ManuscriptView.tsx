import { doubleClickHint } from "@/lib/doubleClick";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, FileText, ListTree, Loader2, PanelLeftClose, PanelLeftOpen, PenLine, RefreshCw, FileUp } from "lucide-react";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { useManuscript } from "@/components/novel/useManuscript";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { goalPercent, readingMinutes, type ManuscriptEntry } from "@/lib/novel";
import { htmlToBlocks, type ExportBlock, type ExportDocument } from "@/lib/novelExport";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { Project, StructureNode } from "@/types";
import "@/components/novel/manuscript.css";

interface ManuscriptViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const TOC_KEY = "ganis.manuscript.toc";

/**
 * Manuscrit continu : le roman d'un seul tenant, assemblé dans l'ordre du
 * plan à partir du texte des scènes (fiche, sinon documents texte). Aucune
 * copie n'est gardée : déplacer une scène dans le plan la déplace ici.
 */
export function ManuscriptView({ project, feature, onOpenFeature }: ManuscriptViewProps) {
  const { t } = useTranslation("novel");
  const { structure, labelOf } = useProjectStructure(project.id);
  const username = useAuthStore((s) => s.user?.username ?? null);
  const label = useCallback((node: StructureNode) => labelOf(node), [labelOf]);
  const manuscript = useManuscript(project.id, label);
  const [toc, setToc] = useState(() => {
    try {
      return localStorage.getItem(TOC_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const total = useMemo(() => manuscript.entries.reduce((sum, e) => sum + (e.kind === "text" ? e.words : 0), 0), [manuscript.entries]);
  const goal = structure?.manuscriptGoal ?? null;
  const percent = goalPercent(total, goal);
  const headings = manuscript.entries.filter((e): e is Extract<ManuscriptEntry, { kind: "heading" }> => e.kind === "heading");

  function toggleToc() {
    setToc(!toc);
    try {
      localStorage.setItem(TOC_KEY, toc ? "0" : "1");
    } catch {
      // Préférence gardée pour cette séance.
    }
  }

  function scrollTo(nodeId: string) {
    scrollRef.current?.querySelector(`[data-manuscript="${CSS.escape(nodeId)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** Document exporté : page de titre, chapitres sur une nouvelle page. */
  function buildExport(): ExportDocument {
    const blocks: ExportBlock[] = [];
    let previousHeading = false;
    for (const entry of manuscript.entries) {
      if (entry.kind === "heading") {
        blocks.push({
          type: "heading",
          level: entry.depth === 0 ? 1 : entry.depth === 1 ? 2 : 3,
          text: entry.label,
          pageBreakBefore: !previousHeading && blocks.length > 0,
        });
        previousHeading = true;
      } else {
        if (entry.breakBefore) blocks.push({ type: "sceneBreak" });
        blocks.push(...htmlToBlocks(entry.html));
        previousHeading = false;
      }
    }
    const rounded = total < 1000 ? total : Math.round(total / 1000) * 1000;
    return {
      title: project.name,
      subtitle: [...(username ? [username] : []), t("manuscript.approxWords", { words: rounded.toLocaleString() })],
      titlePage: true,
      blocks,
    };
  }

  if (!structure || !manuscript.ready) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        {t("text.loading")}
      </main>
    );
  }

  const empty = !manuscript.entries.some((e) => e.kind === "text");

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>

      {/* Barre du manuscrit */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2">
        <Button variant="ghost" size="icon-sm" onClick={toggleToc} aria-label={t("manuscript.toc")} aria-expanded={toc} title={t("manuscript.toc")}>
          {toc ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums">
            {t("manuscript.summary", { words: t("words", { count: total }), minutes: readingMinutes(total) })}
          </p>
          {percent !== null && goal && (
            <div className="mt-1 flex items-center gap-2">
              <ProgressBar percent={percent} className="w-40" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("manuscript.goalLine", { percent: t("percent", { value: percent }), goal: goal.toLocaleString() })}
              </span>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {manuscript.loading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" />
              {t("manuscript.loadingDocuments")}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={manuscript.refresh} title={t("manuscript.refresh")}>
            <RefreshCw />
            {t("manuscript.refresh")}
          </Button>
          <ExportMenu label={t("manuscript.export")} dialogTitle={t("manuscript.dialogTitle")} fileBase={project.name} build={buildExport} disabled={empty} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sommaire */}
        {toc && headings.length > 0 && (
          <nav aria-label={t("manuscript.toc")} className="w-60 shrink-0 overflow-y-auto border-r bg-card/40 py-2">
            {headings.map((entry) => (
              <button
                key={entry.node.id}
                type="button"
                onClick={() => scrollTo(entry.node.id)}
                // Simple clic : aller au passage ; double-clic : ouvrir sa fiche.
                onDoubleClick={() => onOpenFeature(structureNodeTabId(entry.node.id))}
                title={doubleClickHint("openSheet")}
                className="flex w-full items-baseline justify-between gap-2 py-1.5 pr-3 text-left text-sm hover:bg-muted"
                style={{ paddingLeft: `${0.75 + entry.depth * 0.9}rem` }}
              >
                <span className={cn("truncate", entry.depth === 0 && "font-medium")}>{entry.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{(manuscript.totals.get(entry.node.id) ?? 0).toLocaleString()}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Texte */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
          {empty ? (
            <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
              <BookOpenText className="size-8 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-4 font-medium">{t("manuscript.empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("manuscript.emptyHint")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => onOpenFeature("structure.plan")}>
                  <ListTree />
                  {t("manuscript.openPlan")}
                </Button>
                <Button variant="outline" onClick={() => onOpenFeature("manuscript.import")}>
                  <FileUp />
                  {t("import.title")}
                </Button>
              </div>
            </div>
          ) : (
            // Rien ne doit dépasser en largeur (pas de défilement horizontal).
            <div className="overflow-x-clip">
              <article className="manuscript mx-auto max-w-[42rem] px-8 py-12">
                <header className="mb-16 text-center">
                  <p className="manuscript-title">{project.name}</p>
                  {username && <p className="mt-2 text-sm text-muted-foreground">{username}</p>}
                </header>
                {manuscript.entries.map((entry, index) =>
                  entry.kind === "heading" ? (
                    <h2
                      key={`h-${entry.node.id}`}
                      data-manuscript={entry.node.id}
                      className={cn(
                        "manuscript-heading scroll-mt-6",
                        `depth-${Math.min(entry.depth, 2)}`,
                        // Nouveau chapitre (ou partie) après du texte : séparation nette.
                        manuscript.entries[index - 1]?.kind === "text" && "manuscript-new-section",
                      )}
                    >
                      {entry.label}
                    </h2>
                  ) : (
                    <section key={`t-${entry.node.id}`} data-manuscript={entry.node.id} className="group relative scroll-mt-6">
                      {entry.breakBefore && (
                        <p className="manuscript-break" aria-hidden="true">
                          *&nbsp;&nbsp;*&nbsp;&nbsp;*
                        </p>
                      )}
                      {/* Texte déjà nettoyé (fiche ou document) : rendu tel quel. */}
                      <div className="manuscript-text" dangerouslySetInnerHTML={{ __html: entry.html }} />
                      <div className="pointer-events-none absolute top-0 right-0 flex -translate-y-[calc(100%+0.25rem)] flex-col items-end font-sans opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => onOpenFeature(structureNodeTabId(entry.node.id))}
                          title={`${t("manuscript.editScene")} — ${labelOf(entry.node)}`}
                          className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
                        >
                          {entry.source === "documents" ? <FileText className="size-3.5" /> : <PenLine className="size-3.5" />}
                          {labelOf(entry.node)}
                        </button>
                        {entry.source === "documents" && <p className="mt-1 max-w-56 text-right text-[0.65rem] leading-tight text-muted-foreground">{t("manuscript.fromDocuments")}</p>}
                      </div>
                    </section>
                  ),
                )}
              </article>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
