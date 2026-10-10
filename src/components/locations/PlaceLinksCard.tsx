import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, MapPinned, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { LocationThumb, TypeBadge } from "@/components/locations/LocationVisuals";
import { PlaceLinkDialog } from "@/components/locations/PlaceLinkDialog";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import {
  LOCATION_CHARACTER_FIELDS,
  charactersCitingLocation,
  emptyPlaceLink,
  inputFromPlaceLink,
  linksOf,
  locationsCitingCharacter,
  locationsOfCharacterFields,
} from "@/lib/placeLinks";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectPlaceLinks } from "@/stores/placeLinkStore";
import type { CharacterLocation, CharacterLocationInput } from "@/types";

interface PlaceLinksCardProps {
  projectId: string;
  /** Fiche qui affiche la carte. */
  side: "character" | "location";
  id: string;
  onOpenFeature: (featureId: string) => void;
}

/** Titres des éléments du plan (périodes des liens), chargés une fois. */
function useStructureTitles(projectId: string): Map<string, string> {
  const [titles, setTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    api
      .getStructure(projectId)
      .then((structure) => {
        if (!cancelled) setTitles(new Map(structure.nodes.map((node) => [node.id, node.title])));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return titles;
}

/**
 * Liens entre un personnage et des lieux, ou entre un lieu et des
 * personnages, selon la fiche. Deux parties :
 * - les liens libres (habite, règne…), qu'on ajoute et modifie ici ;
 * - les mentions venues des champs des fiches (Origine, Dirigeant),
 *   en lecture : elles se modifient depuis la fiche concernée.
 */
export function PlaceLinksCard({ projectId, side, id, onOpenFeature }: PlaceLinksCardProps) {
  const { t } = useTranslation(["locations", "characters"]);
  const { characters } = useProjectCharacters(projectId);
  const { locations, settings } = useProjectLocations(projectId);
  const { links } = useProjectPlaceLinks(projectId);
  const labels = useLocationLabels(settings.customTypes);
  const titles = useStructureTitles(projectId);

  const [dialog, setDialog] = useState<{ linkId: string | null; initial: CharacterLocationInput } | null>(
    null,
  );

  const mine = linksOf(links, side, id);

  /** Mentions venues des champs : [libellé, élément, onglet]. */
  const mentions = useMemo(() => {
    if (side === "character") {
      const character = characters.find((item) => item.id === id);
      const own = character
        ? locationsOfCharacterFields(character, locations).map(({ item, field }) => ({
            key: `own-${field}-${item.id}`,
            label: t(`characters:fields.${field}` as "characters:fields.origin"),
            location: item,
          }))
        : [];
      const citing = locationsCitingCharacter(locations, id).map(({ item, field }) => ({
        key: `cite-${field}-${item.id}`,
        label: labels.field(field),
        location: item,
      }));
      return { locations: [...own, ...citing], characters: [] };
    }

    const citing = charactersCitingLocation(characters, id).map(({ item, field }) => ({
      key: `cite-${field}-${item.id}`,
      label: field === "origin" ? t("links.originOf") : t(`characters:fields.${field}` as "characters:fields.origin"),
      character: item,
    }));
    const location = locations.find((item) => item.id === id);
    const own = location
      ? LOCATION_CHARACTER_FIELDS.flatMap((field) => {
          const character = characters.find((item) => item.id === location.fields[field]);
          return character ? [{ key: `own-${field}-${character.id}`, label: labels.field(field), character }] : [];
        })
      : [];
    return { locations: [], characters: [...own, ...citing] };
    // `labels` et `t` suivent la langue ; recalculés à chaque rendu au besoin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, id, characters, locations]);

  const mentionCount = mentions.locations.length + mentions.characters.length;

  function period(link: CharacterLocation): string | null {
    const since = link.sinceNode ? titles.get(link.sinceNode) : undefined;
    const until = link.untilNode ? titles.get(link.untilNode) : undefined;

    if (since && until) return t("links.periodBoth", { since, until });
    if (since) return t("links.periodFrom", { since });
    if (until) return t("links.periodUntil", { until });
    return null;
  }

  function openNew() {
    setDialog({
      linkId: null,
      initial: side === "character" ? emptyPlaceLink(id, "") : emptyPlaceLink("", id),
    });
  }

  const Icon = side === "character" ? MapPinned : Users;

  return (
    <Card className={cardClass}>
      <CardHeader className={`${cardHeaderClass} flex flex-row items-center gap-4`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <CardTitle>
            {side === "character" ? t("links.characterTitle") : t("links.locationTitle")}
            {mine.length + mentionCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {mine.length + mentionCount}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {side === "character" ? t("links.characterDescription") : t("links.locationDescription")}
          </CardDescription>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={openNew}>
          <Plus />
          {t("links.add")}
        </Button>
      </CardHeader>

      <CardContent className={`${cardContentClass} space-y-5`}>
        {mine.length === 0 && mentionCount === 0 && (
          <p className="text-sm text-muted-foreground">{t("links.empty")}</p>
        )}

        {mine.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {mine.map((link) => {
              const character = characters.find((item) => item.id === link.characterId);
              const location = locations.find((item) => item.id === link.locationId);
              const when = period(link);

              return (
                <li key={link.id} className="group flex items-center gap-3 px-3 py-2.5">
                  {side === "character" ? (
                    location && (
                      <LocationThumb projectId={projectId} location={location} customTypes={settings.customTypes} size="sm" />
                    )
                  ) : (
                    character && <CharacterAvatar projectId={projectId} character={character} size="sm" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium text-primary">{t(`links.types.${link.type}` as "links.types.lives")}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenFeature(
                            side === "character" ? locationTabId(link.locationId) : characterTabId(link.characterId),
                          )
                        }
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {side === "character" ? location?.name : character && fullName(character)}
                      </button>
                      {link.label && <span className="text-muted-foreground">· {link.label}</span>}
                    </p>
                    {(when || link.description) && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {[when, link.description].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>

                  {side === "character" && location && (
                    <TypeBadge type={location.type} customTypes={settings.customTypes} labels={labels} className="hidden sm:inline-flex" />
                  )}

                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDialog({ linkId: link.id, initial: inputFromPlaceLink(link) })}
                    aria-label={t("links.edit")}
                    title={t("links.edit")}
                  >
                    <Pencil />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {mentionCount > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Link2 className="size-3.5" aria-hidden="true" />
              {t("links.mentions")}
            </p>
            <ul className="flex flex-wrap gap-2">
              {mentions.locations.map((mention) => (
                <li key={mention.key}>
                  <button
                    type="button"
                    onClick={() => onOpenFeature(locationTabId(mention.location.id))}
                    className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted/50"
                  >
                    <LocationThumb projectId={projectId} location={mention.location} customTypes={settings.customTypes} size="xs" className="rounded-full" />
                    <span className="text-muted-foreground">{mention.label} :</span>
                    <span className="font-medium">{mention.location.name}</span>
                  </button>
                </li>
              ))}
              {mentions.characters.map((mention) => (
                <li key={mention.key}>
                  <button
                    type="button"
                    onClick={() => onOpenFeature(characterTabId(mention.character.id))}
                    className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted/50"
                  >
                    <CharacterAvatar projectId={projectId} character={mention.character} size="xs" />
                    <span className="text-muted-foreground">{mention.label} :</span>
                    <span className="font-medium">{fullName(mention.character)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("links.mentionsHint")}</p>
          </div>
        )}
      </CardContent>

      {dialog && (
        <PlaceLinkDialog
          projectId={projectId}
          linkId={dialog.linkId}
          initial={dialog.initial}
          fixed={side}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  );
}
