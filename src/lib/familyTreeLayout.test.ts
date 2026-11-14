import { describe, expect, it } from "vitest";
import { buildFamilyTree } from "@/lib/familyTree";
import { CARD_W, GUTTER, kinOf, layoutFamilyTree } from "@/lib/familyTreeLayout";
import type { FamilyLink, Relation } from "@/types";

let n = 0;
const rel = (sourceId: string, targetId: string, familyLink: FamilyLink): Relation => ({
  id: `r${n++}`,
  sourceId,
  targetId,
  type: "family",
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

describe("mise en place de l'arbre", () => {
  const tree = buildFamilyTree([
    rel("haruo", "rei", "parent"),
    rel("rei", "sora", "parent"),
    rel("kenji", "sora", "parent"),
    rel("rei", "kenji", "partner"),
    rel("rei", "yuzu", "parent"),
    rel("kenji", "yuzu", "parent"),
    rel("haruo", "mika", "grandparent"),
  ]);
  const layout = layoutFamilyTree(tree);

  it("laisse la marge des générations à gauche, sans chevauchement", () => {
    for (const row of tree.generations) {
      const xs = row.map((id) => layout.pos.get(id)!.x).sort((a, b) => a - b);
      expect(xs[0]).toBeGreaterThanOrEqual(GUTTER);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W);
    }
  });

  it("trace un trait par enfant, un par couple, un par lien direct", () => {
    const kinds = layout.lines.map((l) => l.kind).sort();
    expect(kinds).toEqual(["direct", "parent", "parent", "parent", "partner"]);
    expect(layout.lines.find((l) => l.key === "p:sora")!.ids).toEqual(["sora", "rei", "kenji"]);
  });

  it("donne la famille proche : frères et sœurs par les parents communs", () => {
    const kin = kinOf(tree, "sora");
    expect(kin.parents.sort()).toEqual(["kenji", "rei"]);
    expect(kin.siblings).toEqual(["yuzu"]);
    expect(kinOf(tree, "haruo").grandchildren).toEqual(["mika"]);
    expect(kinOf(tree, "rei").partners).toEqual(["kenji"]);
  });
});
