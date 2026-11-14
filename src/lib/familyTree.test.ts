import { describe, expect, it } from "vitest";
import { buildFamilyTree, familyOf, ghostAnchor, isGhost, withGhosts } from "@/lib/familyTree";
import type { FamilyLink, Relation } from "@/types";

let n = 0;
const rel = (sourceId: string, targetId: string, familyLink: FamilyLink | null, type: Relation["type"] = "family"): Relation => ({
  id: `r${n++}`,
  sourceId,
  targetId,
  type,
  label: "",
  description: "",
  directed: familyLink === "parent",
  intensity: 3,
  sentiment: "neutral",
  sinceNode: null,
  untilNode: null,
  familyLink,
  createdAt: "x",
  updatedAt: "x",
});

describe("arbre généalogique", () => {
  it("range les générations : grand-père, mère, puis les deux sœurs", () => {
    const tree = buildFamilyTree([
      rel("haruo", "rei", "parent"),
      rel("rei", "sora", "parent"),
      rel("rei", "yuzu", "parent"),
      rel("sora", "yuzu", "sibling"),
    ]);
    expect(tree.generations).toEqual([["haruo"], ["rei"], ["sora", "yuzu"]]);
    expect(tree.parentsOf.get("yuzu")).toEqual(["rei"]);
  });

  it("met un couple sur la même ligne, côte à côte", () => {
    const tree = buildFamilyTree([
      rel("a", "c", "parent"),
      rel("b", "d", "parent"),
      rel("z", "c", "partner"),
    ]);
    // z n'a pas de parent : il rejoint la génération de son conjoint c.
    expect(tree.nodes.get("z")?.generation).toBe(tree.nodes.get("c")?.generation);
    const row = tree.generations[1];
    expect(Math.abs(row.indexOf("z") - row.indexOf("c"))).toBe(1);
  });

  it("ignore les relations qui ne sont pas de famille et liste à part les liens non précisés", () => {
    const tree = buildFamilyTree([rel("a", "b", null), rel("c", "d", null, "friendship"), rel("e", "f", "parent")]);
    expect(tree.others.map((r) => [r.sourceId, r.targetId])).toEqual([["a", "b"]]);
    expect(tree.generations).toEqual([["e"], ["f"]]);
  });

  it("place un petit-enfant deux générations sous son grand-parent, sans les parents", () => {
    const tree = buildFamilyTree([rel("tamaki", "mika", "grandparent")]);
    expect(tree.nodes.get("mika")!.generation - tree.nodes.get("tamaki")!.generation).toBe(2);
    expect(tree.grandparents).toEqual([["tamaki", "mika"]]);
    expect(tree.others).toEqual([]);
  });

  it("met un neveu sous son oncle, et des cousins sur la même ligne", () => {
    const tree = buildFamilyTree([rel("oncle", "neveu", "auntUncle"), rel("neveu", "cousine", "cousin"), rel("x", "cousine", "parent")]);
    expect(tree.nodes.get("neveu")!.generation).toBe(1);
    expect(tree.nodes.get("cousine")!.generation).toBe(tree.nodes.get("neveu")!.generation);
  });

  it("ne boucle pas si un personnage est l'ancêtre de lui-même", () => {
    const tree = buildFamilyTree([rel("a", "b", "parent"), rel("b", "a", "parent")]);
    expect(tree.nodes.size).toBe(2);
  });
});

describe("arbre d'un personnage", () => {
  it("garde toute la famille, et seulement elle", () => {
    const relations = [rel("g", "p", "parent"), rel("p", "x", "parent"), rel("x", "y", "partner"), rel("y", "w", "sibling"), rel("x", "f", null), rel("x", "ami", null, "friendship")];
    expect([...familyOf(relations, "x")].sort()).toEqual(["g", "p", "w", "x", "y"]);
  });

  it("grand-père sans parent mentionné : un parent fantôme entre les deux", () => {
    const tree = buildFamilyTree(withGhosts([rel("g", "x", "grandparent")]));
    expect(tree.generations).toEqual([["g"], ["ghost:x"], ["x"]]);
    expect(tree.grandparents).toEqual([]);
    expect(ghostAnchor("ghost:x")).toEqual({ childId: "x", depth: 1 });
  });

  it("cousin sans parents mentionnés : deux parents fantômes, frères et sœurs, et un grand-parent fantôme", () => {
    const tree = buildFamilyTree(withGhosts([rel("x", "c", "cousin")]));
    expect(tree.cousins).toEqual([]);
    expect(tree.generations.length).toBe(3);
    const [px] = tree.parentsOf.get("x")!;
    const [pc] = tree.parentsOf.get("c")!;
    expect(isGhost(px) && isGhost(pc)).toBe(true);
    expect(tree.parentsOf.get(px)).toEqual(tree.parentsOf.get(pc));
  });

  it("grand-père et cousin : le parent fantôme est partagé", () => {
    const tree = buildFamilyTree(withGhosts([rel("g", "x", "grandparent"), rel("x", "c", "cousin")]));
    expect(tree.parentsOf.get("ghost:x")).toEqual(["g"]);
    expect(tree.parentsOf.get(tree.parentsOf.get("c")![0])).toEqual(["g"]);
  });

  it("oncle connu sans parents : le parent fantôme devient son frère", () => {
    const tree = buildFamilyTree(withGhosts([rel("o", "x", "auntUncle")]));
    expect(tree.auntsUncles).toEqual([]);
    expect(tree.generations).toEqual([["ghost:o"], ["ghost:x", "o"], ["x"]].map((row) => expect.arrayContaining(row)));
  });

  it("parents déjà connus : pas de fantôme, le lien reste direct", () => {
    const relations = withGhosts([rel("m", "x", "parent"), rel("g", "x", "grandparent")]);
    expect(relations.some((r) => isGhost(r.id))).toBe(false);
    expect(buildFamilyTree(relations).grandparents).toEqual([["g", "x"]]);
  });

  it("lien déjà dessiné par les parents : rien n'est ajouté", () => {
    const relations = withGhosts([rel("g", "m", "parent"), rel("m", "x", "parent"), rel("g", "x", "grandparent")]);
    expect(relations.some((r) => isGhost(r.id))).toBe(false);
    expect(buildFamilyTree(relations).grandparents).toEqual([]);
  });
});
