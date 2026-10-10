import { CHARACTER_FIELDS } from "@/lib/characters";
import { LOCATION_FIELDS } from "@/lib/locations";
import type {
  Character,
  CharacterLocation,
  CharacterLocationInput,
  Location,
} from "@/types";

/*
 * Liens entre personnages et lieux.
 *
 * Deux niveaux :
 * 1. des champs de fiche qui désignent l'autre : « Origine » d'un personnage
 *    (un lieu, ou un texte libre si le lieu n'existe pas dans le projet),
 *    « Dirigeant » d'une ville ou d'un royaume (un personnage). Chaque fiche
 *    montre aussi les fiches qui la citent (« mentions ») ;
 * 2. des liens libres (`character_locations`) : une nature (habite, règne…),
 *    une précision, une description, une période. Ils appartiennent aux
 *    deux à la fois et apparaissent sur les deux fiches.
 */

/** Natures de lien (codes traduits : `locations:links.types.<code>`), identiques à Rust. */
export const PLACE_LINK_TYPES = [
  "born",
  "lives",
  "grewUp",
  "rules",
  "owns",
  "works",
  "frequents",
  "guards",
  "imprisoned",
  "hides",
  "exiled",
  "died",
  "other",
] as const;

export type PlaceLinkType = (typeof PLACE_LINK_TYPES)[number];

export function emptyPlaceLink(characterId = "", locationId = ""): CharacterLocationInput {
  return {
    characterId,
    locationId,
    type: "lives",
    label: "",
    description: "",
    sinceNode: null,
    untilNode: null,
  };
}

export function inputFromPlaceLink(link: CharacterLocation): CharacterLocationInput {
  return {
    characterId: link.characterId,
    locationId: link.locationId,
    type: link.type,
    label: link.label,
    description: link.description,
    sinceNode: link.sinceNode,
    untilNode: link.untilNode,
  };
}

/** Liens d'un personnage ou d'un lieu, dans l'ordre des natures puis de création. */
export function linksOf(
  links: CharacterLocation[],
  side: "character" | "location",
  id: string,
): CharacterLocation[] {
  const order = (type: string) => {
    const index = PLACE_LINK_TYPES.indexOf(type as PlaceLinkType);
    return index === -1 ? PLACE_LINK_TYPES.length : index;
  };

  return links
    .filter((link) => (side === "character" ? link.characterId : link.locationId) === id)
    .sort((a, b) => order(a.type) - order(b.type) || a.createdAt.localeCompare(b.createdAt));
}

// ----------------------------------------------------------------------------
// Champs qui désignent l'autre côté
// ----------------------------------------------------------------------------

/** Champs de personnage qui désignent un lieu (« Origine »). */
export const CHARACTER_PLACE_FIELDS = CHARACTER_FIELDS.filter((field) => field.kind === "place").map(
  (field) => field.key,
);

/** Champs de lieu qui désignent un personnage (« Dirigeant »). */
export const LOCATION_CHARACTER_FIELDS = LOCATION_FIELDS.filter((field) => field.kind === "character").map(
  (field) => field.key,
);

export interface Mention<T> {
  /** Fiche qui cite. */
  item: T;
  /** Champ de cette fiche qui cite. */
  field: string;
}

/** Lieux dont un champ désigne ce personnage (Valmor : Dirigeant). */
export function locationsCitingCharacter(locations: Location[], characterId: string): Mention<Location>[] {
  return locations.flatMap((location) =>
    LOCATION_CHARACTER_FIELDS.filter((field) => location.fields[field] === characterId).map((field) => ({
      item: location,
      field,
    })),
  );
}

/** Personnages dont un champ désigne ce lieu (Mira : Origine). */
export function charactersCitingLocation(characters: Character[], locationId: string): Mention<Character>[] {
  return characters.flatMap((character) =>
    CHARACTER_PLACE_FIELDS.filter((field) => character.fields[field] === locationId).map((field) => ({
      item: character,
      field,
    })),
  );
}

/** Lieux désignés par les champs d'un personnage (son origine). */
export function locationsOfCharacterFields(
  character: Character,
  locations: Location[],
): Mention<Location>[] {
  return CHARACTER_PLACE_FIELDS.flatMap((field) => {
    const location = locations.find((item) => item.id === character.fields[field]);
    return location ? [{ item: location, field }] : [];
  });
}
