import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en/locations.json";
import fr from "@/i18n/locales/fr/locations.json";
import {
  BUILTIN_TYPES,
  DEFAULT_STATUSES,
  LOCATION_CATEGORIES,
  LOCATION_FIELDS,
  ancestorsOf,
  buildLocationTree,
  categoryFields,
  draftFromLocation,
  emptyLocationDraft,
  findType,
  flattenTree,
  hiddenFilledKeys,
  isBlankLocationDraft,
  locationIdOfTab,
  locationNameError,
  locationTabId,
  sameLocationDraft,
  selfAndDescendants,
  toLocationInput,
  typeFields,
  typesOfCategory,
  visibleFieldKeys,
} from "@/lib/locations";
import type { Location } from "@/types";

function place(id: string, name: string, parentId: string | null = null, type = "city"): Location {
  return {
    id,
    name,
    type,
    parentId,
    status: "existing",
    fields: {},
    portraitUpdatedAt: null,
    galleryCount: 0,
    createdAt: `2026-01-01T00:00:0${id.length}Z`,
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

type Dict = Record<string, unknown>;
const get = (dict: Dict, path: string): unknown =>
  path.split(".").reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);

describe("catalogue des lieux", () => {
  it("a six catégories, chacune avec des types", () => {
    expect(LOCATION_CATEGORIES).toHaveLength(6);
    for (const category of LOCATION_CATEGORIES) {
      expect(typesOfCategory(category, []).length).toBeGreaterThan(0);
    }
  });

  it("est entièrement traduit en français et en anglais", () => {
    const keys = [
      ...LOCATION_CATEGORIES.flatMap((id) => [`categories.${id}.label`, `categories.${id}.description`]),
      ...BUILTIN_TYPES.map((item) => `types.${item.id}`),
      ...DEFAULT_STATUSES.map((status) => `statuses.${status}`),
      ...LOCATION_FIELDS.map((field) => `fields.${field.key}`),
      ...LOCATION_FIELDS.flatMap((field) => field.options.map((option) => `options.${field.key}.${option}`)),
    ];

    for (const key of keys) {
      expect(get(fr, key), `fr : ${key}`).toBeTruthy();
      expect(get(en, key), `en : ${key}`).toBeTruthy();
    }
  });

  it("empile champs communs, de catégorie et de type sans doublon", () => {
    const capital = visibleFieldKeys("capital", "settlement");
    expect(capital.has("description")).toBe(true); // commun
    expect(capital.has("population")).toBe(true); // catégorie
    expect(capital.has("seatOfPower")).toBe(true); // type
    expect(capital.has("altitude")).toBe(false);

    // « Climat » vient de la catégorie des espaces naturels : pas répété.
    expect(categoryFields("natural").some((field) => field.key === "climate")).toBe(true);
    expect(typeFields("forest", "natural").some((field) => field.key === "climate")).toBe(false);
  });

  it("donne sa catégorie aux types ajoutés par l'auteur", () => {
    const custom = [{ id: "custom-1", name: "Tour de mage", category: "built" }];

    expect(findType("custom-1", custom)?.category).toBe("built");
    expect(findType("custom-1", custom)?.customName).toBe("Tour de mage");
    const built = typesOfCategory("built", custom);
    expect(built[built.length - 1].id).toBe("custom-1");
    expect(findType("custom-2", custom)).toBeUndefined();
  });

  it("repère les champs remplis masqués par un changement de type", () => {
    const fields = { population: "20 000", formerly: "La cité blanche", notes: "x" };

    expect(hiddenFilledKeys(fields, "ruins", "built")).toEqual(["population"]);
    expect(hiddenFilledKeys(fields, "city", "settlement")).toEqual(["formerly"]);
  });
});

describe("hiérarchie des lieux", () => {
  const locations = [
    place("k", "Valmor", "c", "kingdom"),
    place("c", "Ardanie", null, "continent"),
    place("v", "Valona", "k"),
    place("a", "Aube", "k", "village"),
    place("i", "Îles", null, "archipelago"),
    place("o", "Orphelin", "absent"),
  ];

  it("construit l'arbre, trié par nom à chaque niveau", () => {
    const rows = flattenTree(buildLocationTree(locations)).map((node) => [node.location.name, node.depth]);

    expect(rows).toEqual([
      ["Ardanie", 0],
      ["Valmor", 1],
      ["Aube", 2],
      ["Valona", 2],
      ["Îles", 0],
      ["Orphelin", 0], // parent introuvable : à la racine
    ]);
  });

  it("saute les branches repliées", () => {
    const rows = flattenTree(buildLocationTree(locations), new Set(["k"])).map((node) => node.location.id);
    expect(rows).toEqual(["c", "k", "i", "o"]);
  });

  it("résiste à une boucle dans les données", () => {
    const looped = [place("x", "X", "y"), place("y", "Y", "x")];
    expect(flattenTree(buildLocationTree(looped))).toHaveLength(2);
    expect(ancestorsOf(looped, "x").map((item) => item.id)).toEqual(["y"]);
  });

  it("donne les parents et les descendants", () => {
    expect(ancestorsOf(locations, "v").map((item) => item.name)).toEqual(["Ardanie", "Valmor"]);
    expect([...selfAndDescendants(locations, "c")].sort()).toEqual(["a", "c", "k", "v"]);
  });
});

describe("fiche d'un lieu", () => {
  it("compare et nettoie les brouillons comme Rust", () => {
    const base = draftFromLocation({ ...place("v", "Valona"), fields: { population: "20 000" } });

    expect(sameLocationDraft(base, { ...base, name: " Valona " })).toBe(true);
    expect(sameLocationDraft(base, { ...base, fields: { population: "20 000", notes: "  " } })).toBe(true);
    expect(sameLocationDraft(base, { ...base, parentId: "k" })).toBe(false);
    expect(sameLocationDraft(base, { ...base, type: "port" })).toBe(false);

    expect(toLocationInput({ ...base, name: " Valona ", fields: { inconnu: "x", notes: " a " } })).toEqual({
      name: "Valona",
      type: "city",
      parentId: null,
      status: "existing",
      fields: { notes: "a" },
    });
  });

  it("vérifie le nom et reconnaît un formulaire vierge", () => {
    expect(locationNameError("  ")).toBe("nameRequired");
    expect(locationNameError("a".repeat(201))).toBe("nameTooLong");
    expect(locationNameError("Valona")).toBeNull();

    expect(isBlankLocationDraft(emptyLocationDraft("city", "k"))).toBe(true);
    expect(isBlankLocationDraft({ ...emptyLocationDraft("city"), name: "V" })).toBe(false);
  });

  it("reconnaît les onglets de fiche", () => {
    expect(locationIdOfTab(locationTabId("abc"))).toBe("abc");
    expect(locationIdOfTab("locations.list")).toBeNull();
  });
});
