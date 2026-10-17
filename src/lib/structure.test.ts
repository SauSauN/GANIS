import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  defaultLevelColor,
  nodeColor,
  buildStructureTree,
  descendantIdsOf,
  nodeLinks,
  structureNodeIdOfTab,
  structureNodeTabId,
  countByLevel,
  flattenVisible,
  formatNumber,
  levelsExample,
  levelsToInput,
  nodeHeading,
  numberNodes,
  resolveLevels,
  templateForProjectType,
  type ResolvedLevel,
} from "./structure";
import type { Structure, StructureLevel, StructureNode, StructureNumbering } from "@/types";

let clock = 0;

function node(
  id: string,
  parentId: string | null,
  level: number,
  position: number,
  extra: Partial<StructureNode> = {},
): StructureNode {
  clock += 1;
  const date = `2026-10-09T10:00:${String(clock).padStart(2, "0")}Z`;

  return { id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null, narrativePerson: null, narrativeTense: null, createdAt: date, updatedAt: date, ...extra };
}

function level(one: string, numbering: StructureNumbering, start = 1, digits = 1): ResolvedLevel {
  return { id: one, one, other: `${one}s`, numbering, start, digits, color: "#123456" };
}

const NODES = [
  node("c2", "p1", 1, 1),
  node("p1", null, 0, 0),
  node("s1", "c1", 2, 0),
  node("c1", "p1", 1, 0),
  node("p2", null, 0, 1),
  node("orphan", "absent", 2, 5),
];

/** Roman : deux parties, chapitres continus, scènes par chapitre. */
const NOVEL = [
  node("p1", null, 0, 0),
  node("prologue", "p1", 1, 0, { title: "Prologue", numbered: false }),
  node("c1", "p1", 1, 1, { title: "Le départ" }),
  node("c1s1", "c1", 2, 0),
  node("c1s2", "c1", 2, 1),
  node("c2", "p1", 1, 2),
  node("c2s1", "c2", 2, 0),
  node("p2", null, 0, 1),
  node("c3", "p2", 1, 0),
  node("c3s1", "c3", 2, 0),
  node("epilogue", null, 1, 2, { title: "Épilogue", numbered: false }),
];

const NOVEL_LEVELS = [level("Partie", "continuous"), level("Chapitre", "continuous"), level("Scène", "perParent")];

describe("découpage : arbre", () => {
  it("reconstruit l'arbre trié, avec profondeur et descendants", () => {
    const roots = buildStructureTree(NODES);

    expect(roots.map((n) => n.id)).toEqual(["p1", "p2", "orphan"]);
    expect(roots[0].children.map((n) => n.id)).toEqual(["c1", "c2"]);
    expect(roots[0].descendants).toBe(3);
    expect(roots[0].children[0].children[0]).toMatchObject({ id: "s1", depth: 2 });
  });

  it("respecte les éléments repliés", () => {
    const roots = buildStructureTree(NODES);

    expect(flattenVisible(roots, new Set()).map((n) => n.id)).toEqual([
      "p1", "c1", "s1", "c2", "p2", "orphan",
    ]);
    expect(flattenVisible(roots, new Set(["p1"])).map((n) => n.id)).toEqual([
      "p1", "p2", "orphan",
    ]);
  });

  it("compte les éléments de chaque niveau", () => {
    expect(countByLevel(NODES, 3)).toEqual([2, 2, 2]);
    // Élément plus profond que le dernier niveau : compté dans le dernier.
    expect(countByLevel(NODES, 2)).toEqual([2, 4]);
  });

  it("choisit le modèle selon le type de projet", () => {
    expect(templateForProjectType("manga")).toBe("manga");
    expect(templateForProjectType("custom")).toBe("generic");
  });
});

describe("découpage : numérotation", () => {
  it("numérote en continu ou par parent, en sautant les éléments hors numérotation", () => {
    const numbers = numberNodes(NOVEL, NOVEL_LEVELS);
    const get = (id: string) => numbers.get(id);

    expect([get("p1"), get("p2")]).toEqual([1, 2]);
    // Chapitres continus d'une partie à l'autre ; le prologue ne compte pas.
    expect([get("prologue"), get("c1"), get("c2"), get("c3"), get("epilogue")]).toEqual([
      undefined, 1, 2, 3, undefined,
    ]);
    // Scènes : repartent à 1 dans chaque chapitre.
    expect([get("c1s1"), get("c1s2"), get("c2s1"), get("c3s1")]).toEqual([1, 2, 1, 1]);
  });

  it("suit l'ordre du plan : un déplacement renumérote", () => {
    const moved = NOVEL.map((n) => (n.id === "c2" ? { ...n, position: -1 } : n));
    const numbers = numberNodes(moved, NOVEL_LEVELS);

    expect([numbers.get("c2"), numbers.get("c1")]).toEqual([1, 2]);
  });

  it("applique le premier numéro, le format et l'absence de numéro", () => {
    const levels = [level("Tome", "none"), level("Chapitre", "perParent", 0, 2), level("Page", "continuous", 10)];
    const numbers = numberNodes(NOVEL, levels);

    expect(numbers.has("p1")).toBe(false);
    // Repart dans chaque tome, à partir de 0.
    expect([numbers.get("c1"), numbers.get("c2"), numbers.get("c3")]).toEqual([0, 1, 0]);
    // Pages continues à partir de 10.
    expect([numbers.get("c1s1"), numbers.get("c1s2"), numbers.get("c2s1"), numbers.get("c3s1")]).toEqual([10, 11, 12, 13]);

    expect(nodeHeading(NOVEL[2], levels, numbers)).toEqual({
      prefix: "Chapitre 00",
      number: "00",
      title: "Le départ",
      label: "Chapitre 00 — Le départ",
    });
  });

  it("nomme les éléments numérotés, sans titre et hors numérotation", () => {
    const numbers = numberNodes(NOVEL, NOVEL_LEVELS);
    const label = (id: string) => nodeHeading(NOVEL.find((n) => n.id === id)!, NOVEL_LEVELS, numbers).label;

    expect(label("c1")).toBe("Chapitre 1 — Le départ");
    expect(label("c2")).toBe("Chapitre 2");
    expect(label("prologue")).toBe("Prologue");
    expect(nodeHeading({ id: "x", level: 1, title: " " }, NOVEL_LEVELS, new Map()).label).toBe("Chapitre");
    // Plus profond que le dernier niveau : nom du dernier niveau.
    expect(nodeHeading({ id: "x", level: 7, title: "" }, NOVEL_LEVELS, new Map()).label).toBe("Scène");
  });

  it("affiche les numéros enregistrés quand la numérotation n'est pas automatique", () => {
    const stored = NOVEL.map((n) => ({ ...n, number: n.id === "c2" ? 7 : n.id === "c1" ? 1 : null }));
    const numbers = numberNodes(stored, NOVEL_LEVELS, false);

    expect(numbers.get("c1")).toBe(1);
    expect(numbers.get("c2")).toBe(7);
    // Sans numéro enregistré, ou hors numérotation : pas de numéro.
    expect(numbers.has("c3")).toBe(false);
    expect(numberNodes(stored.map((n) => ({ ...n, numbered: false })), NOVEL_LEVELS, false).size).toBe(0);
    expect(numberNodes(stored, [level("P", "none"), level("C", "none"), level("S", "none")], false).size).toBe(0);
  });

  it("met en forme les numéros et l'aperçu", () => {
    expect(formatNumber(3, 1)).toBe("3");
    expect(formatNumber(3, 3)).toBe("003");
    expect(formatNumber(1234, 2)).toBe("1234");
    expect(levelsExample([level("Kkhkk", "continuous"), level("Arc", "none"), level("Page", "perParent", 1, 2)])).toBe(
      "Kkhkk 1 › Arc › Page 01",
    );
  });
});

describe("découpage : niveaux", () => {
  const templateLevel = (index: number, numbering: StructureNumbering): StructureLevel => ({
    id: String(index),
    one: null,
    other: null,
    numbering,
    start: 1,
    digits: 1,
    color: null,
  });

  it("donne les noms du modèle aux niveaux non personnalisés", () => {
    const structure: Structure = {
      template: "novel",
      templateChosen: false,
      levelsCustom: false,
      manuscriptGoal: null,
      autoNumbering: true,
      levels: [templateLevel(0, "continuous"), templateLevel(1, "continuous")],
      nodes: [],
    };
    const names = ["Partie", "Chapitre"];
    const resolved = resolveLevels(structure, (_template, index, form) => `${names[index]}${form === "other" ? "s" : ""}`);

    expect(resolved.map((l) => [l.one, l.other])).toEqual([["Partie", "Parties"], ["Chapitre", "Chapitres"]]);
    expect(levelsToInput(resolved)[0]).toEqual({
      id: "0",
      one: "Partie",
      other: "Parties",
      numbering: "continuous",
      start: 1,
      digits: 1,
      color: defaultLevelColor(0),
    });
    // Couleur par défaut différente pour chaque niveau.
    expect(resolved[0].color).not.toBe(resolved[1].color);
  });

  it("garde les noms personnalisés", () => {
    const structure: Structure = {
      template: "novel",
      templateChosen: false,
      levelsCustom: true,
      manuscriptGoal: null,
      autoNumbering: true,
      levels: [{ ...templateLevel(0, "none"), id: "a", one: "Kkhkk", other: null }],
      nodes: [],
    };

    expect(resolveLevels(structure, () => "modèle")[0]).toMatchObject({ one: "Kkhkk", other: "Kkhkk" });
  });
});

describe("découpage : fiche d'un élément", () => {
  it("fait l'aller-retour entre élément et onglet", () => {
    expect(structureNodeIdOfTab(structureNodeTabId("c1"))).toBe("c1");
    expect(structureNodeIdOfTab("location:c1")).toBeNull();
  });

  it("trouve les parents et le contenu", () => {
    expect(ancestorsOf(NOVEL, "c1s2").map((n) => n.id)).toEqual(["p1", "c1"]);
    expect(ancestorsOf(NOVEL, "p1")).toEqual([]);
    expect([...descendantIdsOf(NOVEL, "p1")].sort()).toEqual(["c1", "c1s1", "c1s2", "c2", "c2s1", "prologue"].sort());
    expect(descendantIdsOf(NOVEL, "c3s1").size).toBe(0);
  });

  it("rassemble les fiches liées directement puis celles du contenu", () => {
    const at = "2026-10-11T00:00:00Z";
    const links = {
      characters: [
        { nodeId: "c1", characterId: "mira", role: "pov" as const, createdAt: at },
        { nodeId: "c1s2", characterId: "aldric", role: "present" as const, createdAt: at },
        { nodeId: "c1s1", characterId: "aldric", role: "present" as const, createdAt: at },
        { nodeId: "c1s1", characterId: "mira", role: "present" as const, createdAt: at },
        { nodeId: "c3s1", characterId: "orvel", role: "present" as const, createdAt: at },
      ],
      locations: [{ nodeId: "c2s1", locationId: "valona", role: "setting" as const, createdAt: at }],
    };

    const chapter = nodeLinks(NOVEL, links, "c1");
    expect(chapter.characters.direct.map((l) => l.characterId)).toEqual(["mira"]);
    // Aldric est dans les scènes 1 et 2 (dans l'ordre du plan) ; Mira, déjà
    // liée directement, n'est pas répétée ; Orvel est ailleurs.
    expect(chapter.characters.indirect).toEqual([{ id: "aldric", nodeIds: ["c1s1", "c1s2"] }]);

    const part = nodeLinks(NOVEL, links, "p1");
    expect(part.characters.indirect.map((m) => m.id)).toEqual(["mira", "aldric"]);
    expect(part.locations.indirect).toEqual([{ id: "valona", nodeIds: ["c2s1"] }]);
  });
});

describe("découpage : couleurs", () => {
  it("donne à chaque élément la couleur de son niveau", () => {
    const levels = [level("Partie", "continuous"), { ...level("Chapitre", "continuous"), color: "#00ff00" }];

    expect(nodeColor({ level: 1 }, levels)).toBe("#00ff00");
    // Plus profond que le dernier niveau : la couleur du dernier.
    expect(nodeColor({ level: 5 }, levels)).toBe("#00ff00");
    expect(defaultLevelColor(5)).toBe(defaultLevelColor(0));
  });
});