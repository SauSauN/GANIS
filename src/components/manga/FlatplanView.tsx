import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ListTree, Loader2, RotateCw, ScrollText } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { SCRIPT_STATUS_COLORS, scriptStatusOf } from "@/components/manga/MangaChapterCard";
import { PageLayoutCells } from "@/components/manga/PageLayoutPreview";
import { Thumbnail, useThumbnails, type ThumbnailLoader } from "@/components/manga/Thumbnail";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { documentKind, extensionOf, useDocumentsOf } from "@/lib/documents";
import { assignArt, foliosOf, isTurnMisplaced, pagesByVolume, pageStats, pageVolume, panelsByPage, spreadsOf, type FolioPage } from "@/lib/manga";
import { useLayoutPrefs, useReadingDirection, type ReadingDirection } from "@/lib/mangaLayouts";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useMangaSettings, useScriptPanels } from "@/stores/mangaStore";
import type { MangaSettings, Panel, Project, StructureDocument, StructureNode } from "@/types";

interface FlatplanViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const MAX_FIRST_FOLIO = 99;

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Préférence gardée pour cette séance seulement.
  }
}

const firstFolioKey = (groupId: string) => `ganis.flatplan.firstFolio.${groupId}`;

function storedFirstFolio(groupId: string): number {
  const value = Number.parseInt(recall(firstFolioKey(groupId)) ?? "", 10);
  return value >= 1 && value <= MAX_FIRST_FOLIO ? value : 1;
}

/**
 * Chemin de fer : toutes les pages d'un tome, en planches, dans le sens de
 * lecture. On y voit d'un coup d'œil ce qui est écrit, ce qui est dessiné,
 * où commencent les chapitres et si les révélations tombent bien après un
 * tourné de page.
 */
export function FlatplanView({ project, feature, onOpenFeature }: FlatplanViewProps) {
  const { t } = useTranslation("manga");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels, error } = useScriptPanels(project.id);
  const settings = useMangaSettings(project.id);
  const [volumeId, setVolumeId] = useState("");
  const direction = useReadingDirection(project.id);
  const setDirection = useLayoutPrefs((state) => state.setDirection);
  const [folioEdits, setFolioEdits] = useState<Record<string, number>>({});
  const loadThumbnail = useThumbnails(project.id);

  const levelCount = structure?.levels.length ?? 0;
  const groups = useMemo(() => (structure ? pagesByVolume(structure.nodes, levelCount) : []), [structure, levelCount]);
  const group = groups.find((g) => g.volume?.id === volumeId) ?? groups[0];
  const groupId = group?.volume?.id ?? project.id;
  const firstFolio = folioEdits[groupId] ?? storedFirstFolio(groupId);

  const allEntries = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const nodeIds = useMemo(() => [...new Set(allEntries.flatMap((e) => (e.chapter ? [e.page.id, e.chapter.id] : [e.page.id])))].sort(), [allEntries]);
  const documents = useDocumentsOf(project.id, nodeIds);
  const entries = group?.entries;
  const { art, unplaced } = useMemo(() => assignArt(entries ?? [], documents), [entries, documents]);

  const pages = useMemo(() => foliosOf(entries ?? [], firstFolio), [entries, firstFolio]);
  const spreads = useMemo(() => spreadsOf(pages), [pages]);
  const byPage = useMemo(() => panelsByPage(panels ?? []), [panels]);

  const alerts = pages.flatMap((page) => alertsOf(page, byPage.get(page.page.id) ?? [], settings).map((kind) => ({ page, kind })));
  const scripted = pages.filter((p) => byPage.has(p.page.id)).length;
  const drawn = pages.filter((p) => art.has(p.page.id)).length;

  const alertText = (kind: PageAlert, page: FolioPage) => {
    if (kind === "turn") return t("flatplan.alert.turn", { folio: page.folio, next: page.folio + 1 });
    const words = pageStats(byPage.get(page.page.id) ?? []).words;
    return t("flatplan.alert.volume", { folio: page.folio, words, max: settings?.pageWordsMax ?? 0 });
  };

  function changeFirstFolio(value: string) {
    const parsed = Math.min(MAX_FIRST_FOLIO, Math.max(1, Number.parseInt(value, 10) || 1));
    setFolioEdits({ ...folioEdits, [groupId]: parsed });
    remember(firstFolioKey(groupId), String(parsed));
  }

  const loading = !structure || (panels === null && !error);
  const control = cn(fieldClass, "h-8 w-auto");

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card/60 px-4 py-2">
        {groups.length > 1 && (
          <select aria-label={t("flatplan.volume")} value={group?.volume?.id ?? ""} onChange={(e) => setVolumeId(e.target.value)} className={cn(control, "max-w-72")}>
            {groups.map((g) => (
              <option key={g.volume?.id ?? ""} value={g.volume?.id ?? ""}>
                {g.volume ? labelOf(g.volume) : t("flatplan.noVolume")}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm">
          {t("flatplan.direction")}
          <select value={direction} onChange={(e) => setDirection(project.id, e.target.value as ReadingDirection)} className={control}>
            <option value="rtl">{t("flatplan.rtl")}</option>
            <option value="ltr">{t("flatplan.ltr")}</option>
          </select>
        </label>
        <span className="flex items-center gap-1.5 text-sm">
          <label className="flex items-center gap-2">
            {t("flatplan.firstFolio")}
            <input type="number" min={1} max={MAX_FIRST_FOLIO} value={firstFolio} onChange={(e) => changeFirstFolio(e.target.value)} className={cn(control, "w-16 text-right tabular-nums")} />
          </label>
          <InfoTip>{t("flatplan.firstFolioHint")}</InfoTip>
        </span>
        {!loading && pages.length > 0 && (
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {t("flatplan.summary", { pages: t("flatplan.pages", { count: pages.length }), scripted, drawn })}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {error ? (
          <p role="alert" className="px-6 py-20 text-center text-sm text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="flex items-center justify-center py-20 text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </p>
        ) : pages.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
            <ScrollText className="size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-4 font-medium">{t("read.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("read.emptyHint")}</p>
            <Button className="mt-5" variant="outline" onClick={() => onOpenFeature("structure.plan")}>
              <ListTree />
              {t("read.openPlan")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 px-6 py-6 pb-24">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="h-3.5 w-2.5 rounded-[2px] border border-dashed border-muted-foreground/50" aria-hidden="true" />
                {t("flatplan.legend.empty")}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3.5 w-2.5 rounded-[2px] border border-foreground/40 bg-card" aria-hidden="true" />
                {t("flatplan.legend.scripted")}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3.5 w-2.5 rounded-[2px] border-2 border-success bg-card" aria-hidden="true" />
                {t("flatplan.legend.drawn")}
              </li>
              <li className="flex items-center gap-1.5">
                <RotateCw className="size-3.5" aria-hidden="true" />
                {t("flatplan.legend.turn")}
              </li>
            </ul>

            <ol className={cn("flex flex-wrap gap-x-6 gap-y-5", direction === "rtl" && "flex-row-reverse")} aria-label={t("flatplan.spreads")}>
              {spreads.map((spread) => (
                <li key={(spread.first ?? spread.second)?.page.id} className={cn("flex gap-0.5", direction === "rtl" && "flex-row-reverse")}>
                  {[spread.first, spread.second].map((page, side) =>
                    page ? (
                      <PageCard
                        key={page.page.id}
                        projectId={project.id}
                        page={page}
                        chapterStart={pages[page.folio - firstFolio - 1]?.chapter?.id !== page.chapter?.id ? page.chapter : null}
                        chapterLabel={page.chapter ? labelOf(page.chapter) : ""}
                        label={labelOf(page.page)}
                        panels={byPage.get(page.page.id) ?? []}
                        art={art.get(page.page.id)}
                        alerts={alertsOf(page, byPage.get(page.page.id) ?? [], settings).map((kind) => alertText(kind, page))}
                        loadThumbnail={loadThumbnail}
                        onOpen={() => onOpenFeature(structureNodeTabId(page.page.id))}
                      />
                    ) : (
                      <div key={side} className="w-28" aria-hidden="true">
                        <div className="h-5" />
                        <div className="aspect-[5/7] rounded-sm bg-muted/30" />
                      </div>
                    ),
                  )}
                </li>
              ))}
            </ol>

            <section className="max-w-3xl space-y-2" aria-label={t("flatplan.alerts")}>
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {t("flatplan.noAlerts")}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border bg-card">
                  {alerts.map(({ page, kind }) => (
                    <li key={`${kind}-${page.page.id}`}>
                      <button type="button" onClick={() => onOpenFeature(structureNodeTabId(page.page.id))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50">
                        <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                        {alertText(kind, page)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {unplaced.length > 0 && <p className="text-sm text-muted-foreground">{t("flatplan.unplaced", { count: unplaced.length })}</p>}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

type PageAlert = "turn" | "volume";

function alertsOf(page: FolioPage, panels: Panel[], settings: MangaSettings | null): PageAlert[] {
  const alerts: PageAlert[] = [];
  if (isTurnMisplaced(page)) alerts.push("turn");
  if (pageVolume(pageStats(panels), settings) === "high") alerts.push("volume");
  return alerts;
}

interface PageCardProps {
  projectId: string;
  page: FolioPage;
  /** Chapitre qui commence à cette page. */
  chapterStart: StructureNode | null;
  chapterLabel: string;
  label: string;
  panels: Panel[];
  art: StructureDocument | undefined;
  alerts: string[];
  loadThumbnail: ThumbnailLoader;
  onOpen: () => void;
}

function PageCard({ projectId, page, chapterStart, chapterLabel, label, panels, art, alerts, loadThumbnail, onOpen }: PageCardProps) {
  const { t } = useTranslation("manga");
  const description = [
    t("flatplan.folio", { folio: page.folio }),
    chapterLabel,
    label,
    panels.length ? t("page.panels", { count: panels.length }) : t("flatplan.legend.empty"),
    art ? art.name : "",
    page.page.pageTurn ? t("export.pageTurn") : "",
    ...alerts,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-28 min-w-0">
      <div className="flex h-5 items-center gap-1 px-0.5 text-xs font-medium">
        {chapterStart && (
          <>
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SCRIPT_STATUS_COLORS[scriptStatusOf(chapterStart)] }} aria-hidden="true" />
            <span className="truncate" title={chapterLabel}>
              {chapterLabel}
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        title={description}
        aria-label={description}
        className={cn(
          "relative block aspect-[5/7] w-full overflow-hidden rounded-sm bg-card text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
          art ? "border-2 border-success" : panels.length ? "border border-foreground/40" : "border border-dashed border-muted-foreground/50",
        )}
      >
        {art && documentKind(art) === "image" ? (
          <Thumbnail document={art} load={loadThumbnail} alt="" />
        ) : art ? (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-muted-foreground">{extensionOf(art.name)}</span>
        ) : panels.length > 0 ? (
          <PageLayoutCells projectId={projectId} pageId={page.page.id} framings={panels.map((panel) => panel.framing)} compact />
        ) : null}
        <span className="absolute top-1 right-1 flex gap-0.5">
          {page.page.pageTurn && (
            <span className="rounded-sm bg-background/90 p-0.5">
              <RotateCw className="size-3.5" aria-hidden="true" />
            </span>
          )}
          {alerts.length > 0 && (
            <span className="rounded-sm bg-background/90 p-0.5 text-warning">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="absolute right-1 bottom-1 rounded-sm bg-background/90 px-1 text-xs font-medium tabular-nums">{page.folio}</span>
      </button>
    </div>
  );
}
