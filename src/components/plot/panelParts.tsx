import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, X } from "lucide-react";
import type { TourState } from "@/components/plot/PlotTour";
import type { PlotLinks } from "@/components/plot/usePlotLinks";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/workspace/views/PageShell";
import type { PlotData, PlotFilter } from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore } from "@/stores/plotStore";

/*
 * Éléments partagés par les panneaux de la trame (choix et projet).
 */

export interface PlotPanelProps {
  projectId: string;
  data: PlotData;
  links: PlotLinks;
  onOpenFeature: (featureId: string) => void;
  onStartTour: (mode?: TourState["mode"], laneId?: string | null) => void;
  filter: PlotFilter;
  onFilter: (filter: PlotFilter) => void;
}

/** Section repliable : le titre montre un résumé quand elle est fermée. */
export function Fold({ title, summary, defaultOpen = false, children }: { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mt-3 border-t pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-8 w-full items-center gap-1.5 rounded-md text-left text-sm font-semibold hover:text-foreground"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="shrink-0">{title}</span>
        {!open && summary ? <span className="min-w-0 flex-1 truncate text-right text-xs font-normal text-muted-foreground">{summary}</span> : null}
      </button>
      {open && <div className="pt-2 pb-1">{children}</div>}
    </section>
  );
}
// ----------------------------------------------------------------------------
// Petits éléments
// ----------------------------------------------------------------------------

export function Head({ kind, color, title }: { kind: string; color: string; title?: string }) {
  const { t } = useTranslation("plot");
  const select = usePlotStore((s) => s.select);
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
        {kind}
        {title ? ` · ${title}` : ""}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => select(null)} aria-label={t("panel.close")} title={t("panel.close")}>
        <X />
      </Button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const input = cn(fieldClass, "h-8");
export const area = cn(fieldClass, "resize-y py-2 leading-6");

export function useMutate(projectId: string) {
  const mutate = usePlotStore((s) => s.mutate);
  return (fn: (d: PlotData) => void, key?: string) => mutate(projectId, fn, key ? { key } : undefined);
}

