import { describe, expect, it } from "vitest";
import { COLUMNS, LINES_PER_PAGE, pagesToPdf, pagesToText, paginate, winAnsi, wrap, type ScreenplayElement } from "@/lib/screenplayLayout";

const labels = { more: "(À SUIVRE)", contd: "(SUITE)" };
const action = (n: number): ScreenplayElement => ({ type: "action", text: Array.from({ length: n }, (_, i) => `Ligne d'action numéro ${i + 1} qui remplit la largeur de la page.`).join("\n") });

describe("découpage des lignes", () => {
  it("coupe aux mots, sans dépasser la colonne", () => {
    const lines = wrap("Le soleil se couche sur quarante miroirs d'eau, et Maëlle tire le sel au las.", 35);
    expect(lines.every((l) => l.length <= 35)).toBe(true);
    expect(lines.join(" ")).toBe("Le soleil se couche sur quarante miroirs d'eau, et Maëlle tire le sel au las.");
    expect(wrap("x".repeat(70), 60)).toEqual(["x".repeat(60), "x".repeat(10)]);
    expect(wrap("a\n\nb", 60)).toEqual(["a", "", "b"]);
  });
});

describe("pagination", () => {
  it("tient 55 lignes par page", () => {
    const pages = paginate([action(30), action(30), action(30)], labels);
    expect(pages.length).toBe(2);
    expect(pages.every((p) => p.length <= LINES_PER_PAGE)).toBe(true);
  });

  it("ne laisse jamais un en-tête seul en bas de page", () => {
    const pages = paginate([action(52), { type: "heading", text: "INT. CUISINE — NUIT", number: "2" }, action(3)], labels);
    expect(pages[0].some((l) => l.text.includes("CUISINE"))).toBe(false);
    expect(pages[1][0]).toMatchObject({ text: "INT. CUISINE — NUIT", number: "2", bold: true });
  });

  it("coupe une longue réplique avec « (À SUIVRE) » et « (SUITE) »", () => {
    const speech = Array.from({ length: 12 }, () => "Une phrase de réplique assez longue pour remplir.").join(" ");
    const pages = paginate([action(46), { type: "dialogue", character: "Léa", parenthetical: "bas", text: speech }], labels);
    expect(pages.length).toBe(2);
    const bottom = pages[0][pages[0].length - 1];
    expect(bottom).toMatchObject({ text: "(À SUIVRE)", indent: COLUMNS.character.indent });
    expect(pages[1][0]).toMatchObject({ text: "LÉA (SUITE)", indent: COLUMNS.character.indent });
    expect(pages[0].some((l) => l.text === "(bas)" && l.indent === COLUMNS.parenthetical.indent)).toBe(true);
  });

  it("une transition ne commence pas une page", () => {
    const pages = paginate([action(54), { type: "transition", text: "cut to:" }], labels);
    expect(pages[1][0].text).not.toBe("CUT TO:");
    expect(pages[1].find((l) => l.text === "CUT TO:")).toMatchObject({ align: "right" });
  });

  it("le texte paginé numérote les pages et encadre les numéros de scène", () => {
    const text = pagesToText(
      paginate([{ type: "heading", text: "EXT. MARAIS — JOUR", number: "12A" }, { type: "action", text: "Elle tire le sel.", revised: true }, action(60)], labels),
      { header: "Révision bleue", titlePage: { title: "Le Sel", lines: ["Scénario"] } },
    );
    expect(text).toMatch(/12A {3}EXT\. MARAIS — JOUR\s+12A/);
    expect(text).toMatch(/Elle tire le sel\.\s+\*/);
    expect(text).toContain("2.");
    expect(text).toContain("Révision bleue");
    expect(text).toContain("LE SEL");
    expect(text.split("\f").length).toBe(3);
  });

  it("remplace ce que Courier ne sait pas écrire", () => {
    expect(winAnsi("Kōmori « déjà » — œuvre… ‘ok’")).toBe("Komori « déjà » — œuvre... 'ok'");
  });
});

describe("PDF", () => {
  it("écrit un PDF en Courier, une page par page du scénario", async () => {
    const pages = paginate([{ type: "heading", text: "INT. PHARE — NUIT", number: "1" }, { type: "dialogue", character: "Gwen", text: "La troisième fume. Kōmori." }, action(80)], labels);
    const pdf = await pagesToPdf(pages, "Le Sel", { titlePage: { title: "Le Sel", lines: ["Scénario"] }, header: "Révision bleue" });
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("/Courier");
    // Une page de titre, puis une page par page du scénario.
    expect(text.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(pages.length + 1);
  }, 30_000);
});

