import { useTranslation } from "react-i18next";
import { useProjectPlot, usePlotStore } from "@/stores/plotStore";
import { cn } from "@/lib/utils";

interface SideBarPlotProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Trames du projet dans le panneau du module « Trame », sous ses pages :
 * un clic montre la trame sur le plateau (et l'ouvre dans le panneau de
 * droite) ; le nombre d'événements de chacune est indiqué.
 */
export function SideBarPlot({ projectId, activeTab, onOpenFeature }: SideBarPlotProps) {
  const { t } = useTranslation("plot");
  const { data } = useProjectPlot(projectId);
  const select = usePlotStore((s) => s.select);
  const selection = usePlotStore((s) => s.selection);

  return (
    <section aria-labelledby="sidebar-plot" className="mt-4 flex min-h-0 flex-1 flex-col">
      <h3 id="sidebar-plot" className="px-4 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {t("sidebar.title")}
        {data && ` (${data.lanes.length})`}
      </h3>
      {!data ? (
        <p className="px-4 text-xs text-muted-foreground">{t("loading")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {data.lanes.map((lane) => {
            const count = data.events.filter((e) => e.laneId === lane.id).length;
            const current = activeTab === "plot.board" && selection?.type === "lane" && selection.id === lane.id;
            return (
              <li key={lane.id}>
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => {
                    select({ type: "lane", id: lane.id });
                    onOpenFeature("plot.board");
                  }}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent", current && "bg-sidebar-accent font-medium", lane.hidden && "opacity-60")}
                  title={lane.hidden ? t("sidebar.hidden") : undefined}
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", lane.main && "ring-2 ring-offset-1 ring-offset-sidebar")} style={{ backgroundColor: lane.color, ["--tw-ring-color" as string]: lane.color }} />
                  <span className="min-w-0 flex-1 truncate text-left">{lane.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
          <li className="px-2 pt-2 text-xs text-muted-foreground">{t("sidebar.summary", {
            events: t("sidebar.summaryEvents", { count: data.events.length }),
            links: t("sidebar.summaryLinks", { count: data.links.length }),
          })}</li>
        </ul>
      )}
    </section>
  );
}
