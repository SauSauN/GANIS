import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListTree, Loader2, ScrollText } from "lucide-react";
import { SelectionBar, SelectionCheckbox } from "@/components/common/SelectionBar";
import { StageLegend, StageSelect, useExtraName } from "@/components/manga/ProductionParts";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import {
  extrasOfVolume,
  isExtraItem,
  pagesByVolume,
  PRODUCTION_STAGE_COLORS,
  PRODUCTION_STAGES,
  productionPercent,
  stageCounts,
  storedFirstFolio,
  volumeSequence,
  type FlatplanItem,
} from "@/lib/manga";
import { structureNodeTabId } from "@/lib/structure";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { useExtraPages, useMangaStore } from "@/stores/mangaStore";
import type { MangaExtraPage, ProductionStage, Project, StructureNode } from "@/types";

interface ProductionViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Une ligne du suivi : une page du récit, une page hors récit ou une couverture. */
interface Row {
  id: string;
  folio: number | null;
  name: string;
  stage: ProductionStage | null;
  /** Page du récit (sinon : page hors récit). */
  page: StructureNode | null;
  extra: MangaExtraPage | null;
}

interface Section {
  key: string;
  title: string;
  rows: Row[];
}

/**
 * Suivi de fabrication : l'étape de chaque page d'un tome (storyboard,
 * crayonné, encrage, trames, lettrage, validée), pages hors récit
 * comprises. Une page à la fois, ou toute une sélection d'un coup.
 */
export function ProductionView({ project, feature, onOpenFeature }: ProductionViewProps) {
  const { t } = useTranslation(["manga", "common"]);
  const { structure, labelOf } = useProjectStructure(project.id);
  const { extras, error: extrasError } = useExtraPages(project.id);
  const setStage = useMangaStore((s) => s.setStage);
  const extraName = useExtraName();
  const [volumeId, setVolumeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levelCount = structure?.levels.length ?? 0;
  const groups = useMemo(() => (structure ? pagesByVolume(structure.nodes, levelCount) : []), [structure, levelCount]);
  const group = groups.find((g) => g.volume?.id === volumeId) ?? groups[0];
  const groupVolumeId = group?.volume?.id ?? null;
  const volumeExtras = useMemo(() => extrasOfVolume(extras ?? [], groupVolumeId), [extras, groupVolumeId]);
  const firstFolio = storedFirstFolio(groupVolumeId ?? project.id);
  const items = useMemo(() => volumeSequence(group?.entries ?? [], volumeExtras, firstFolio), [group, volumeExtras, firstFolio]);

  const sections = useMemo<Section[]>(() => {
    const rowOf = (item: FlatplanItem): Row =>
      isExtraItem(item)
        ? { id: item.extra.id, folio: item.folio, name: extraName(item.extra), stage: item.extra.productionStage, page: null, extra: item.extra }
        : { id: item.page.id, folio: item.folio, name: labelOf(item.page), stage: item.page.productionStage, page: item.page, extra: null };
    const coverRow = (extra: MangaExtraPage): Row => ({ id: extra.id, folio: null, name: extraName(extra), stage: extra.productionStage, page: null, extra });

    const out: Section[] = [];
    const covers = [volumeExtras.cover, volumeExtras.backCover].filter((extra): extra is MangaExtraPage => extra !== null);
    if (covers.length) out.push({ key: "covers", title: t("production.covers"), rows: covers.map(coverRow) });
    const front = items.filter((item) => isExtraItem(item) && item.extra.placement === "front");
    if (front.length) out.push({ key: "front", title: t("production.front"), rows: front.map(rowOf) });
    for (const item of items) {
      if (isExtraItem(item)) continue;
      const key = item.chapter?.id ?? "none";
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(rowOf(item));
      else out.push({ key, title: item.chapter ? labelOf(item.chapter) : t("production.noChapter"), rows: [rowOf(item)] });
    }
    const back = items.filter((item) => isExtraItem(item) && item.extra.placement === "back");
    if (back.length) out.push({ key: "back", title: t("production.back"), rows: back.map(rowOf) });
    return out;
  }, [items, volumeExtras, labelOf, extraName, t]);

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useSelection(ids);
  const stages = rows.map((row) => row.stage);
  const counts = stageCounts(stages);

  async function apply(targets: Row[], stage: ProductionStage | null) {
    setBusy(true);
    setError(null);
    try {
      await setStage(
        project.id,
        targets.filter((row) => row.page).map((row) => row.id),
        targets.filter((row) => row.extra).map((row) => row.id),
        stage,
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const volumeSelect =
    groups.length > 1 ? (
      <select aria-label={t("flatplan.volume")} value={groupVolumeId ?? ""} onChange={(e) => setVolumeId(e.target.value)} className={cn(fieldClass, "h-9 max-w-72")}>
        {groups.map((g) => (
          <option key={g.volume?.id ?? ""} value={g.volume?.id ?? ""}>
            {g.volume ? labelOf(g.volume) : t("flatplan.noVolume")}
          </option>
        ))}
      </select>
    ) : undefined;

  if (!structure || (extras === null && !extrasError)) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </main>
    );
  }

  return (
    <PageShell title={feature.label} info={t("production.info")} actions={volumeSelect}>
      {(error || extrasError) && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error ?? extrasError}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
          <ScrollText className="size-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-4 font-medium">{t("read.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("read.emptyHint")}</p>
          <Button className="mt-5" variant="outline" onClick={() => onOpenFeature("structure.plan")}>
            <ListTree />
            {t("read.openPlan")}
          </Button>
        </div>
      ) : (
        <>
          <section className="mb-6 space-y-2" aria-label={t("production.percent", { percent: productionPercent(stages) })}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{t("production.percent", { percent: productionPercent(stages) })}</span>
              <span className="text-muted-foreground tabular-nums">{t("production.summary", { done: counts.done, total: rows.length })}</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {(["done", ...[...PRODUCTION_STAGES].reverse().slice(1), "none"] as const).map((stage) =>
                counts[stage] ? (
                  <span key={stage} style={{ width: `${(counts[stage] / rows.length) * 100}%`, backgroundColor: PRODUCTION_STAGE_COLORS[stage] }} />
                ) : null,
              )}
            </div>
            <StageLegend counts={counts} />
          </section>

          <SelectionBar selection={selection} disabled={busy} className="sticky top-0 z-10 mb-4">
            <StageSelect
              value={null}
              label={t("production.setSelected")}
              disabled={busy}
              className="w-48"
              onChange={(stage) => void apply(rows.filter((row) => selection.isSelected(row.id)), stage)}
            />
          </SelectionBar>

          <div className="space-y-6">
            {sections.map((section) => {
              const sectionStages = section.rows.map((row) => row.stage);
              return (
                <section key={section.key}>
                  <h2 className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold">
                    <span className="truncate">{section.title}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{t("production.percent", { percent: productionPercent(sectionStages) })}</span>
                  </h2>
                  <ul className="divide-y rounded-lg border bg-card">
                    {section.rows.map((row) => (
                      <li key={row.id} className={cn("flex items-center gap-3 px-3 py-1.5", selection.isSelected(row.id) && "bg-accent/60")}>
                        <SelectionCheckbox selection={selection} id={row.id} label={t("production.select", { name: row.name })} disabled={busy} />
                        <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {row.folio === null ? t("production.noFolio") : t("production.folio", { folio: row.folio })}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenFeature(row.page ? structureNodeTabId(row.page.id) : "script.flatplan")}
                          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                          title={row.extra?.notes || row.name}
                        >
                          {row.name}
                          {row.extra && row.extra.title && <span className="ml-2 text-xs text-muted-foreground">{t(`extras.kinds.${row.extra.kind}`)}</span>}
                        </button>
                        <StageSelect
                          value={row.stage}
                          label={t("production.stageOf", { name: row.name })}
                          disabled={busy}
                          className="w-36 shrink-0 sm:w-44"
                          onChange={(stage) => void apply([row], stage)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}
