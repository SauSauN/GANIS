import { useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, MapPin, Network, PawPrint, Plus, Unlink, UserPlus, UserRound } from "lucide-react";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { ActionMenu, type MenuItem } from "@/components/documents/ActionMenu";
import { LinkGroup, LinkList, LinkRow } from "@/components/links/LinkRow";
import { LocationThumb } from "@/components/locations/LocationVisuals";
import { PlaceLinkDialog } from "@/components/locations/PlaceLinkDialog";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import { RelationDialog } from "@/components/relations/RelationDialog";
import { useRelationColors } from "@/components/relations/useRelationColors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardContentClass, fieldClass } from "@/components/workspace/views/PageShell";
import { WorldThumb } from "@/components/world/WorldVisuals";
import { useDirectory, useLinkPeriod, WorldLinkDialog, WorldLinkRow } from "@/components/world/WorldLinksCard";
import { useWorldLinkLabels } from "@/components/world/useWorldLabels";
import { characterTabId, fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { locationTabId } from "@/lib/locations";
import { notifyError } from "@/lib/notify";
import {
  LOCATION_CHARACTER_FIELDS,
  charactersCitingLocation,
  emptyPlaceLink,
  inputFromPlaceLink,
  linksOf,
  locationsCitingCharacter,
  locationsOfCharacterFields,
} from "@/lib/placeLinks";
import { emptyRelation, inputFromRelation, otherEnd, relationsOf } from "@/lib/relations";
import { cn } from "@/lib/utils";
import { isWorldKind, linkChoices, linksOfEntry, worldTabId } from "@/lib/world";
import { useProjectPlaceLinks } from "@/stores/placeLinkStore";
import { useProjectRelations } from "@/stores/relationStore";
import { useProjectWorldLinks } from "@/stores/worldLinkStore";
import { useEnabledWorldModules, useWorldStore } from "@/stores/worldStore";
import type { Character, CharacterLocationInput, RelationInput, WorldEntry, WorldLink, WorldLinkKind, WorldModule } from "@/types";

/** Groupes de la carte, dans l'ordre : une sorte d'élément chacun. */
const GROUPS: WorldLinkKind[] = ["character", "location", "species", "item", "faction", "people", "magic"];

type Dialogs =
  | { kind: "relation"; relationId: string | null; initial: RelationInput }
  | { kind: "place"; linkId: string | null; initial: CharacterLocationInput }
  | { kind: "world"; link: WorldLink | null; initialKind?: WorldLinkKind }
  | { kind: "animal" }
  | { kind: "animalCharacter" };

interface Self {
  kind: WorldLinkKind;
  id: string;
}

/**
 * « Liens avec l'univers » : tout ce qui relie une fiche (personnage,
 * lieu, objet, faune et flore, faction, peuple, magie) au reste du monde,
 * rangé par sorte d'élément. Une seule carte, un seul bouton « Ajouter un
 * lien » ; chaque sorte de lien garde sa fenêtre :
 * - personnage ↔ personnage : relations ;
 * - personnage ↔ lieu : liens personnage-lieu, plus les mentions venues
 *   des champs des fiches (Origine, Dirigeant…), en lecture ;
 * - un animal précis ↔ le personnage qu'il est ;
 * - tout le reste : liens du monde (« possède », « dirige »…), dont les
 *   membres d'une faction, d'un peuple ou d'une magie.
 */
export function UniverseLinksCard({ projectId, self, onOpenFeature }: { projectId: string; self: Self; onOpenFeature: (featureId: string) => void }) {
  const { t } = useTranslation(["world", "relations", "locations", "characters"]);
  const directory = useDirectory(projectId);
  const { characters, locations, locationSettings } = directory;
  const { relations } = useProjectRelations(projectId);
  const { links: placeLinks } = useProjectPlaceLinks(projectId);
  const { links: worldLinks } = useProjectWorldLinks(projectId);
  const enabled = useEnabledWorldModules(projectId);
  const relationColors = useRelationColors();
  const locationLabels = useLocationLabels(locationSettings.customTypes);
  const worldLabels = useWorldLinkLabels();
  const period = useLinkPeriod(projectId);
  const [open, setOpen] = useCollapsible(`ganis.universeLinks.${self.kind}.collapsed`);
  const [dialog, setDialog] = useState<Dialogs | null>(null);

  const isCharacter = self.kind === "character";
  const isLocation = self.kind === "location";
  const speciesSlice = directory.species;
  /** Personnage : l'animal précis qu'il est peut-être. */
  const animal = isCharacter ? speciesSlice.entries.find((entry) => entry.characterId === self.id) : undefined;
  /** Animal précis de la faune et flore : sa fiche, et le personnage qu'il est peut-être. */
  const individual = self.kind === "species" ? speciesSlice.entries.find((entry) => entry.id === self.id && entry.nature === "individual") : undefined;
  const individualCharacter = individual?.characterId ? characters.find((c) => c.id === individual.characterId) : undefined;

  const myRelations = isCharacter ? relationsOf(relations, self.id) : [];
  const myPlaces = isCharacter || isLocation ? linksOf(placeLinks, isCharacter ? "character" : "location", self.id) : [];
  const myWorld = linksOfEntry(worldLinks, self.id);

  /** Mentions venues des champs des fiches (Origine, Dirigeant…), en lecture. */
  const mentions = useMemo(() => {
    if (isCharacter) {
      const character = characters.find((item) => item.id === self.id);
      const own = character
        ? locationsOfCharacterFields(character, locations).map(({ item, field }) => ({
            key: `own-${field}-${item.id}`,
            label: t(`characters:fields.${field}` as "characters:fields.origin"),
            location: item,
            character: null as Character | null,
          }))
        : [];
      const citing = locationsCitingCharacter(locations, self.id).map(({ item, field }) => ({
        key: `cite-${field}-${item.id}`,
        label: locationLabels.field(field),
        location: item,
        character: null as Character | null,
      }));
      return [...own, ...citing];
    }
    if (isLocation) {
      const citing = charactersCitingLocation(characters, self.id).map(({ item, field }) => ({
        key: `cite-${field}-${item.id}`,
        label: field === "origin" ? t("locations:links.originOf") : t(`characters:fields.${field}` as "characters:fields.origin"),
        location: null,
        character: item as Character | null,
      }));
      const location = locations.find((item) => item.id === self.id);
      const own = location
        ? LOCATION_CHARACTER_FIELDS.flatMap((field) => {
            const character = characters.find((item) => item.id === location.fields[field]);
            return character ? [{ key: `own-${field}-${character.id}`, label: locationLabels.field(field), location: null, character: character as Character | null }] : [];
          })
        : [];
      return [...own, ...citing];
    }
    return [];
    // `t` et les libellés suivent la langue ; recalculés à chaque rendu au besoin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCharacter, isLocation, characters, locations, self.id]);

  // --- Lignes, rangées par groupe -------------------------------------------
  const rows = new Map<WorldLinkKind, ReactNode[]>(GROUPS.map((kind) => [kind, []]));
  const push = (kind: WorldLinkKind, row: ReactNode) => rows.get(kind)?.push(row);

  for (const relation of myRelations) {
    const other = characters.find((c) => c.id === otherEnd(relation, self.id));
    if (!other) continue;
    const arrow = relation.directed ? (relation.sourceId === self.id ? "→ " : "← ") : "↔ ";
    push(
      "character",
      <LinkRow
        key={relation.id}
        thumb={<CharacterAvatar projectId={projectId} character={other} size="sm" />}
        label={`${arrow}${t(`relations:types.${relation.type}`)}`}
        labelColor={relationColors[relation.type]}
        name={fullName(other)}
        onOpen={() => onOpenFeature(characterTabId(other.id))}
        detail={relation.label || undefined}
        hint={relation.description || undefined}
        onEdit={() => setDialog({ kind: "relation", relationId: relation.id, initial: inputFromRelation(relation) })}
        editLabel={t("relations:list.edit")}
      />,
    );
  }

  if (individual?.characterId) {
    push(
      "character",
      <LinkRow
        key="animal-character"
        thumb={individualCharacter && <CharacterAvatar projectId={projectId} character={individualCharacter} size="sm" />}
        label={t("world:universe.characterLabel")}
        name={individualCharacter ? fullName(individualCharacter) : t("world:form.deleted")}
        onOpen={() => onOpenFeature(characterTabId(individual.characterId!))}
        hint={t("world:animalCharacter.linked")}
        onEdit={() => setDialog({ kind: "animalCharacter" })}
        editLabel={t("world:universe.characterEdit")}
      />,
    );
  }

  for (const link of myPlaces) {
    const hint = [period(link), link.description].filter(Boolean).join(" — ") || undefined;
    const edit = () => setDialog({ kind: "place", linkId: link.id, initial: inputFromPlaceLink(link) });
    if (isCharacter) {
      const location = locations.find((item) => item.id === link.locationId);
      push(
        "location",
        <LinkRow
          key={link.id}
          thumb={location && <LocationThumb projectId={projectId} location={location} customTypes={locationSettings.customTypes} size="sm" />}
          label={t(`locations:links.types.${link.type}` as "locations:links.types.lives")}
          name={location?.name ?? t("world:form.deleted")}
          onOpen={() => onOpenFeature(locationTabId(link.locationId))}
          detail={link.label || undefined}
          hint={hint}
          badge={location ? locationLabels.type(location.type) : undefined}
          onEdit={edit}
          editLabel={t("locations:links.edit")}
        />,
      );
    } else {
      const character = characters.find((item) => item.id === link.characterId);
      push(
        "character",
        <LinkRow
          key={link.id}
          thumb={character && <CharacterAvatar projectId={projectId} character={character} size="sm" />}
          label={t(`locations:links.types.${link.type}` as "locations:links.types.lives")}
          name={character ? fullName(character) : t("world:form.deleted")}
          onOpen={() => onOpenFeature(characterTabId(link.characterId))}
          detail={link.label || undefined}
          hint={hint}
          onEdit={edit}
          editLabel={t("locations:links.edit")}
        />,
      );
    }
  }

  for (const mention of mentions) {
    if (mention.location) {
      push(
        "location",
        <LinkRow
          key={mention.key}
          thumb={<LocationThumb projectId={projectId} location={mention.location} customTypes={locationSettings.customTypes} size="sm" />}
          label={mention.label}
          name={mention.location.name}
          onOpen={() => onOpenFeature(locationTabId(mention.location!.id))}
          hint={t("locations:links.mentionsHint")}
          badge={t("locations:links.mentions")}
        />,
      );
    } else if (mention.character) {
      push(
        "character",
        <LinkRow
          key={mention.key}
          thumb={<CharacterAvatar projectId={projectId} character={mention.character} size="sm" />}
          label={mention.label}
          name={fullName(mention.character)}
          onOpen={() => onOpenFeature(characterTabId(mention.character!.id))}
          hint={t("locations:links.mentionsHint")}
          badge={t("locations:links.mentions")}
        />,
      );
    }
  }

  if (animal) {
    push(
      "species",
      <LinkRow
        key="animal"
        thumb={<WorldThumb projectId={projectId} module="species" entry={animal} customTypes={speciesSlice.settings.customTypes} size="sm" />}
        label={t("world:universe.animalLabel")}
        name={animal.name}
        onOpen={() => onOpenFeature(worldTabId("species", animal.id))}
        detail={speciesSlice.entries.find((entry) => entry.id === animal.parentId)?.name}
        onEdit={() => setDialog({ kind: "animal" })}
        editLabel={t("world:universe.animalEdit")}
      />,
    );
  }

  for (const view of myWorld) {
    push(
      view.otherKind,
      <WorldLinkRow
        key={view.link.id}
        projectId={projectId}
        directory={directory}
        view={view}
        period={period(view.link)}
        onOpenFeature={onOpenFeature}
        showKind={false}
        onEdit={() => setDialog({ kind: "world", link: view.link })}
      />,
    );
  }

  const count = [...rows.values()].reduce((sum, list) => sum + list.length, 0);

  // --- « Ajouter un lien » : une entrée par sorte possible -------------------
  const worldKinds = GROUPS.filter(
    (kind) => (!isWorldKind(kind) || enabled[kind as WorldModule]) && linkChoices(self.kind, kind).length > 0,
  );
  const addItems: MenuItem[] = [];
  if (isCharacter) {
    addItems.push(
      { id: "relation", label: worldLabels.kind("character"), icon: UserRound, disabled: characters.length < 2, run: () => setDialog({ kind: "relation", relationId: null, initial: emptyRelation(self.id) }) },
      { id: "place", label: worldLabels.kind("location"), icon: MapPin, run: () => setDialog({ kind: "place", linkId: null, initial: emptyPlaceLink(self.id, "") }) },
    );
  } else if (isLocation) {
    addItems.push({ id: "place", label: worldLabels.kind("character"), icon: UserRound, run: () => setDialog({ kind: "place", linkId: null, initial: emptyPlaceLink("", self.id) }) });
  }
  worldKinds
    .filter((kind) => !(isCharacter && (kind === "character" || kind === "location")) && !(isLocation && kind === "character"))
    .forEach((kind, index) =>
      addItems.push({
        id: kind,
        label: worldLabels.kind(kind),
        icon: kind === "character" ? UserRound : kind === "location" ? MapPin : undefined,
        separated: index === 0 && addItems.length > 0,
        run: () => setDialog({ kind: "world", link: null, initialKind: kind }),
      }),
    );
  if (isCharacter && enabled.species && speciesSlice.loaded && !animal) {
    addItems.push({ id: "animal", label: t("world:universe.animalAdd"), icon: PawPrint, separated: true, run: () => setDialog({ kind: "animal" }) });
  }
  if (individual && !individual.characterId) {
    addItems.push({ id: "animalCharacter", label: t("world:universe.characterAdd"), icon: UserPlus, separated: true, run: () => setDialog({ kind: "animalCharacter" }) });
  }

  const description: string = isCharacter
    ? t("world:universe.description.character")
    : isLocation
      ? t("world:universe.description.location")
      : t(`world:links.description.${self.kind as WorldModule}`);

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Link2}
      title={t("world:universe.title")}
      description={description}
      count={count}
      contentClassName={`${cardContentClass} space-y-5`}
      actions={
        <>
          {isCharacter && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenFeature("characters.relations")} title={t("relations:sheet.graph")} aria-label={t("relations:sheet.graph")}>
              <Network />
            </Button>
          )}
          {addItems.length > 0 && (
            <ActionMenu
              label={t("world:universe.add")}
              className="h-8 w-auto gap-1.5 border px-2.5 text-sm text-foreground"
              trigger={
                <>
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">{t("world:universe.add")}</span>
                </>
              }
              items={addItems.map((item) => ({
                ...item,
                run: () => {
                  setOpen(true);
                  item.run();
                },
              }))}
            />
          )}
        </>
      }
    >
      {count === 0 && <p className="text-sm text-muted-foreground">{t("world:universe.empty")}</p>}

      {GROUPS.map((kind) => {
        const list = rows.get(kind) ?? [];
        if (!list.length) return null;
        return (
          <LinkGroup key={kind} title={t(`world:universe.groups.${kind}` as "world:universe.groups.character")} count={list.length}>
            <LinkList>{list}</LinkList>
          </LinkGroup>
        );
      })}

      <RelationDialog
        projectId={projectId}
        open={dialog?.kind === "relation"}
        relationId={dialog?.kind === "relation" ? dialog.relationId : null}
        initial={dialog?.kind === "relation" ? dialog.initial : null}
        onClose={() => setDialog(null)}
      />
      {dialog?.kind === "place" && (
        <PlaceLinkDialog projectId={projectId} linkId={dialog.linkId} initial={dialog.initial} fixed={isCharacter ? "character" : "location"} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "world" && (
        <WorldLinkDialog projectId={projectId} self={self} link={dialog.link} directory={directory} initialKind={dialog.initialKind} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "animal" && (
        <AnimalDialog projectId={projectId} characterId={self.id} animal={animal} entries={speciesSlice.entries} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "animalCharacter" && individual && (
        <AnimalCharacterDialog projectId={projectId} entry={individual} characters={characters} entries={speciesSlice.entries} onOpenFeature={onOpenFeature} onClose={() => setDialog(null)} />
      )}
    </CollapsibleCard>
  );
}

/** Fenêtre rendue hors de la fiche (portail) : la fiche est elle-même un formulaire. */
function useRun(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (e) {
      notifyError(errorText(e), "world:characters");
      setBusy(false);
    }
  };
  return { busy, run };
}

/**
 * Fiche d'un personnage : est-il un animal (ou une plante) précis de la
 * faune et flore ? On l'associe à une fiche libre, ou on retire le lien.
 */
function AnimalDialog({
  projectId,
  characterId,
  animal,
  entries,
  onClose,
}: {
  projectId: string;
  characterId: string;
  animal: WorldEntry | undefined;
  entries: WorldEntry[];
  onClose: () => void;
}) {
  const { t } = useTranslation("world");
  const selectId = useId();
  const setCharacter = useWorldStore((state) => state.setCharacter);
  const [picked, setPicked] = useState("");
  const { busy, run } = useRun(onClose);
  const free = entries.filter((item) => item.nature === "individual" && !item.characterId);

  return createPortal(
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("characterAnimal.title")}</DialogTitle>
        <DialogDescription>{animal ? t("animalCharacter.unlinkHint") : t("characterAnimal.none")}</DialogDescription>
      </DialogHeader>

      {animal ? (
        <p className="mt-5 text-sm">
          {t("universe.animalLabel")} <span className="font-medium">{animal.name}</span>
        </p>
      ) : (
        <div className="mt-5 space-y-1.5">
          <Label htmlFor={selectId}>{t("characterAnimal.pickLabel")}</Label>
          <select id={selectId} value={picked} disabled={busy || free.length === 0} onChange={(e) => setPicked(e.target.value)} className={cn(fieldClass, "h-9")}>
            <option value="">{free.length === 0 ? t("characterAnimal.noFree") : t("links.dialog.choose")}</option>
            {free.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <DialogFooter className="mt-6 gap-2">
        {animal && (
          <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={busy} onClick={() => void run(() => setCharacter(projectId, animal.id, null))}>
            <Unlink />
            {t("animalCharacter.unlink")}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t("links.dialog.cancel")}
        </Button>
        {!animal && (
          <Button type="button" disabled={busy || !picked} onClick={() => void run(() => setCharacter(projectId, picked, characterId))}>
            {busy && <Loader2 className="animate-spin" />}
            {t("animalCharacter.link")}
          </Button>
        )}
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}

/**
 * Fiche d'un animal (ou d'une plante) précis : est-il aussi un personnage ?
 * On lui crée une fiche de personnage, on l'associe à un personnage qui
 * existe, ou on retire le lien (la fiche de personnage est gardée).
 */
function AnimalCharacterDialog({
  projectId,
  entry,
  characters,
  entries,
  onOpenFeature,
  onClose,
}: {
  projectId: string;
  entry: WorldEntry;
  characters: Character[];
  entries: WorldEntry[];
  onOpenFeature: (featureId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("world");
  const selectId = useId();
  const setCharacter = useWorldStore((state) => state.setCharacter);
  const createCharacter = useWorldStore((state) => state.createCharacter);
  const [picked, setPicked] = useState("");
  const { busy, run } = useRun(onClose);
  const character = entry.characterId ? characters.find((item) => item.id === entry.characterId) : undefined;
  // Personnages qui ne sont pas déjà un autre animal.
  const taken = new Set(entries.filter((item) => item.id !== entry.id && item.characterId).map((item) => item.characterId));
  const free = characters.filter((item) => !taken.has(item.id));

  return createPortal(
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("animalCharacter.title")}</DialogTitle>
        <DialogDescription>{entry.characterId ? t("animalCharacter.linked") : t("animalCharacter.notLinked")}</DialogDescription>
      </DialogHeader>

      {entry.characterId ? (
        <p className="mt-5 text-sm">
          {t("universe.characterLabel")} <span className="font-medium">{character ? fullName(character) : t("form.deleted")}</span>
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const created = await createCharacter(projectId, entry.id);
                onOpenFeature(characterTabId(created.id));
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t("animalCharacter.create")}
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor={selectId}>{t("animalCharacter.pickLabel")}</Label>
            <select id={selectId} value={picked} disabled={busy || free.length === 0} onChange={(e) => setPicked(e.target.value)} className={cn(fieldClass, "h-9")}>
              <option value="">{free.length === 0 ? t("animalCharacter.noFree") : t("links.dialog.choose")}</option>
              {free.map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <DialogFooter className="mt-6 gap-2">
        {entry.characterId && (
          <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={busy} title={t("animalCharacter.unlinkHint")} onClick={() => void run(() => setCharacter(projectId, entry.id, null))}>
            <Unlink />
            {t("animalCharacter.unlink")}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t("links.dialog.cancel")}
        </Button>
        {!entry.characterId && (
          <Button type="button" variant="outline" disabled={busy || !picked} onClick={() => void run(() => setCharacter(projectId, entry.id, picked))}>
            <Link2 />
            {t("animalCharacter.link")}
          </Button>
        )}
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}
