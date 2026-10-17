import { useTranslation } from "react-i18next";
import { ColorSwatches } from "@/components/structure/ColorSwatches";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { PLOT_PALETTE } from "@/lib/plot";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";

/**
 * Paramètres du projet › Trame : couleur de chaque trame (comme les
 * couleurs des niveaux du découpage, elles ne se choisissent qu'ici).
 */
export function PlotSettingsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation("plot");
  const { data, error } = useProjectPlot(projectId);
  const mutate = usePlotStore((s) => s.mutate);

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("settings.colors")}</CardTitle>
        <CardDescription>{t("settings.colorsHint")}</CardDescription>
      </CardHeader>
      <CardContent className={cardContentClass}>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <ul className="divide-y">
            {data.lanes.map((lane, index) => (
              <li key={lane.id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
                <span className="flex w-48 min-w-0 items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
                  <span className="truncate font-medium">{lane.name}</span>
                  {lane.main && <span className="rounded-full border px-1.5 text-[0.65rem] text-muted-foreground">{t("board.mainLane")}</span>}
                </span>
                <ColorSwatches
                  label={t("settings.colorOf", { name: lane.name })}
                  value={lane.color}
                  fallback={PLOT_PALETTE[index % PLOT_PALETTE.length]}
                  onChange={(color) =>
                    mutate(projectId, (d) => {
                      const l = d.lanes.find((x) => x.id === lane.id);
                      if (l) l.color = color ?? PLOT_PALETTE[index % PLOT_PALETTE.length];
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
