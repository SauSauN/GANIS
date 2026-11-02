// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { layoutsFor, layoutVariant, PAGE_LAYOUTS, panelRects } from "@/lib/mangaLayouts";

describe("modèles de page", () => {
  it("chaque modèle a exactement le nombre de cases annoncé", () => {
    for (const [count, layouts] of Object.entries(PAGE_LAYOUTS)) {
      for (const layout of layouts) {
        expect(panelRects(layout, "ltr")).toHaveLength(Number(count));
      }
    }
  });

  it("aucun modèle pour une page vide, une grille au-delà des modèles", () => {
    expect(layoutsFor(0)).toEqual([]);
    expect(layoutsFor(14)).toHaveLength(1);
    expect(panelRects(layoutsFor(14)[0], "ltr")).toHaveLength(14);
  });

  it("les cases restent dans la page sans se chevaucher", () => {
    for (const count of [...Object.keys(PAGE_LAYOUTS).map(Number), 14]) {
      for (const layout of layoutsFor(count)) {
        const rects = panelRects(layout, "rtl");
        rects.forEach((a, i) => {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.width).toBeLessThanOrEqual(1.000001);
          expect(a.y + a.height).toBeLessThanOrEqual(1.000001);
          rects.slice(i + 1).forEach((b) => {
            const apart = a.x + a.width <= b.x + 1e-9 || b.x + b.width <= a.x + 1e-9 || a.y + a.height <= b.y + 1e-9 || b.y + b.height <= a.y + 1e-9;
            expect(apart).toBe(true);
          });
        });
      }
    }
  });

  it("la première case est à droite pour un manga, à gauche pour une BD", () => {
    const layout = PAGE_LAYOUTS[2][2];
    expect(panelRects(layout, "rtl")[0].x).toBeGreaterThan(panelRects(layout, "rtl")[1].x);
    expect(panelRects(layout, "ltr")[0].x).toBeLessThan(panelRects(layout, "ltr")[1].x);
  });

  it("le choix retombe dans les modèles disponibles quand le nombre de cases change", () => {
    expect(layoutVariant({ p: 2 }, "p", 3)).toBe(2);
    expect(layoutVariant({ p: 2 }, "p", 1)).toBe(0);
    expect(layoutVariant({}, "p", 3)).toBe(0);
    expect(layoutVariant({ p: 2 }, "p", 0)).toBe(0);
  });
});
