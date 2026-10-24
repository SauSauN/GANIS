import { doubleClickHint } from "@/lib/doubleClick";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, FileText, ListTree, Loader2, PanelLeftClose, PanelLeftOpen, PenLine, RefreshCw, Waypoints } from "lucide-react";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { useManuscript } from "@/components/novel/useManuscript";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fullName } from "@/lib/characters";
import { mangaLevels } from "@/lib/manga";
import { readingMinutes, textToHtml } from "@/lib/novel";
import { htmlToBlocks, type ExportBlock, type ExportDocument } from "@/lib/novelExport";
import type { PlotEvent } from "@/lib/plot";
import { structureNodeTabId } from "@/lib/structure";
import { assembleStory, eventsByNode, unplacedEvents, type StoryEntry } from "@/lib/storyReading";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectPlot } from "@/stores/plotStore";
import type { Project, StructureNode } from "@/types";
import "@/components/novel/manuscript.css";

interface StoryReadViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const TOC_KEY = "ganis.story.toc";

type Heading = Extract<StoryEntry, { kind: "heading" }>;

/**
 * Lecture complète (film, série, jeu vidéo, JDR, projet libre) : toute
 * l'histoire d'un seul tenant, compilée dans l'ordre du découpage. Chaque
 * élément donne son titre, son résumé, son texte (fiche, sinon documents
 * texte) ou, s'il n'est pas encore écrit, ce qui s'y passe d'après la
 * trame. Rien n'est copié : déplacer une scène dans le plan la déplace ici.
 *
 * Ouverte par le bouton ▶ de la barre de titre (voir `readStory`).
 */
export function StoryReadView({ project, feature, onOpenFeature }: StoryReadViewProps) {
  const { t } = useTranslation("structure");
  const { structure, labelOf } = useProjectStructure(project.id);
  const label = useCallback((node: StructureNode) => labelOf(node), [labelOf]);
  const manuscript = useManuscript(project.id, label);
  const { data: plot } = useProjectPlot(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const username = useAuthStore((s) => s.user?.username ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState(() => {
    try {
      return localStorage.getItem(TOC_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const events = useMemo(() => eventsByNode(plot?.events ?? []), [plot]);
  // Manga : les pages se lisent comme les scènes d'un roman (ce qu'elles
  // montrent, sans titre ni détail de case) sous l'explication du chapitre.
  const sceneLevel = project.type === "manga" && structure ? mangaLevels(structure.levels.length).page : undefined;
  const entries = useMemo(
    () => (structure ? assembleStory(structure.nodes, manuscript.texts, events, label, { sceneLevel }) : []),
    [structure, manuscript.texts, events, label, sceneLevel],
  );
  const headings = entries.filter((e): e is Heading => e.kind === "heading");
  const words = entries.reduce((sum, e) => sum + (e.kind === "text" ? e.words : 0), 0);
  const unplaced = structure && plot ? unplacedEvents(plot.events, structure.nodes) : 0;

  const characterName = (id: string) => {
    const c = characters.find((x) => x.id === id);
    return c ? fullName(c) : "";
  };
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "") : "");

  /** Lieu et personnages d'un événement, sur une ligne. */
  const eventMeta = (event: PlotEvent) =>
    [locationName(event.locationId), event.characterIds.map(characterName).filter(Boolean).join(", ")].filter(Boolean).join(" · ");

  function toggleToc() {
    setToc(!toc);
    try {
      localStorage.setItem(TOC_KEY, toc ? "0" : "1");
    } catch {
      // Préférence gardée pour cette séance.
    }
  }

  function scrollTo(nodeId: string) {
    scrollRef.current?.querySelector(`[data-story="${CSS.escape(nodeId)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** Document exporté : titre, puis chaque élément du plan dans l'ordre. */
  function buildExport(): ExportDocument {
    const blocks: ExportBlock[] = [];
    for (const entry of entries) {
      if (entry.kind === "heading") {
        blocks.push({
          type: "heading",
          level: entry.depth === 0 ? 1 : entry.depth === 1 ? 2 : 3,
          text: entry.label,
          pageBreakBefore: entry.depth === 0 && blocks.length > 0,
        });
      } else if (entry.kind === "summary") {
        blocks.push({ type: "paragraph", runs: [{ text: entry.text, italics: true }] });
      } else if (entry.kind === "scene") {
        blocks.push(...htmlToBlocks(textToHtml(entry.text)));
      } else if (entry.kind === "text") {
        blocks.push(...htmlToBlocks(entry.html));
      } else {
        const meta = eventMeta(entry.event);
        blocks.push({ type: "paragraph", runs: [{ text: entry.event.title, bold: true }, ...(meta ? [{ text: ` — ${meta}` }] : [])] });
        if (entry.event.note.trim()) blocks.push(...htmlToBlocks(textToHtml(entry.event.note)));
      }
    }
    return { title: project.name, subtitle: username ? [username] : [], titlePage: true, blocks };
  }

  if (!structure || !manuscript.ready) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        {t("reading.loading")}
      </main>
    );
  }

  const empty = entries.length === 0;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>

      {/* Barre de lecture */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2">
        <Button variant="ghost" size="icon-sm" onClick={toggleToc} aria-label={t("reading.toc")} aria-expanded={toc} title={t("reading.toc")}>
          {toc ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums">
            {t("reading.summary", { count: headings.length })}
            {words > 0 && ` · ${t("reading.minutes", { minutes: readingMinutes(words) })}`}
          </p>
          {unplaced > 0 && <p className="text-xs text-muted-foreground">{t("reading.unplaced", { count: unplaced })}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {manuscript.loading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" />
              {t("reading.loadingDocuments")}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={manuscript.refresh} title={t("reading.refresh")}>
            <RefreshCw />
            {t("reading.refresh")}
          </Button>
          <ExportMenu label={t("reading.export")} dialogTitle={t("reading.dialogTitle")} fileBase={project.name} build={buildExport} disabled={empty} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sommaire */}
        {toc && headings.length > 0 && (
          <nav aria-label={t("reading.toc")} className="w-60 shrink-0 overflow-y-auto border-r bg-card/40 py-2">
            {headings.map((entry) => (
              <button
                key={entry.node.id}
                type="button"
                onClick={() => scrollTo(entry.node.id)}
                // Simple clic : aller au passage ; double-clic : ouvrir sa fiche.
                onDoubleClick={() => onOpenFeature(structureNodeTabId(entry.node.id))}
                title={doubleClickHint("openSheet")}
                className="flex w-full py-1.5 pr-3 text-left text-sm hover:bg-muted"
                style={{ paddingLeft: `${0.75 + entry.depth * 0.9}rem` }}
              >
                <span className={cn("truncate", entry.depth === 0 && "font-medium")}>{entry.label}</span>
              </button>
            ))}
          </nav>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
          {empty ? (
            <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
              <BookOpenText className="size-8 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-4 font-medium">{t("reading.empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("reading.emptyHint")}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => onOpenFeature("structure.plan")}>
                  <ListTree />
                  {t("reading.openPlan")}
                </Button>
                <Button variant="outline" onClick={() => onOpenFeature("plot.board")}>
                  <Waypoints />
                  {t("reading.openPlot")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-clip">
              <article className="manuscript mx-auto max-w-[42rem] px-8 py-12">
                <header className="mb-16 text-center">
                  <p className="manuscript-title">{project.name}</p>
                  {username && <p className="mt-2 text-sm text-muted-foreground">{username}</p>}
                </header>
                {entries.map((entry, index) => {
                  if (entry.kind === "heading") {
                    const previous = entries[index - 1];
                    return (
                      <h2
                        key={`h-${entry.node.id}`}
                        data-story={entry.node.id}
                        className={cn(
                          "manuscript-heading group relative scroll-mt-6",
                          `depth-${Math.min(entry.depth, 2)}`,
                          // Nouvelle partie après du contenu : séparation nette.
                          entry.depth < 2 && previous && previous.kind !== "heading" && "manuscript-new-section",
                        )}
                      >
                        {entry.label}
                        <button
                          type="button"
                          onClick={() => onOpenFeature(structureNodeTabId(entry.node.id))}
                          title={`${t("reading.edit")} — ${entry.label}`}
                          aria-label={`${t("reading.edit")} — ${entry.label}`}
                          className="absolute top-1/2 -right-8 -translate-y-1/2 rounded-md p-1 font-sans text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                        >
                          <PenLine className="size-3.5" />
                        </button>
                      </h2>
                    );
                  }
                  if (entry.kind === "summary") {
                    return (
                      <p key={`s-${entry.node.id}`} className="mb-6 text-center whitespace-pre-line text-muted-foreground italic">
                        {entry.text}
                      </p>
                    );
                  }
                  if (entry.kind === "scene") {
                    return (
                      <section key={`p-${entry.node.id}`} className={cn("group relative", entry.breakBefore && "mt-3")}>
                        <div className="manuscript-text" dangerouslySetInnerHTML={{ __html: textToHtml(entry.text) }} />
                        <button
                          type="button"
                          onClick={() => onOpenFeature(structureNodeTabId(entry.node.id))}
                          title={`${t("reading.edit")} — ${labelOf(entry.node)}`}
                          aria-label={`${t("reading.edit")} — ${labelOf(entry.node)}`}
                          className="absolute top-0 -right-9 rounded-md p-1 font-sans text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                        >
                          <PenLine className="size-3.5" />
                        </button>
                      </section>
                    );
                  }
                  if (entry.kind === "text") {
                    return (
                      <section key={`t-${entry.node.id}`} className="relative">
                        {/* Texte déjà nettoyé (fiche ou document) : rendu tel quel. */}
                        <div className="manuscript-text" dangerouslySetInnerHTML={{ __html: entry.html }} />
                        {entry.source === "documents" && (
                          <p className="mt-1 flex items-center justify-end gap-1 font-sans text-[0.65rem] text-muted-foreground">
                            <FileText className="size-3" aria-hidden="true" />
                            {t("reading.fromDocuments")}
                          </p>
                        )}
                      </section>
                    );
                  }
                  const meta = eventMeta(entry.event);
                  return (
                    <section key={`e-${entry.event.id}-${entry.node.id}`} className="mb-6">
                      <p className="font-semibold">
                        {entry.event.title}
                        {meta && <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{meta}</span>}
                      </p>
                      {entry.event.note.trim() && <div className="manuscript-text" dangerouslySetInnerHTML={{ __html: textToHtml(entry.event.note) }} />}
                    </section>
                  );
                })}
              </article>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
