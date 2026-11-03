// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { layoutsFor, layoutVariant, PAGE_HEIGHT, PAGE_LAYOUTS, PAGE_WIDTH, panelShapes } from "@/lib/mangaLayouts";

type Points = ReadonlyArray<readonly [number, number]>;

const areaOf = (points: Points) =>
  Math.abs(points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;

/** Deux polygones convexes sont-ils séparés par l'un de leurs bords ? */
function separated(a: Points, b: Points): boolean {
  return [a, b].some((shape) =>
    shape.some(([x, y], i) => {
      const [nx, ny] = shape[(i + 1) % shape.length];
      const [ex, ey] = [ny - y, x - nx];
      const project = (points: Points) => points.map(([px, py]) => px * ex + py * ey);
      return Math.max(...project(a)) <= Math.min(...project(b)) + 1e-6 || Math.max(...project(b)) <= Math.min(...project(a)) + 1e-6;
    }),
  );
}

const ALL_COUNTS = [...Object.keys(PAGE_LAYOUTS).map(Number), 11, 12, 14, 30];

describe("modèles de page", () => {
  it("chaque modèle a exactement le nombre de cases annoncé", () => {
    for (const count of ALL_COUNTS) {
      for (const layout of layoutsFor(count)) expect(panelShapes(layout, "ltr")).toHaveLength(count);
    }
  });

  it("aucun modèle pour une page vide", () => {
    expect(layoutsFor(0)).toEqual([]);
  });

  it("chaque case reste dans la page, avec assez de place", () => {
    for (const count of ALL_COUNTS) {
      for (const layout of layoutsFor(count)) {
        for (const { points } of panelShapes(layout, "rtl")) {
          expect(areaOf(points)).toBeGreaterThan(count > 10 ? 150 : 400);
          for (const [x, y] of points) {
            expect(x).toBeGreaterThanOrEqual(-1e-6);
            expect(x).toBeLessThanOrEqual(PAGE_WIDTH + 1e-6);
            expect(y).toBeGreaterThanOrEqual(-1e-6);
            expect(y).toBeLessThanOrEqual(PAGE_HEIGHT + 1e-6);
          }
        }
      }
    }
  });

  it("les cases ne se chevauchent pas, sauf les cases incrustées", () => {
    for (const count of ALL_COUNTS) {
      for (const layout of layoutsFor(count)) {
        const shapes = panelShapes(layout, "ltr").filter((shape) => !shape.inset);
        shapes.forEach((a, i) => shapes.slice(i + 1).forEach((b) => expect(separated(a.points, b.points)).toBe(true)));
      }
    }
  });

  it("le centre de chaque case tombe dans sa case", () => {
    for (const count of ALL_COUNTS) {
      for (const layout of layoutsFor(count)) {
        for (const { points, center: [x, y] } of panelShapes(layout, "rtl")) {
          expect(x).toBeGreaterThan(Math.min(...points.map((p) => p[0])));
          expect(x).toBeLessThan(Math.max(...points.map((p) => p[0])));
          expect(y).toBeGreaterThan(Math.min(...points.map((p) => p[1])));
          expect(y).toBeLessThan(Math.max(...points.map((p) => p[1])));
        }
      }
    }
  });

  it("une case incrustée ne cache pas le numéro de la case du dessous", () => {
    for (const count of ALL_COUNTS) {
      for (const layout of layoutsFor(count)) {
        const shapes = panelShapes(layout, "ltr");
        shapes.forEach((shape, index) => {
          if (!shape.inset) return;
          expect(shapes[index - 1].center[1]).toBeLessThan(Math.min(...shape.points.map((p) => p[1])));
        });
      }
    }
  });

  it("les planches ne sont pas que des rectangles", () => {
    for (let count = 2; count <= 10; count++) {
      for (const layout of layoutsFor(count)) {
        const slanted = panelShapes(layout, "ltr").some(({ points }) =>
          points.some(([x, y], i) => {
            const [nx, ny] = points[(i + 1) % points.length];
            return Math.abs(x - nx) > 0.5 && Math.abs(y - ny) > 0.5;
          }),
        );
        expect(slanted).toBe(true);
      }
    }
  });

  it("la première case est à droite pour un manga, à gauche pour une BD", () => {
    const layout = PAGE_LAYOUTS[2][1];
    const centerX = (direction: "rtl" | "ltr", index: number) => panelShapes(layout, direction)[index].center[0];
    expect(centerX("rtl", 0)).toBeGreaterThan(centerX("rtl", 1));
    expect(centerX("ltr", 0)).toBeLessThan(centerX("ltr", 1));
  });

  it("le choix retombe dans les modèles disponibles quand le nombre de cases change", () => {
    expect(layoutVariant({ p: 2 }, "p", 3)).toBe(2);
    expect(layoutVariant({ p: 2 }, "p", 2)).toBe(0);
    expect(layoutVariant({}, "p", 3)).toBe(0);
    expect(layoutVariant({ p: 2 }, "p", 0)).toBe(0);
  });
});
