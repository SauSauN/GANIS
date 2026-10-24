// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
  PALETTE_KEYS,
  contrastRatio,
  getActiveColorThemeId,
  getThemeRelationColors,
  initColorTheme,
  isHexColor,
  isThemeData,
  paletteToVars,
  readableOn,
  resetColorTheme,
  setActiveColorTheme,
  themeToCss,
} from "@/lib/colorTheme";
import type { ThemeData } from "@/types";

const sample: ThemeData = {
  radius: 0.5,
  light: Object.fromEntries(PALETTE_KEYS.map((k) => [k, "#112233"])) as never,
  dark: Object.fromEntries(PALETTE_KEYS.map((k) => [k, "#AABBCC"])) as never,
};

const styleTag = () => document.getElementById("ganis-color-theme");

beforeEach(() => {
  localStorage.clear();
  styleTag()?.remove();
});

describe("validation", () => {
  it("n'accepte que #RRGGBB", () => {
    expect(isHexColor("#5B65DC")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#000000;}body{")).toBe(false);
  });

  it("vérifie les données complètes d'un thème", () => {
    expect(isThemeData(sample)).toBe(true);
    expect(isThemeData({ ...sample, radius: 9 })).toBe(false);
    expect(isThemeData({ ...sample, dark: { ...sample.dark, primary: "url(x)" } })).toBe(false);
    expect(isThemeData(null)).toBe(false);
  });

  it("accepte des couleurs de relation facultatives, uniquement hexadécimales", () => {
    expect(isThemeData({ ...sample, relations: { love: "#E11D48" } })).toBe(true);
    expect(isThemeData({ ...sample, relations: { love: "red;}" } })).toBe(false);
    expect(isThemeData({ ...sample, relations: ["#E11D48"] })).toBe(false);
  });

  it("les thèmes système sont valides et uniques", () => {
    const ids = BUILTIN_THEMES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const builtin of BUILTIN_THEMES) {
      expect(isThemeData(builtin.theme)).toBe(true);
    }
  });

  it("les thèmes système restent lisibles (texte ≥ 4,5:1)", () => {
    for (const { theme } of BUILTIN_THEMES) {
      for (const p of [theme.light, theme.dark]) {
        expect(contrastRatio(p.foreground, p.background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("feuille de style", () => {
  it("dérive toutes les variables de l'interface", () => {
    const vars = paletteToVars(sample.light);
    expect(vars["--muted"]).toBe("#112233");
    expect(vars["--sidebar-primary"]).toBe("#112233");
    expect(Object.keys(vars)).toContain("--chart-5");
  });

  it("produit :root et .dark avec l'arrondi", () => {
    const css = themeToCss(sample);
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--radius: 0.5rem;");
  });
});

describe("thème actif", () => {
  it("par défaut : aucune surcharge", () => {
    initColorTheme();
    expect(getActiveColorThemeId()).toBe(DEFAULT_THEME_ID);
    expect(styleTag()).toBeNull();
  });

  it("applique et retient un thème système", () => {
    setActiveColorTheme("ganis.foret");
    expect(getActiveColorThemeId()).toBe("ganis.foret");
    expect(styleTag()?.textContent).toContain("#2F7D4F");

    styleTag()?.remove();
    initColorTheme();
    expect(styleTag()?.textContent).toContain("#2F7D4F");
  });

  it("met en cache un thème utilisateur et revient au défaut", () => {
    setActiveColorTheme("uuid-1", sample);
    expect(getActiveColorThemeId()).toBe("uuid-1");
    expect(styleTag()?.textContent).toContain("#AABBCC");

    resetColorTheme();
    expect(getActiveColorThemeId()).toBe(DEFAULT_THEME_ID);
    expect(styleTag()).toBeNull();
  });

  it("refuse un thème utilisateur invalide", () => {
    setActiveColorTheme("uuid-2", { ...sample, radius: -1 });
    expect(getActiveColorThemeId()).toBe(DEFAULT_THEME_ID);
  });

  it("ignore un cache falsifié", () => {
    localStorage.setItem(
      "ganis-color-theme",
      JSON.stringify({ id: "x", theme: { ...sample, light: { ...sample.light, background: "red;}" } } }),
    );
    initColorTheme();
    expect(getActiveColorThemeId()).toBe(DEFAULT_THEME_ID);
    expect(styleTag()).toBeNull();
  });
});

describe("couleurs des relations", () => {
  it("viennent du thème actif, sinon aucune surcharge", () => {
    resetColorTheme();
    expect(getThemeRelationColors()).toEqual({});

    setActiveColorTheme("uuid-rel", { ...sample, relations: { love: "#112233" } });
    const first = getThemeRelationColors();
    expect(first).toEqual({ love: "#112233" });
    // Même objet tant que rien ne change (useSyncExternalStore).
    expect(getThemeRelationColors()).toBe(first);

    resetColorTheme();
    expect(getThemeRelationColors()).toEqual({});
  });
});

describe("contraste", () => {
  it("calcule le rapport WCAG", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("nope", "#FFFFFF")).toBeNull();
  });
});
describe("couleurs d'état lisibles", () => {
  it("chaque thème intégré donne des couleurs d'état à 4,5:1 au moins sur ses fonds", () => {
    for (const theme of BUILTIN_THEMES) {
      for (const mode of ["light", "dark"] as const) {
        const p = theme.theme[mode];
        const vars = paletteToVars(p);
        for (const key of ["--destructive", "--success", "--warning"]) {
          for (const bg of [p.background, p.card, p.secondary]) {
            expect(contrastRatio(vars[key], bg), `${theme.id} ${mode} ${key} sur ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it("une couleur trop pâle d'un thème personnalisé est ajustée sans changer de teinte", () => {
    const fixed = readableOn("#FBBF24", ["#FAFAFD", "#FFFFFF", "#EEEFFD"]);
    expect(contrastRatio(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(readableOn("#B91C1C", ["#FFFFFF"])).toBe("#B91C1C");
    expect(contrastRatio(readableOn("#DC2626", ["#0D1020", "#151A30", "#242A4A"]), "#151A30")).toBeGreaterThanOrEqual(4.5);
  });
});
