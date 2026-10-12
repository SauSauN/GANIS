import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en/locations.json";
import fr from "@/i18n/locales/fr/locations.json";
import {
  CHARACTER_PLACE_FIELDS,
  LOCATION_CHARACTER_FIELDS,
  PLACE_LINK_TYPES,
  charactersCitingLocation,
  emptyPlaceLink,
  linksOf,
  locationsCitingCharacter,
  locationsOfCharacterFields,
} from "@/lib/placeLinks";
import type { Character, CharacterLocation, Location } from "@/types";

const now = "2026-01-01T00:00:00Z";

function character(id: string, fields: Record<string, string> = {}): Character {
  return {
    id,
    firstName: id,
    lastName: "",
    role: "main",
    status: "alive",
    fields,
    portraitUpdatedAt: null,
    galleryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function place(id: string, fields: Record<string, string> = {}): Location {
  return {
    id,
    name: id,
    type: "city",
    parentId: null,
    status: "existing",
    fields,
    portraitUpdatedAt: null,
    galleryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function link(id: string, characterId: string, locationId: string, type: string, createdAt = now): CharacterLocation {
  return { ...emptyPlaceLink(characterId, locationId), id, type, createdAt, updatedAt: now };
}

describe("liens personnage ↔ lieu", () => {
  it("connaît les champs qui désignent l'autre côté", () => {
    expect(CHARACTER_PLACE_FIELDS).toEqual(["origin"]);
    expect(LOCATION_CHARACTER_FIELDS).toContain("ruler");
  });

  it("traduit chaque nature de lien", () => {
    for (const type of PLACE_LINK_TYPES) {
      expect(fr.links.types[type], `fr : ${type}`).toBeTruthy();
      expect(en.links.types[type], `en : ${type}`).toBeTruthy();
    }
  });

  it("trie les liens d'une fiche par nature puis par date", () => {
    const links = [
      link("1", "a", "x", "died"),
      link("2", "a", "y", "born"),
      link("3", "b", "x", "lives"),
      link("4", "a", "x", "lives", "2026-02-01T00:00:00Z"),
      link("5", "a", "z", "lives"),
    ];

    expect(linksOf(links, "character", "a").map((item) => item.id)).toEqual(["2", "5", "4", "1"]);
    expect(linksOf(links, "location", "x").map((item) => item.id)).toEqual(["3", "4", "1"]);
  });

  it("trouve les fiches qui se citent", () => {
    const characters = [character("mira", { origin: "valona" }), character("aldric", { origin: "Un village" })];
    const locations = [place("valona", { ruler: "aldric" }), place("aube")];

    expect(charactersCitingLocation(characters, "valona").map((m) => [m.item.id, m.field])).toEqual([
      ["mira", "origin"],
    ]);
    expect(locationsCitingCharacter(locations, "aldric").map((m) => [m.item.id, m.field])).toEqual([
      ["valona", "ruler"],
    ]);
    // Origine en texte libre : pas de lieu.
    expect(locationsOfCharacterFields(characters[1], locations)).toEqual([]);
    expect(locationsOfCharacterFields(characters[0], locations).map((m) => m.item.id)).toEqual(["valona"]);
  });
});
