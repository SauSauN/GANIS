import { describe, expect, it } from "vitest";
import {
  RELATION_COLORS,
  RELATION_TYPES,
  circleLayout,
  circularOrder,
  distancesFrom,
  egoLayout,
  forceLayout,
  groupLayout,
  isActiveAt,
  parallelOffsets,
  storyOrder,
} from "./relations";
import fr from "@/i18n/locales/fr/relations.json";
import en from "@/i18n/locales/en/relations.json";
import type { Relation, StructureNode } from "@/types";

const relation = (id: string, sourceId: string, targetId: string, extra: Partial<Relation> = {}): Relation => ({
  id,
  sourceId,
  targetId,
  type: "friendship",
  label: "",
  description: "",
  directed: false,
  intensity: 3,
  sentiment: "neutral",
  sinceNode: null,
  untilNode: null,
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
  ...extra,
});

const node = (id: string, parentId: string | null, level: number, position: number): StructureNode => ({
  id,
  parentId,
  level,
  title: id,
  summary: "",
  position,
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
});

const minDistance = (positions: Record<string, { x: number; y: number }>) => {
  const points = Object.values(positions);
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return min;
};

describe("types de relation", () => {
  it("ont une couleur et un nom dans les deux langues", () => {
    for (const type of RELATION_TYPES) {
      expect(RELATION_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/);
      expect(fr.types[type]).toBeTruthy();
      expect(en.types[type]).toBeTruthy();
    }
  });
});

describe("période", () => {
  const order = storyOrder([node("c2", null, 1, 1), node("c1", null, 1, 0), node("s1", "c1", 2, 0)]);
  const positionOf = new Map(order.map((n, i) => [n.id, i]));

  it("suit l'ordre du récit", () => {
    expect(order.map((n) => n.id)).toEqual(["c1", "s1", "c2"]);
  });

  it("une relation existe entre ses bornes", () => {
    const r = relation("r", "a", "b", { sinceNode: "s1", untilNode: "c2" });

    expect(isActiveAt(r, null, positionOf)).toBe(true);
    expect(isActiveAt(r, 0, positionOf)).toBe(false);
    expect(isActiveAt(r, 1, positionOf)).toBe(true);
    expect(isActiveAt(r, 2, positionOf)).toBe(true);
    expect(isActiveAt(relation("r", "a", "b", { untilNode: "c1" }), 2, positionOf)).toBe(false);
    // Borne supprimée : ignorée.
    expect(isActiveAt(relation("r", "a", "b", { sinceNode: "x" }), 0, positionOf)).toBe(true);
  });
});

describe("dispositions", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "d", target: "e" },
  ];

  it("cercle : tous placés, bien espacés", () => {
    const p = circleLayout(ids);
    expect(Object.keys(p)).toEqual(ids);
    expect(minDistance(p)).toBeGreaterThan(120);
    expect(circleLayout(["seul"])).toEqual({ seul: { x: 0, y: 0 } });
  });

  it("force : déterministe, les personnages liés sont plus proches", () => {
    const p = forceLayout(ids, links);
    expect(forceLayout(ids, links)).toEqual(p);
    expect(minDistance(p)).toBeGreaterThan(60);

    const d = (x: string, y: string) => Math.hypot(p[x].x - p[y].x, p[x].y - p[y].y);
    expect(d("a", "b")).toBeLessThan(d("a", "e"));
  });

  it("groupes : un cercle par groupe, sans chevauchement", () => {
    const { positions, centers } = groupLayout([
      { key: "main", ids: ["a", "b", "c"] },
      { key: "extra", ids: ["d"] },
    ]);
    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c", "d"]);
    expect(Object.keys(centers)).toEqual(["main", "extra"]);
    expect(minDistance(positions)).toBeGreaterThan(100);
  });

  it("centré : distances et anneaux", () => {
    expect(distancesFrom("a", links)).toEqual(new Map([["a", 0], ["b", 1], ["c", 2]]));

    const { positions } = egoLayout("a", ids, links);
    const r = (id: string) => Math.hypot(positions[id].x, positions[id].y);
    expect(positions.a).toEqual({ x: 0, y: 0 });
    expect(r("b")).toBeLessThan(r("c"));
    // Sans lien avec « a » : à l'extérieur.
    expect(r("c")).toBeLessThan(r("e"));
  });

  it("ordre en cercle : les personnages liés sont voisins", () => {
    const order = circularOrder(["a", "x", "b", "y"], [
      { source: "a", target: "b" },
      { source: "x", target: "y" },
      { source: "a", target: "b" },
    ]);
    expect(order).toHaveLength(4);
    expect(Math.abs(order.indexOf("a") - order.indexOf("b"))).toBe(1);
  });

  it("relations multiples entre deux personnages : arcs écartés", () => {
    const offsets = parallelOffsets([
      relation("r1", "a", "b"),
      relation("r2", "b", "a"),
      relation("r3", "a", "c"),
    ]);
    expect(offsets.get("r3")).toBe(0);
    expect(Math.abs(offsets.get("r1")!)).toBe(0.5);
    // Sens opposés, mais arcs de part et d'autre (pas superposés).
    expect(offsets.get("r1")).toBe(offsets.get("r2"));
  });
});
