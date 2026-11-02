import { useTranslation } from "react-i18next";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { layoutsFor, layoutVariant, panelRects, useLayoutPrefs, useReadingDirection } from "@/lib/mangaLayouts";
import type { Panel } from "@/types";

/** Les cases d'un modèle, numérotées. Remplit son parent, positionné. */
export function PageLayoutCells({
  projectId,
  pageId,
  framings,
  compact = false,
}: {
  projectId: string;
  pageId: string;
  /** Cadrage de chaque case, dans l'ordre : leur nombre choisit le modèle. */
  framings: Array<Panel["framing"]>;
  /** Vignette : les numéros seulement. */
  compact?: boolean;
}) {
  const { t } = useTranslation("manga");
  const direction = useReadingDirection(projectId);
  const variants = useLayoutPrefs((state) => state.variants);
  const layouts = layoutsFor(framings.length);
  const layout = layouts[layoutVariant(variants, pageId, layouts.length)];
  if (!layout) return null;

  return (
    <div className="absolute inset-0 bg-white text-neutral-700" aria-hidden="true">
      {panelRects(layout, direction).map((rect, index) => {
        const framing = framings[index];
        return (
          <div
            key={index}
            className="absolute flex flex-col items-center justify-center overflow-hidden border border-neutral-800 text-center leading-tight"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
          >
            <span className={compact ? "text-[0.6rem]" : "text-sm font-semibold"}>{index + 1}</span>
            {!compact && framing && <span className="line-clamp-2 px-0.5 text-[0.65rem]">{t(`framing.${framing}`)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Modèle de page sur la fiche d'une page sans dessin : il suit le nombre de
 * cases, et un bouton passe aux autres modèles de ce nombre.
 */
export function PageLayoutPreview({ projectId, pageId, framings }: { projectId: string; pageId: string; framings: Array<Panel["framing"]> }) {
  const { t } = useTranslation("manga");
  const variants = useLayoutPrefs((state) => state.variants);
  const setVariant = useLayoutPrefs((state) => state.setVariant);
  const available = layoutsFor(framings.length).length;
  const variant = layoutVariant(variants, pageId, available);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        role="img"
        aria-label={t("layout.label", { panels: t("page.panels", { count: framings.length }) })}
        className="relative aspect-[5/7] w-full max-w-60 overflow-hidden rounded-sm border"
      >
        <PageLayoutCells projectId={projectId} pageId={pageId} framings={framings} />
      </div>
      {available > 1 && (
        <Button variant="outline" size="sm" onClick={() => setVariant(pageId, (variant + 1) % available)}>
          <Shuffle aria-hidden="true" />
          {t("layout.next", { current: variant + 1, total: available })}
        </Button>
      )}
    </div>
  );
}
