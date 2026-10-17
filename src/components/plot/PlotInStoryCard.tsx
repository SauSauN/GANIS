import { useTranslation } from "react-i18next";
import { Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { eventsOfCharacter, eventsOfLocation, eventsOfNode, laneOf, STATUS_COLORS, type PlotEvent } from "@/lib/plot";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";

interface PlotInStoryCardProps {
  projectId: string;
  /** Ce que montre la fiche. */
  target: { type: "character" | "location" | "node"; id: string };
  /** Nom de l'élément (description de la carte). */
  name: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Dans la trame » sur les fiches des personnages, des lieux et des
 * éléments du découpage : les événements de la trame où ils apparaissent,
 * dans l'ordre du plan, avec un lien vers le plateau et la lecture.
 */
export function PlotInStoryCard({ projectId, target, name, onOpenFeature }: PlotInStoryCardProps) {
  const { t } = useTranslation("plot");
  const [open, setOpen] = useCollapsible(`ganis.sheet.plot.${target.type}.collapsed`);
  const { data } = useProjectPlot(projectId);
  const requestFocus = usePlotStore((s) => s.requestFocus);

  if (!data) return null;
  const events: PlotEvent[] =
    target.type === "character" ? eventsOfCharacter(data, target.id) : target.type === "location" ? eventsOfLocation(data, target.id) : eventsOfNode(data, target.id);

  const show = (id: string, feature: "plot.board" | "plot.reading") => {
    requestFocus(id);
    onOpenFeature(feature);
  };

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Waypoints}
      title={t("inStory.title")}
      description={t(`inStory.description.${target.type}`, { name })}
      count={events.length}
      actions={
        events.length > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={() => show(events[0].id, "plot.reading")}>
            {t("inStory.read")}
          </Button>
        ) : undefined
      }
    >
      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          <p>{t(`inStory.empty.${target.type}`)}</p>
          <button type="button" className="mt-1 text-primary hover:underline" onClick={() => onOpenFeature("plot.board")}>
            {t("inStory.openBoard")}
          </button>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {events.map((event) => {
            const lane = laneOf(data, event.laneId);
            const pov = target.type === "character" && event.povId === target.id;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => show(event.id, "plot.board")}
                  className="flex w-full items-start gap-3 rounded-lg border border-l-4 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  style={{ borderLeftColor: lane?.color }}
                >
                  <span className="w-8 shrink-0 pt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{event.row + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {event.title || t("untitled")}
                      {pov && <span className="ml-2 rounded-full bg-foreground px-1.5 py-px text-[0.65rem] font-semibold text-background">{t("inStory.pov")}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lane?.name}
                      {event.note ? ` · ${event.note}` : ""}
                    </span>
                  </span>
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[event.status] }} title={t(`status.${event.status}`)} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </CollapsibleCard>
  );
}
