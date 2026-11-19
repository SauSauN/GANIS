import { useMemo, useState, type ReactNode } from "react";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookImage,
  Brush,
  CheckCircle2,
  FileText,
  Hash,
  ListTree,
  Loader2,
  RotateCw,
  ScrollText,
  X,
  type LucideIcon,
} from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { SCRIPT_STATUS_COLORS, scriptStatusOf } from "@/components/manga/MangaChapterCard";
import { PageLayoutCells } from "@/components/manga/PageLayoutPreview";
import { ExtraPageDialog, ExtrasManager, ScriptExportMenu, StageLegend, useExtraArtUrl, useExtraName, useScriptExportLabels } from "@/components/manga/ProductionParts";
import { Thumbnail, useThumbnails, type ThumbnailLoader } from "@/components/manga/Thumbnail";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { ActionMenu } from "@/components/documents/ActionMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { documentKind, extensionOf, useDocumentsOf } from "@/lib/documents";
import { fullName } from "@/lib/characters";
import {
  assignArt,
  buildScriptExport,
  extrasOfVolume,
  isExtraItem,
  isTurnMisplaced,
  itemId,
  MAX_FIRST_FOLIO,
  pagesByVolume,
  pageStats,
  pageVolume,
  panelsByPage,
  PRODUCTION_STAGE_COLORS,
  rememberFirstFolio,
  spreadsOf,
  storedFirstFolio,
  volumeSequence,
  type FlatplanItem,
  type FolioExtra,
  type FolioPage,
  type VolumeExtras,
} from "@/lib/manga";
import { useLayoutPrefs, useReadingDirection } from "@/lib/mangaLayouts";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useExtraPages, useMangaSettings, useScriptPanels } from "@/stores/mangaStore";
import type { MangaExtraPage, MangaSettings, Panel, ProductionStage, Project, StructureDocument, StructureNode } from "@/types";

interface FlatplanViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

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

/** Ce que montrent les pages : scénario et dessin, ou étape de fabrication. */
type FlatplanMode = "script" | "production";
const MODE_KEY = "ganis.flatplan.mode";

/**
 * Chemin de fer : toutes les pages d'un tome, en planches, dans le sens de
 * lecture. On y voit d'un coup d'œil ce qui est écrit, ce qui est dessiné,
 * où commencent les chapitres et si les révélations tombent bien après un
 * tourné de page.
 */
export function FlatplanView({ project, feature, onOpenFeature }: FlatplanViewProps) {
  const { t } = useTranslation(["manga", "common"]);
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels, error } = useScriptPanels(project.id);
  const settings = useMangaSettings(project.id);
  const [volumeId, setVolumeId] = useState("");
  const direction = useReadingDirection(project.id);
  const setDirection = useLayoutPrefs((state) => state.setDirection);
  const [folioEdits, setFolioEdits] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<FlatplanMode>(() => (recall(MODE_KEY) === "production" ? "production" : "script"));
  const [editingExtra, setEditingExtra] = useState<MangaExtraPage | null>(null);
  const [editingFolio, setEditingFolio] = useState(false);
  /** Panneau ouvert sous la barre : alertes ou pages hors récit. */
  const [panel, setPanel] = useState<"alerts" | "extras" | null>(null);
  const loadThumbnail = useThumbnails(project.id);
  const { extras } = useExtraPages(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const exportLabels = useScriptExportLabels();

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

  const volumeExtras = useMemo(() => extrasOfVolume(extras ?? [], group?.volume?.id ?? null), [extras, group]);
  const items = useMemo(() => volumeSequence(entries ?? [], volumeExtras, firstFolio), [entries, volumeExtras, firstFolio]);
  const pages = useMemo(() => items.filter((item): item is FolioPage => !isExtraItem(item)), [items]);
  const spreads = useMemo(() => spreadsOf(items), [items]);
  const byPage = useMemo(() => panelsByPage(panels ?? []), [panels]);

  const alerts = pages.flatMap((page) => alertsOf(page, byPage.get(page.page.id) ?? [], settings).map((kind) => ({ page, kind })));
  const scripted = pages.filter((p) => byPage.has(p.page.id)).length;
  // Dessins : pages du récit et pages hors récit qui en ont un.
  const drawn = pages.filter((p) => art.has(p.page.id)).length + items.filter((item) => isExtraItem(item) && item.extra.hasArt).length;

  const alertText = (kind: PageAlert, page: FolioPage) => {
    if (kind === "turn") return t("flatplan.alert.turn", { folio: page.folio, next: page.folio + 1 });
    const words = pageStats(byPage.get(page.page.id) ?? []).words;
    return t("flatplan.alert.volume", { folio: page.folio, words, max: settings?.pageWordsMax ?? 0 });
  };

  function changeFirstFolio(value: string) {
    const parsed = Math.min(MAX_FIRST_FOLIO, Math.max(1, Number.parseInt(value, 10) || 1));
    setFolioEdits({ ...folioEdits, [groupId]: parsed });
    rememberFirstFolio(groupId, parsed);
  }

  function changeMode(value: FlatplanMode) {
    setMode(value);
    remember(MODE_KEY, value);
  }

  /** Scénario du tome affiché, avec ses folios et ses pages hors récit. */
  const buildExport = () =>
    buildScriptExport({
      project,
      entries: entries ?? [],
      panels: byPage,
      labelOf,
      characters,
      locations,
      nameOf: (c) => fullName(c) || "—",
      includeCast: true,
      labels: exportLabels,
      volume: { items, extras: volumeExtras },
    });

  /** Chapitre qui commence à cette page : celui de la page du récit précédente est différent. */
  const chapterStartOf = (index: number): StructureNode | null => {
    const item = items[index];
    if (!item || isExtraItem(item)) return null;
    const previous = items.slice(0, index).reverse().find((other): other is FolioPage => !isExtraItem(other));
    return previous?.chapter?.id !== item.chapter?.id ? item.chapter : null;
  };
  const indexOf = new Map(items.map((item, index) => [itemId(item), index]));

  const loading = !structure || (panels === null && !error);
  const control = cn(fieldClass, "h-8 w-auto");
  const ready = !loading && items.length > 0;
  const extrasCount = volumeExtras.front.length + volumeExtras.back.length + (volumeExtras.cover ? 1 : 0) + (volumeExtras.backCover ? 1 : 0);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>
      {/* Barre d'outils : réglages à gauche, chiffres et actions à droite. */}
      {/* Même hauteur que la barre de « Lecture de l'histoire » (py-2, boutons de 32 px). */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2">
        {groups.length > 1 && (
          <select aria-label={t("flatplan.volume")} title={t("flatplan.volume")} value={group?.volume?.id ?? ""} onChange={(e) => setVolumeId(e.target.value)} className={cn(control, "max-w-56")}>
            {groups.map((g) => (
              <option key={g.volume?.id ?? ""} value={g.volume?.id ?? ""}>
                {g.volume ? labelOf(g.volume) : t("flatplan.noVolume")}
              </option>
            ))}
          </select>
        )}
        <Segmented
          label={t("flatplan.mode")}
          value={mode}
          onChange={changeMode}
          options={[
            // L'avancement est dans le bouton du mode : pas de compteurs en plus dans la barre.
            {
              value: "script",
              label: ready ? `${t("flatplan.modeScript")} — ${t("flatplan.stats.scripted", { count: scripted })} / ${pages.length}` : t("flatplan.modeScript"),
              icon: FileText,
              count: ready ? `${scripted}/${pages.length}` : undefined,
            },
            {
              value: "production",
              label: ready ? `${t("flatplan.modeProduction")} — ${t("flatplan.stats.drawn", { count: drawn })} / ${items.length}` : t("flatplan.modeProduction"),
              icon: Brush,
              count: ready ? `${drawn}/${items.length}` : undefined,
            },
          ]}
        />
        <InfoTip>{mode === "production" ? <StageLegend /> : <ScriptLegend />}</InfoTip>

        <div className="ml-auto flex items-center gap-1">
          {/* Ce qui sert de temps en temps : rangé dans « … ». */}
          <ActionMenu
            label={t("flatplan.more")}
            items={[
              {
                id: "alerts",
                label: t("flatplan.alerts"),
                icon: ready && alerts.length > 0 ? AlertTriangle : CheckCircle2,
                hint: ready && alerts.length > 0 ? String(alerts.length) : undefined,
                checked: panel === "alerts" ? true : undefined,
                disabled: loading,
                run: () => setPanel(panel === "alerts" ? null : "alerts"),
              },
              {
                id: "extras",
                label: t("flatplan.extras"),
                icon: BookImage,
                hint: extrasCount ? String(extrasCount) : undefined,
                checked: panel === "extras" ? true : undefined,
                disabled: loading,
                run: () => setPanel(panel === "extras" ? null : "extras"),
              },
              // Un seul interrupteur : activé = manga (droite à gauche), sinon BD.
              {
                id: "direction",
                label: t("flatplan.rtl"),
                icon: direction === "rtl" ? ArrowLeft : ArrowRight,
                separated: true,
                toggle: direction === "rtl",
                run: () => setDirection(project.id, direction === "rtl" ? "ltr" : "rtl"),
              },
              { id: "folio", label: t("flatplan.firstFolioMenu", { folio: firstFolio }), icon: Hash, separated: true, run: () => setEditingFolio(true) },
            ]}
          />
          <ScriptExportMenu compact fileBase={group?.volume ? `${project.name} — ${labelOf(group.volume)}` : project.name} build={buildExport} disabled={loading || pages.length === 0} />
        </div>
      </div>

      {/* Panneau sous la barre : les alertes, ou la gestion des pages hors récit. */}
      {panel && !loading && (
        <section className="max-h-[45vh] overflow-y-auto border-b bg-card px-4 py-3" aria-label={panel === "alerts" ? t("flatplan.alerts") : t("flatplan.extras")}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold">{panel === "alerts" ? t("flatplan.alerts") : t("flatplan.extras")}</h2>
            {panel === "extras" && <InfoTip>{t("flatplan.extrasHint")}</InfoTip>}
            <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setPanel(null)} aria-label={t("common:actions.close")} title={t("common:actions.close")}>
              <X />
            </Button>
          </div>
          {panel === "alerts" ? (
            <div className="max-w-3xl space-y-2">
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {t("flatplan.noAlerts")}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
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
            </div>
          ) : (
            <ExtrasManager projectId={project.id} volumeId={group?.volume?.id ?? null} extras={volumeExtras} />
          )}
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {error ? (
          <p role="alert" className="px-6 py-20 text-center text-sm text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="flex items-center justify-center py-20 text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </p>
        ) : items.length === 0 ? (
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
            <Covers projectId={project.id} extras={volumeExtras} mode={mode} onOpen={setEditingExtra} />

            <ol className={cn("flex flex-wrap gap-x-6 gap-y-5", direction === "rtl" && "flex-row-reverse")} aria-label={t("flatplan.spreads")}>
              {spreads.map((spread) => (
                <li key={itemId((spread.first ?? spread.second) as FlatplanItem)} className={cn("flex gap-0.5", direction === "rtl" && "flex-row-reverse")}>
                  {[spread.first, spread.second].map((page, side) =>
                    page && isExtraItem(page) ? (
                      <ExtraCard key={page.extra.id} projectId={project.id} item={page} mode={mode} onOpen={() => setEditingExtra(page.extra)} />
                    ) : page ? (
                      <PageCard
                        key={page.page.id}
                        projectId={project.id}
                        page={page}
                        mode={mode}
                        chapterStart={chapterStartOf(indexOf.get(page.page.id) ?? -1)}
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

          </div>
        )}
      </div>

      {editingFolio && (
        <FirstFolioDialog
          value={firstFolio}
          onSave={(value) => {
            changeFirstFolio(String(value));
            setEditingFolio(false);
          }}
          onClose={() => setEditingFolio(false)}
        />
      )}

      {editingExtra && (
        <ExtraPageDialog projectId={project.id} volumeId={group?.volume?.id ?? null} extra={editingExtra} volumeExtras={volumeExtras} onClose={() => setEditingExtra(null)} />
      )}
    </main>
  );
}

/** Bascule à icônes (sens de lecture, affichage) : une option à la fois. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  /** `count` : petit compteur affiché après l'icône (« 18/24 »). */
  options: Array<{ value: T; label: string; icon: LucideIcon; count?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} title={label} className={SEGMENTED_GROUP}>
      {options.map((option) => {
        const Icon = option.icon;
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              SEGMENTED_ITEM,
              checked && SEGMENTED_ON,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {option.count && <span className="text-xs tabular-nums" aria-hidden="true">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Numéro imprimé de la première page du tome (il décide des vis-à-vis). */
function FirstFolioDialog({ value, onSave, onClose }: { value: number; onSave: (value: number) => void; onClose: () => void }) {
  const { t } = useTranslation(["manga", "common"]);
  const [draft, setDraft] = useState(String(value));
  const parsed = Number.parseInt(draft, 10);
  const valid = parsed >= 1 && parsed <= MAX_FIRST_FOLIO;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} className="max-w-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave(parsed);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("flatplan.firstFolio")}</DialogTitle>
          <DialogDescription>{t("flatplan.firstFolioHint")}</DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min={1}
          max={MAX_FIRST_FOLIO}
          autoFocus
          placeholder={t("common:placeholders.startNumber")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t("flatplan.firstFolio")}
          className="mt-4 w-24 text-right tabular-nums"
        />
        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" disabled={!valid}>
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Légende du mode « Scénario et dessin ». */
function ScriptLegend() {
  const { t } = useTranslation("manga");
  return (
    <ul className="space-y-1.5">
      <li className="flex items-center gap-2">
        <span className="h-3.5 w-2.5 shrink-0 rounded-[2px] border border-dashed border-muted-foreground/60" aria-hidden="true" />
        {t("flatplan.legend.empty")}
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3.5 w-2.5 shrink-0 rounded-[2px] border border-foreground/40 bg-card" aria-hidden="true" />
        {t("flatplan.legend.scripted")}
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3.5 w-2.5 shrink-0 rounded-[2px] border-2 border-success bg-card" aria-hidden="true" />
        {t("flatplan.legend.drawn")}
      </li>
      <li className="flex items-center gap-2">
        <RotateCw className="size-3.5 shrink-0" aria-hidden="true" />
        {t("flatplan.legend.turn")}
      </li>
    </ul>
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
  mode: FlatplanMode;
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

function PageCard({ projectId, page, mode, chapterStart, chapterLabel, label, panels, art, alerts, loadThumbnail, onOpen }: PageCardProps) {
  const { t } = useTranslation("manga");
  const stage = page.page.productionStage;
  const description = [
    t("flatplan.folio", { folio: page.folio }),
    chapterLabel,
    label,
    panels.length ? t("page.panels", { count: panels.length }) : t("flatplan.legend.empty"),
    art ? art.name : "",
    page.page.pageTurn ? t("export.pageTurn") : "",
    t(`production.stages.${stage ?? "none"}`),
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
          mode === "production"
            ? "border-2"
            : art
              ? "border-2 border-success"
              : panels.length
                ? "border border-foreground/40"
                : "border border-dashed border-muted-foreground/50",
        )}
        style={mode === "production" ? { borderColor: PRODUCTION_STAGE_COLORS[stage ?? "none"] } : undefined}
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
        {mode === "production" && <StageBand stage={stage} />}
        <span className="absolute right-1 bottom-1 rounded-sm bg-background/90 px-1 text-xs font-medium tabular-nums">{page.folio}</span>
      </button>
    </div>
  );
}

/** Bandeau de l'étape de fabrication, en bas à gauche d'une page. */
function StageBand({ stage }: { stage: ProductionStage | null }) {
  const { t } = useTranslation("manga");
  return (
    <span
      className="absolute bottom-1 left-1 max-w-[calc(100%-2.5rem)] truncate rounded-sm px-1 text-[0.65rem] leading-4 font-medium text-white"
      style={{ backgroundColor: PRODUCTION_STAGE_COLORS[stage ?? "none"] }}
    >
      {t(`production.stages.${stage ?? "none"}`)}
    </span>
  );
}

/** Page hors récit dans une planche (page de titre, bonus…) ; un clic la modifie. */
function ExtraCard({ projectId, item, mode, onOpen }: { projectId: string; item: FolioExtra; mode: FlatplanMode; onOpen: () => void }) {
  const { t } = useTranslation("manga");
  const { extra } = item;
  const kind = t(`extras.kinds.${extra.kind}`);
  const description = [t("flatplan.folio", { folio: item.folio }), kind, extra.title, t(`production.stages.${extra.productionStage ?? "none"}`)].filter(Boolean).join(" · ");
  return (
    <div className="w-28 min-w-0">
      <div className="flex h-5 items-center px-0.5 text-xs text-muted-foreground">
        <span className="truncate">{kind}</span>
      </div>
      <ExtraFace projectId={projectId} extra={extra} mode={mode} label={extra.title.trim()} description={description} onOpen={onOpen}>
        <span className="absolute right-1 bottom-1 rounded-sm bg-background/90 px-1 text-xs font-medium tabular-nums">{item.folio}</span>
      </ExtraFace>
    </div>
  );
}

/** Face d'une page hors récit : fond hachuré, son nom au centre. */
function ExtraFace({
  projectId,
  extra,
  mode,
  label,
  description,
  onOpen,
  children,
}: {
  projectId: string;
  extra: MangaExtraPage;
  mode: FlatplanMode;
  label: string;
  description: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const art = useExtraArtUrl(projectId, extra);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={description}
      aria-label={description}
      className={cn(
        "relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-sm bg-muted/50 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-border)_6px_7px)] px-2 text-center outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        mode === "production" ? "border-2" : "border border-foreground/30",
      )}
      style={mode === "production" ? { borderColor: PRODUCTION_STAGE_COLORS[extra.productionStage ?? "none"] } : undefined}
    >
      {art ? (
        // Le dessin de la page remplace le fond hachuré.
        <img src={art} alt="" className="absolute inset-0 size-full bg-white object-contain" />
      ) : (
        // Le nom de la sorte est déjà au-dessus de la page : au centre, son
        // titre s'il en a un, sinon une simple icône.
        label ? (
          <span className="line-clamp-4 rounded-sm bg-background/85 px-1 text-xs font-medium">{label}</span>
        ) : (
          <BookImage className="size-5 text-muted-foreground" aria-hidden="true" />
        )
      )}
      {mode === "production" && <StageBand stage={extra.productionStage} />}
      {children}
    </button>
  );
}

/** Couverture et quatrième de couverture du tome, hors des planches (sans folio). */
function Covers({ projectId, extras, mode, onOpen }: { projectId: string; extras: VolumeExtras; mode: FlatplanMode; onOpen: (extra: MangaExtraPage) => void }) {
  const { t } = useTranslation("manga");
  const nameOf = useExtraName();
  const covers = [
    { key: "cover", title: t("flatplan.cover"), extra: extras.cover },
    { key: "backCover", title: t("flatplan.backCover"), extra: extras.backCover },
  ].filter((cover): cover is { key: string; title: string; extra: MangaExtraPage } => cover.extra !== null);
  if (!covers.length) return null;
  return (
    <ul className="flex flex-wrap gap-4" aria-label={t("flatplan.covers")}>
      {covers.map(({ key, title, extra }) => (
        <li key={key} className="w-28 min-w-0">
          <div className="flex h-5 items-center px-0.5 text-xs font-medium">
            <span className="truncate">{title}</span>
          </div>
          <ExtraFace projectId={projectId} extra={extra} mode={mode} label={nameOf(extra)} description={[title, extra.title, t(`production.stages.${extra.productionStage ?? "none"}`)].filter(Boolean).join(" · ")} onOpen={() => onOpen(extra)} />
        </li>
      ))}
    </ul>
  );
}
