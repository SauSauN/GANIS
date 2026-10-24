import { describe, expect, it } from "vitest";
import {
  assembleManuscript,
  canHoldText,
  chapterLevel,
  countWords,
  exportFileName,
  goalPercent,
  markdownToHtml,
  narrationReport,
  sceneLevel,
  textToHtml,
  wordTotals,
  type NodeText,
} from "@/lib/novel";
import type { StructureNode } from "@/types";

let clock = 0;
function node(id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode {
  clock += 1;
  const date = `2026-10-17T10:00:${String(clock).padStart(2, "0")}Z`;
  return {
    id, parentId, level, title: id, summary: "", position, numbered: true, number: null,
    contentWords: 0, wordGoal: null, writingStatus: null, narrativePerson: null, narrativeTense: null,
    narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false,
    createdAt: date, updatedAt: date, ...extra,
  };
}

// Partie 1 › Chapitre 1 (scènes 1, 2) › Chapitre 2 (scène 3)
const NODES = [
  node("p1", null, 0, 0),
  node("c2", "p1", 1, 1),
  node("c1", "p1", 1, 0),
  node("s2", "c1", 2, 1),
  node("s1", "c1", 2, 0),
  node("s3", "c2", 2, 0),
];

const text = (html: string, source: NodeText["source"] = "sheet"): NodeText => ({ html, source, words: countWords(html) });

describe("mots", () => {
  it("compte comme un traitement de texte (même règle que Rust)", () => {
    expect(countWords("<p>Léa entra dans la gare.</p><p>Elle aperçut l'homme.</p>")).toBe(8);
    expect(countWords("<p>Peut-être… — non&nbsp;!</p>")).toBe(2);
    expect(countWords("<p>un</p><p>deux</p>")).toBe(2);
    expect(countWords("<p><strong>mot</strong>s collés</p>")).toBe(2);
    expect(countWords("<p></p>")).toBe(0);
  });

  it("additionne scène → chapitre → partie", () => {
    const words: Record<string, number> = { s1: 100, s2: 50, s3: 30 };
    const totals = wordTotals(NODES, (n) => words[n.id] ?? 0);
    expect(totals.get("c1")).toBe(150);
    expect(totals.get("c2")).toBe(30);
    expect(totals.get("p1")).toBe(180);
    expect(goalPercent(150, 3000)).toBe(5);
    expect(goalPercent(3200, 3000)).toBe(107);
    expect(goalPercent(10, null)).toBeNull();
  });
});

describe("niveaux du roman", () => {
  it("scènes = niveau le plus fin, chapitres juste au-dessus", () => {
    expect(sceneLevel(3)).toBe(2);
    expect(chapterLevel(3)).toBe(1);
    expect(chapterLevel(1)).toBe(0);
  });

  it("un chapitre sans scène peut recevoir du texte", () => {
    const nodes = [...NODES, node("c3", "p1", 1, 2)];
    expect(canHoldText(nodes.find((n) => n.id === "c3")!, nodes, 3)).toBe(true);
    expect(canHoldText(nodes.find((n) => n.id === "c1")!, nodes, 3)).toBe(false);
    expect(canHoldText(nodes.find((n) => n.id === "s1")!, nodes, 3)).toBe(true);
  });
});

describe("manuscrit continu", () => {
  it("assemble dans l'ordre du plan, sans titre de scène, avec séparateurs", () => {
    const texts = new Map([
      ["s2", text("<p>Lorsqu'elle s'approcha, l'homme leva les yeux.</p>")],
      ["s1", text("<p>Léa entra dans la gare.</p>")],
      ["s3", text("<p>Il pleuvait.</p>", "documents")],
    ]);
    const entries = assembleManuscript(NODES, 3, texts, (n) => n.title);
    expect(entries.map((e) => (e.kind === "heading" ? `#${e.label}` : `${e.node.id}${e.breakBefore ? "*" : ""}`))).toEqual([
      "#p1", "#c1", "s1", "s2*", "#c2", "s3",
    ]);
    const s3 = entries.find((e) => e.kind === "text" && e.node.id === "s3");
    expect(s3?.kind === "text" && s3.source).toBe("documents");
  });

  it("suit un déplacement dans le plan (aucune copie du texte)", () => {
    const moved = NODES.map((n) => (n.id === "s2" ? { ...n, position: -1 } : n));
    const texts = new Map([["s1", text("<p>A</p>")], ["s2", text("<p>B</p>")]]);
    const ids = assembleManuscript(moved, 3, texts, (n) => n.title).filter((e) => e.kind === "text").map((e) => e.node.id);
    expect(ids).toEqual(["s2", "s1"]);
  });

  it("ignore les scènes vides", () => {
    const entries = assembleManuscript(NODES, 3, new Map([["s1", text("<p></p>")]]), (n) => n.title);
    expect(entries.some((e) => e.kind === "text")).toBe(false);
  });
});

describe("narration", () => {
  it("signale les changements par rapport au choix le plus fréquent", () => {
    const report = narrationReport([
      { id: "a", narrativePerson: "third", narrativeTense: "past" },
      { id: "b", narrativePerson: "third", narrativeTense: "past" },
      { id: "c", narrativePerson: "first", narrativeTense: "present" },
      { id: "d", narrativePerson: null, narrativeTense: null },
    ]);
    expect(report.person).toBe("third");
    expect(report.tense).toBe("past");
    expect([...report.personChanges]).toEqual(["c"]);
    expect([...report.tenseChanges]).toEqual(["c"]);
  });
});

describe("conversions et fichiers", () => {
  it("texte brut et Markdown en paragraphes", () => {
    expect(textToHtml("Un.\n\nDeux <b>.")).toBe("<p>Un.</p><p>Deux &lt;b&gt;.</p>");
    expect(markdownToHtml("# Titre\n\nIl *pensait* à **elle**.")).toBe("<p>Titre</p><p>Il <em>pensait</em> à <strong>elle</strong>.</p>");
  });

  it("noms de fichiers sûrs", () => {
    expect(exportFileName('Mon roman: "brouillon"', "docx")).toBe("Mon roman brouillon.docx");
    expect(exportFileName("", "pdf")).toBe("GANIS.pdf");
  });
});
