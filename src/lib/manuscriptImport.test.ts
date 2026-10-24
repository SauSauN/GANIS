// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildPlan, cleanTitle, markdownForImport, planCounts, splitSections, textForImport } from "@/lib/manuscriptImport";

describe("cleanTitle", () => {
  it("retire le mot clé et le numéro", () => {
    expect(cleanTitle("Chapitre 3 — Le départ")).toBe("Le départ");
    expect(cleanTitle("CHAPITRE III")).toBe("");
    expect(cleanTitle("Première partie : Les registres")).toBe("Les registres");
    expect(cleanTitle("Part One")).toBe("");
    expect(cleanTitle("12.")).toBe("");
    expect(cleanTitle("Livreur de nuit")).toBe("Livreur de nuit");
  });
});

describe("splitSections", () => {
  it("repère parties, chapitres, prologue et séparateurs", () => {
    const html =
      "<p>Pour ma mère.</p>" +
      "<p>Prologue</p><p>Il pleuvait.</p>" +
      "<p>PREMIÈRE PARTIE — Les registres</p>" +
      "<p>Chapitre 1 : La lettre</p><p>Un deux.</p><p>* * *</p><p>Trois.</p>" +
      "<p>Chapitre 2</p><p>Partie de chasse ce matin.</p><hr><p>Quatre cinq six.</p>" +
      "<p>Épilogue</p><p>Fin.</p>";
    const sections = splitSections(html);
    expect(sections.map((s) => [s.kind, s.title, s.numbered])).toEqual([
      ["chapter", "", false],
      ["chapter", "Prologue", false],
      ["part", "Les registres", true],
      ["chapter", "La lettre", true],
      ["chapter", "", true],
      ["chapter", "Épilogue", false],
    ]);
    // « Partie de chasse ce matin. » reste du texte.
    expect(sections[4].blocks).toEqual(["<p>Partie de chasse ce matin.</p>", null, "<p>Quatre cinq six.</p>"]);
  });

  it("utilise les titres Word ou Markdown sans mot clé", () => {
    const sections = splitSections(markdownForImport("# Les registres\n\n## La lettre\n\nUn.\n\n***\n\nDeux.\n\n## Le bureau\n\nTrois."));
    expect(sections.map((s) => [s.kind, s.title])).toEqual([
      ["part", "Les registres"],
      ["chapter", "La lettre"],
      ["chapter", "Le bureau"],
    ]);
    expect(sections[1].blocks).toEqual(["<p>Un.</p>", null, "<p>Deux.</p>"]);
  });
});

describe("buildPlan", () => {
  const html =
    "<p>Pour ma mère.</p>" +
    "<p>Partie 1</p><p>Chapitre 1</p><p>Un deux.</p><p>***</p><p>Trois.</p>" +
    "<p>Chapitre 2</p><p>Quatre.</p>";

  it("crée parties, chapitres et scènes", () => {
    const plan = buildPlan(splitSections(html), 3, true, "Début");
    expect(plan.map((n) => [n.level, n.title, n.numbered])).toEqual([
      [1, "Début", false],
      [0, "", true],
    ]);
    expect(plan[0].children[0].content).toBe("<p>Pour ma mère.</p>");
    const chapters = plan[1].children;
    expect(chapters.map((c) => c.children.map((s) => s.content))).toEqual([["<p>Un deux.</p>", "<p>Trois.</p>"], ["<p>Quatre.</p>"]]);
    expect([...planCounts(plan).entries()].sort()).toEqual([[0, 1], [1, 3], [2, 4]]);
  });

  it("sans couper aux séparateurs, et un titre rendu au texte", () => {
    const sections = splitSections(html);
    sections[3].kind = "text"; // « Chapitre 2 » n'est pas un titre
    const plan = buildPlan(sections, 3, false, "Début");
    const chapters = plan[1].children;
    expect(chapters).toHaveLength(1);
    expect(chapters[0].children.map((s) => s.content)).toEqual(["<p>Un deux.</p><p>Trois.</p><p>Chapitre 2</p><p>Quatre.</p>"]);
  });

  it("sans niveau partie, les parties deviennent des chapitres", () => {
    const plan = buildPlan(splitSections(html), 2, true, "Début");
    expect(plan.every((n) => n.level === 0)).toBe(true);
  });
});

describe("lecture", () => {
  it("texte : une ligne par paragraphe", () => {
    expect(textForImport("Chapitre 1\r\nIl <pleuvait>.\n\n")).toBe("<p>Chapitre 1</p><p>Il &lt;pleuvait&gt;.</p>");
  });
});
