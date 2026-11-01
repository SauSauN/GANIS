import { describe, expect, it } from "vitest";
import { activeGuide } from "@/lib/treeGuides";

describe("ligne de guidage active", () => {
  const depths = [0, 1, 2, 2, 1, 0, 1];
  const levels = (active: number) => depths.map((_, index) => activeGuide(depths, active)(index));

  it("couvre tout le contenu du dossier de l'élément actif", () => {
    expect(levels(2)).toEqual([null, null, 1, 1, null, null, null]);
    expect(levels(1)).toEqual([null, 0, 0, 0, 0, null, null]);
    expect(levels(6)).toEqual([null, null, null, null, null, null, 0]);
  });

  it("ne marque rien à la racine ni sans élément actif", () => {
    expect(levels(0).every((level) => level === null)).toBe(true);
    expect(levels(-1).every((level) => level === null)).toBe(true);
  });
});
