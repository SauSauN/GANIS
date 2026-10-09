import { describe, expect, it } from "vitest";
import {
  buildStructureTree,
  countAtLevel,
  countByLevel,
  flattenVisible,
  templateForProjectType,
} from "./structure";
import type { StructureNode } from "@/types";

let clock = 0;

function node(id: string, parentId: string | null, level: number, position: number): StructureNode {
  clock += 1;
  const date = `2026-10-09T10:00:${String(clock).padStart(2, "0")}Z`;

  return { id, parentId, level, title: id, summary: "", position, createdAt: date, updatedAt: date };
}

const NODES = [
  node("c2", "p1", 1, 1),
  node("p1", null, 0, 0),
  node("s1", "c1", 2, 0),
  node("c1", "p1", 1, 0),
  node("p2", null, 0, 1),
  node("orphan", "absent", 2, 5),
];

describe("découpage", () => {
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

  it("compte les éléments pour numéroter et résumer", () => {
    expect(countAtLevel(NODES, "p1", 1)).toBe(2);
    expect(countAtLevel(NODES, null, 0)).toBe(2);
    expect(countByLevel(NODES)).toEqual([2, 2, 2]);
  });

  it("choisit le modèle selon le type de projet", () => {
    expect(templateForProjectType("manga")).toBe("manga");
    expect(templateForProjectType("custom")).toBe("generic");
  });
});
