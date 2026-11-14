import { useTranslation } from "react-i18next";
import { Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkList, LinkMark, LinkRow } from "@/components/links/LinkRow";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import {
  eventsOfCharacter,
  eventsOfEntry,
  eventsOfLocation,
  eventsOfNode,
  laneOf,
  momentNumber,
  STATUS_COLORS,
  type PlotEvent,
} from "@/lib/plot";
import { usePlotStore, useProjectPlot } from "@/stores/plotStore";
import type { WorldModule } from "@/types";

interface PlotInStoryCardProps {
  projectId: string;
  /** Ce que montre la fiche (personnage, lieu, élément du découpage ou fiche du monde). */
  target: { type: "character" | "location" | "node" | WorldModule; id: string };
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
    target.type === "character"
      ? eventsOfCharacter(data, target.id)
      : target.type === "location"
        ? eventsOfLocation(data, target.id)
        : target.type === "node"
          ? eventsOfNode(data, target.id)
          : eventsOfEntry(data, target.type, target.id);

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
        <LinkList ordered>
          {events.map((event) => {
            const lane = laneOf(data, event.laneId);
            const pov = target.type === "character" && event.povId === target.id;
            return (
              <LinkRow
                key={event.id}
                thumb={<LinkMark color={lane?.color}>{momentNumber(event.row)}</LinkMark>}
                label={lane?.name}
                labelColor={lane?.color}
                name={event.title || t("untitled")}
                onOpen={() => show(event.id, "plot.board")}
                detail={pov ? t("inStory.povLong") : undefined}
                hint={event.note || undefined}
                status={{ color: STATUS_COLORS[event.status], label: t(`status.${event.status}`) }}
              />
            );
          })}
        </LinkList>
      )}
    </CollapsibleCard>
  );
}