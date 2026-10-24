import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en/world.json";
import fr from "@/i18n/locales/fr/world.json";
import { modulesFor } from "@/components/workspace/modules";
import {
  CATALOGS,
  WORLD_LINK_TYPES,
  WORLD_MODULES,
  buildWorldTree,
  categoryFields,
  emptyWorldDraft,
  enabledCategories,
  flattenWorldTree,
  groupWorldTreeByCategory,
  hiddenFilledKeys,
  levelFieldKeys,
  linkChoices,
  linksOfEntry,
  orientLink,
  parentCandidates,
  sameWorldDraft,
  toWorldInput,
  typeFields,
  visibleFieldKeys,
  worldEntryOfTab,
  worldTabId,
} from "@/lib/world";
import type { WorldEntry, WorldLink, WorldSettings } from "@/types";

type Dict = Record<string, unknown>;

function get(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

function entry(id: string, patch: Partial<WorldEntry> = {}): WorldEntry {
  return {
    id,
    name: id,
    type: "mammal",
    nature: "species",
    parentId: null,
    characterId: null,
    status: "common",
    fields: {},
    portraitUpdatedAt: null,
    galleryCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

const settings = (categories: string[]): WorldSettings => ({
  enabled: true,
  categories,
  detailLevel: null,
  customTypes: [],
  lists: {},
});

describe("catalogues", () => {
  it("chaque catégorie, type, statut, champ et option est traduit (fr et en)", () => {
    for (const lang of [fr, en] as Dict[]) {
      for (const module of WORLD_MODULES) {
        const catalog = CATALOGS[module];
        const missing: string[] = [];
        const need = (path: string) => typeof get(lang, `${module}.${path}`) !== "string" && missing.push(path);

        catalog.categories.forEach((c) => {
          need(`categories.${c}.label`);
          need(`categories.${c}.description`);
        });
        catalog.types.forEach((t) => need(`types.${t.id}`));
        catalog.statuses.forEach((s) => need(`statuses.${s}`));
        catalog.fields.forEach((f) => {
          need(`fields.${f.key}`);
          f.options.forEach((o) => need(`options.${f.key}.${o}`));
        });

        expect(missing, `${module}`).toEqual([]);
      }

      for (const type of WORLD_LINK_TYPES) {
        expect(typeof get(lang, `links.types.${type.id}.forward`)).toBe("string");
        expect(typeof get(lang, `links.types.${type.id}.backward`)).toBe("string");
      }
    }
  });

  it("les champs dépendent de la catégorie, du type et de la nature", () => {
    expect(categoryFields("item", "vehicle").map((f) => f.key)).toContain("speed");
    expect(typeFields("item", "phone", "tech").map((f) => f.key)).toEqual(["phoneNumber", "password", "storedContent"]);

    // Espèce : nom savant ; individu : âge et signes distinctifs.
    const ofSpecies = visibleFieldKeys("species", "mammal", "fauna", "species");
    const ofIndividual = visibleFieldKeys("species", "mammal", "fauna", "individual");
    expect(ofSpecies.has("scientificName")).toBe(true);
    expect(ofSpecies.has("age")).toBe(false);
    expect(ofIndividual.has("age")).toBe(true);
    expect(ofIndividual.has("lifespan")).toBe(false);

    // Basique : description et notes seulement ; avancé : tout.
    expect([...levelFieldKeys("item", "car", "vehicle", null, "basic")].sort()).toEqual(["colorPalette", "description", "notes"]);
    expect(levelFieldKeys("item", "car", "vehicle", null, "advanced").has("registration")).toBe(true);

    // Changer de type n'efface rien : ce qui ne s'applique plus est signalé.
    expect(hiddenFilledKeys("item", { speed: "120 km/h", description: "x" }, "sword", "weapon", null)).toEqual(["speed"]);
  });

  it("seules les catégories choisies sont proposées (toutes si aucun choix)", () => {
    expect(enabledCategories("item", settings(["vehicle", "weapon"]))).toEqual(["weapon", "vehicle"]);
    expect(enabledCategories("species", settings([]))).toEqual(["fauna", "flora"]);
  });
});

describe("fiches", () => {
  it("un brouillon d'espèce a une nature et un statut par défaut", () => {
    expect(emptyWorldDraft("species")).toMatchObject({ nature: "species", status: "common" });
    expect(emptyWorldDraft("species", "", "parent", "individual")).toMatchObject({ nature: "individual", status: "alive" });
    expect(emptyWorldDraft("item")).toMatchObject({ nature: null, status: "intact" });

    const draft = { ...emptyWorldDraft("item", "car"), name: "  Coccinelle ", fields: { speed: " 120 ", inconnu: "x", notes: " " } };
    expect(toWorldInput("item", draft)).toEqual({
      name: "Coccinelle",
      type: "car",
      nature: null,
      parentId: null,
      status: "intact",
      fields: { speed: "120" },
    });
    expect(sameWorldDraft("item", draft, { ...draft, fields: { speed: "120" } })).toBe(true);
  });

  it("arborescence et parents possibles (un individu ne regroupe rien)", () => {
    const wolves = entry("loups");
    const croc = entry("croc", { nature: "individual", parentId: "loups" });
    const sub = entry("sous", { parentId: "loups" });

    const rows = flattenWorldTree(buildWorldTree([croc, sub, wolves]));
    expect(rows.map((row) => [row.entry.id, row.depth])).toEqual([
      ["loups", 0],
      ["croc", 1],
      ["sous", 1],
    ]);

    expect(parentCandidates("species", [wolves, croc, sub], null).map((e) => e.id)).toEqual(["loups", "sous"]);
    // Pas soi-même ni ce qu'on contient.
    expect(parentCandidates("species", [wolves, croc, sub], "loups").map((e) => e.id)).toEqual([]);
  });

  it("onglets", () => {
    expect(worldEntryOfTab(worldTabId("item", "x"))).toEqual({ module: "item", id: "x" });
    expect(worldEntryOfTab(worldTabId("species", "y"))).toEqual({ module: "species", id: "y" });
    expect(worldEntryOfTab("settings:species")).toBeNull();
    expect(worldEntryOfTab("species.list")).toBeNull();
  });
});

describe("liens", () => {
  it("les natures proposées suivent le sens de la fiche", () => {
    const fromCharacter = linkChoices("character", "item");
    expect(fromCharacter).toContainEqual({ type: "owns", forward: true });

    const fromItem = linkChoices("item", "character");
    expect(fromItem).toContainEqual({ type: "owns", forward: false });

    // Personnage ↔ lieu : déjà couvert par les liens personnage – lieu.
    expect(linkChoices("character", "location")).toEqual([]);
  });

  it("un lien se lit depuis chacune de ses deux fiches", () => {
    const link: WorldLink = {
      id: "l",
      ...orientLink({ kind: "item", id: "sword" }, { kind: "character", id: "aldric" }, false),
      type: "owns",
      label: "",
      description: "",
      sinceNode: null,
      untilNode: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(link).toMatchObject({ sourceKind: "character", sourceId: "aldric", targetId: "sword" });
    expect(linksOfEntry([link], "sword")[0]).toMatchObject({ otherId: "aldric", forward: false });
    expect(linksOfEntry([link], "aldric")[0]).toMatchObject({ otherId: "sword", forward: true });
  });
});

describe("barre de gauche", () => {
  it("les modules n'apparaissent qu'une fois activés, après les lieux", () => {
    expect(modulesFor("novel").map((m) => m.id)).not.toContain("items");
    const ids = modulesFor("novel", { item: true, species: true }).map((m) => m.id);
    expect(ids.slice(ids.indexOf("locations"), ids.indexOf("locations") + 3)).toEqual(["locations", "items", "species"]);
    expect(modulesFor("film", { species: true }).map((m) => m.id)).toContain("species");
    expect(modulesFor("film", { species: true }).map((m) => m.id)).not.toContain("items");
  });
});
describe("groupWorldTreeByCategory", () => {
  it("sépare faune et flore, dans l'ordre du catalogue, sans catégorie vide", () => {
    const tree = buildWorldTree([
      entry("chene", { type: "tree", nature: "species" }),
      entry("loup", { type: "mammal" }),
      entry("eclair", { type: "mammal", nature: "individual", parentId: "loup" }),
    ]);
    const groups = groupWorldTreeByCategory("species", tree, []);
    expect(groups.map((g) => [g.category, g.count])).toEqual([
      ["fauna", 2],
      ["flora", 1],
    ]);
    // Un animal précis reste sous son espèce.
    expect(groups[0].nodes[0].children.map((n) => n.entry.id)).toEqual(["eclair"]);
  });

  it("range les objets par catégorie, les types inconnus à la fin", () => {
    const tree = buildWorldTree([
      entry("epee", { type: "sword", nature: null }),
      entry("cle", { type: "key", nature: null }),
      entry("perdu", { type: "custom-supprime", nature: null }),
    ]);
    const groups = groupWorldTreeByCategory("item", tree, []);
    expect(groups.map((g) => g.category)).toEqual(["weapon", "tool", null]);
  });
});
