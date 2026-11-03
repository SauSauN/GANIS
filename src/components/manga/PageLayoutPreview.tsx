import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  layoutsFor,
  layoutVariant,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  panelShapes,
  useLayoutPrefs,
  useReadingDirection,
} from "@/lib/mangaLayouts";
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
  const clipId = useId();
  const direction = useReadingDirection(projectId);
  const variants = useLayoutPrefs((state) => state.variants);
  const layouts = layoutsFor(framings.length);
  const layout = layouts[layoutVariant(variants, pageId, layouts.length)];
  if (!layout) return null;

  const shapes = panelShapes(layout, direction).map((shape, index) => ({ ...shape, index }));
  // Les cases incrustées passent devant les autres, sans changer de numéro.
  const ordered = [...shapes.filter((shape) => !shape.inset), ...shapes.filter((shape) => shape.inset)];

  return (
    <svg viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} className="absolute inset-0 size-full bg-white" aria-hidden="true">
      {ordered.map(({ points, center: [x, y], inset, index }) => {
        const outline = points.map((point) => point.join(",")).join(" ");
        const framing = framings[index];
        const lines = !compact && framing ? labelLines(t(`framing.${framing}`)) : [];
        const id = `${clipId}-${index}`;
        return (
          <g key={index}>
            <clipPath id={id}>
              <polygon points={outline} />
            </clipPath>
            {inset && <polygon points={outline} fill="none" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" />}
            <polygon points={outline} fill="#ffffff" stroke="#262626" strokeWidth={compact ? 1.2 : 0.8} strokeLinejoin="round" />
            <g clipPath={`url(#${id})`} fill="#404040" textAnchor="middle">
              <text x={x} y={y - (lines.length * LABEL_LINE) / 2} dominantBaseline="middle" fontSize={compact ? 9 : 7} fontWeight={compact ? 400 : 600}>
                {index + 1}
              </text>
              {lines.map((line, row) => (
                <text key={row} x={x} y={y + 5 + row * LABEL_LINE - ((lines.length - 1) * LABEL_LINE) / 2} dominantBaseline="middle" fontSize={4.2}>
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Hauteur d'une ligne du cadrage, en unités de la page. */
const LABEL_LINE = 5;
/** Au-delà, le cadrage passe sur deux lignes pour tenir dans la case. */
const LABEL_MAX_LENGTH = 12;

/** Cadrage sur une ou deux lignes, coupé à l'espace le plus proche du milieu. */
function labelLines(label: string): string[] {
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index);
  if (label.length <= LABEL_MAX_LENGTH || spaces.length === 0) return [label];
  const cut = spaces.reduce((best, space) => (Math.abs(space - label.length / 2) < Math.abs(best - label.length / 2) ? space : best));
  return [label.slice(0, cut), label.slice(cut + 1)];
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
