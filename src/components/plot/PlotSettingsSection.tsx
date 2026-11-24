import { useTranslation } from "react-i18next";
import { CalendarClock, CalendarDays, CalendarRange, Clock } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { ColorSwatches } from "@/components/structure/ColorSwatches";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { PLOT_PALETTE, TIME_PRECISIONS, type TimePrecision } from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";
import { TitleWithInfo } from "@/components/common/TitleWithInfo";

const PRECISION_ICONS: Record<TimePrecision, typeof Clock> = {
  year: CalendarRange,
  month: CalendarDays,
  day: CalendarClock,
  hour: Clock,
};

/**
 * Paramètres du projet › Trame : couleur de chaque trame (comme les
 * couleurs des niveaux du découpage, elles ne se choisissent qu'ici) et
 * précision des dates de la frise chronologique.
 */
export function PlotSettingsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation("plot");
  const { data, error } = useProjectPlot(projectId);
  const mutate = usePlotStore((s) => s.mutate);

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <TitleWithInfo info={t("settings.colorsHint")}>{t("settings.colors")}</TitleWithInfo>
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

      {data && (
        <Card className={cardClass}>
          <CardHeader className={cardHeaderClass}>
            <TitleWithInfo info={t("settings.timelineHint")}>{t("settings.timeline")}</TitleWithInfo>
          </CardHeader>
          <CardContent className={cn(cardContentClass, "space-y-2")}>
            <p id="plot-precision-label" className="text-sm font-medium">
              {t("settings.precision")}
            </p>
            {/* Chaque niveau active aussi les précédents : « Jour » permet le mois et le jour. */}
            <div role="radiogroup" aria-labelledby="plot-precision-label" aria-describedby="plot-precision-help" className={cn(SEGMENTED_GROUP, "flex w-full max-w-md")}>
              {TIME_PRECISIONS.map((value) => {
                const Icon = PRECISION_ICONS[value];
                const on = data.timePrecision === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => mutate(projectId, (d) => void (d.timePrecision = value))}
                    className={cn(SEGMENTED_ITEM, "flex-1 justify-center", on && SEGMENTED_ON)}
                  >
                    <Icon aria-hidden="true" />
                    {t(`settings.precisions.${value}`)}
                  </button>
                );
              })}
            </div>
            <p id="plot-precision-help" className="text-xs text-muted-foreground">
              {t(`settings.precisionHelp.${data.timePrecision}`)}
            </p>

            {/* Nom des années : écrit avec chaque date de la frise. */}
            <div className="space-y-2 border-t pt-6">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="plot-year-label">{t("timeline.yearLabel")}</Label>
                <InfoTip>{t("timeline.calendarHint")}</InfoTip>
              </div>
              <Input
                id="plot-year-label"
                value={data.yearLabel}
                maxLength={20}
                placeholder={t("timeline.yearLabelPlaceholder")}
                onChange={(e) => mutate(projectId, (d) => void (d.yearLabel = e.target.value.slice(0, 20)), { key: "timeline:yearLabel" })}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">{t("timeline.yearLabelExample", { value: `${data.yearLabel} 312`.trim() })}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
