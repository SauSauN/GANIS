import { describe, expect, it } from "vitest";
import { folderArt, folderPath, moveBefore } from "@/components/gallery/ProjectGalleryBoard";

describe("galerie du projet", () => {
  it("place une image avant une autre, ou à la fin", () => {
    expect(moveBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveBefore(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "a", "c", "d"]);
    expect(moveBefore(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
    // Cible inconnue : rien ne bouge.
    expect(moveBefore(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });

  it("donne le chemin d'un dossier depuis la racine", () => {
    const folders = [
      { id: "cartes", parentId: null, name: "Cartes" },
      { id: "nord", parentId: "cartes", name: "Le Nord" },
      // Boucle (impossible côté Rust) : le chemin s'arrête quand même.
      { id: "x", parentId: "y", name: "X" },
      { id: "y", parentId: "x", name: "Y" },
    ];
    expect(folderPath(folders, "nord")).toEqual(["Cartes", "Le Nord"]);
    expect(folderPath(folders, null)).toEqual([]);
    expect(folderPath(folders, "x")).toEqual(["Y", "X"]);
  });

  it("génère l'image d'un dossier à partir de son nom", () => {
    // Toujours la même pour un même nom (sans tenir compte des majuscules ni des espaces autour).
    expect(folderArt("Cartes")).toEqual(folderArt("  cartes "));
    // Différente pour un autre nom.
    expect(folderArt("Cartes")).not.toEqual(folderArt("Personnages"));
    // Des formes dans le carré de 100 × 100, des couleurs valides.
    const { hue, shapes } = folderArt("Le Nord");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(shapes).toHaveLength(4);
    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.x).toBeLessThanOrEqual(100);
      expect(shape.opacity).toBeLessThanOrEqual(1);
    }
  });
});
