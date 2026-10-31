import { describe, expect, it } from "vitest";
import {
  assignArt,
  buildScriptExport,
  draftFromScript,
  draftSignature,
  duplicatePanel,
  inputFromDraft,
  isTurnMisplaced,
  moveItem,
  pagesByVolume,
  pagesInOrder,
  panelsByPage,
  panelVolume,
  pageVolume,
  spreadsOf,
  textStats,
  type ScriptExportLabels,
} from "@/lib/manga";
import { documentToText } from "@/lib/novelExport";
import type { Character, Location, Panel, StructureDocument, StructureNode } from "@/types";

const date = "2026-10-19T00:00:00Z";
const node = (id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode => ({
  id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null,
  narrativePerson: null, narrativeTense: null, narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false,
  createdAt: date, updatedAt: date, ...extra,
});
const panel = (id: string, pageId: string, position: number, extra: Partial<Panel> = {}): Panel => ({
  id, pageId, position, action: "", framing: "", setting: "", artistNotes: "", rhythm: null, locationId: null, moment: "", continuity: "",
  characters: [], texts: [], createdAt: date, updatedAt: date, ...extra,
});

describe("comptes et alertes", () => {
  it("compte les mots par type et repère les cases chargées ou muettes", () => {
    const stats = textStats([
      { kind: "dialogue", content: "Il y a quelqu'un ?" },
      { kind: "sfx", content: "GRIIIN" },
      { kind: "narration", content: "  " },
    ]);
    expect(stats).toMatchObject({ words: 5, texts: 2 });
    expect(stats.byKind.dialogue).toBe(4);
    const settings = { panelWordsMax: 4, pageWordsMax: 10 };
    expect(panelVolume(stats, settings)).toBe("high");
    expect(panelVolume(textStats([]), settings)).toBe("empty");
    expect(pageVolume(stats, settings)).toBe("ok");
    expect(panelVolume(stats, { panelWordsMax: null, pageWordsMax: null })).toBe("ok");
  });
});

describe("ordre des pages", () => {
  it("suit le plan et retrouve le chapitre de chaque page", () => {
    const nodes = [node("t1", null, 0, 0), node("c2", "t1", 1, 1), node("c1", "t1", 1, 0), node("p2", "c1", 2, 1), node("p1", "c1", 2, 0), node("p3", "c2", 2, 0)];
    const entries = pagesInOrder(nodes, 3);
    expect(entries.map((e) => [e.page.id, e.chapter?.id])).toEqual([["p1", "c1"], ["p2", "c1"], ["p3", "c2"]]);
    const byPage = panelsByPage([panel("b", "p1", 1), panel("a", "p1", 0)]);
    expect(byPage.get("p1")!.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("chemin de fer", () => {
  const doc = (id: string, nodeId: string, name: string, mime: string) => ({ id, nodeId, name, mime }) as StructureDocument;

  it("regroupe les pages par tome", () => {
    const nodes = [node("t1", null, 0, 0), node("t2", null, 0, 1), node("c1", "t1", 1, 0), node("c2", "t2", 1, 0), node("p1", "c1", 2, 0), node("p2", "c2", 2, 0)];
    expect(pagesByVolume(nodes, 3).map((g) => [g.volume?.id, g.entries.map((e) => e.page.id)])).toEqual([["t1", ["p1"]], ["t2", ["p2"]]]);
    expect(pagesByVolume([node("c1", null, 0, 0), node("p1", "c1", 1, 0)], 2).map((g) => g.volume)).toEqual([null]);
  });

  it("forme les planches selon la parité du premier folio", () => {
    const pages = (first: number, count: number) => Array.from({ length: count }, (_, i) => ({ folio: first + i }));
    const shape = (first: number, count: number) => spreadsOf(pages(first, count)).map((s) => [s.first?.folio ?? null, s.second?.folio ?? null]);
    expect(shape(1, 4)).toEqual([[null, 1], [2, 3], [4, null]]);
    expect(shape(2, 3)).toEqual([[2, 3], [4, null]]);
    expect(shape(1, 0)).toEqual([]);
  });

  it("signale une révélation qui ne tombe pas au tourné de page", () => {
    const flagged = node("p", null, 2, 0, { pageTurn: true });
    expect(isTurnMisplaced({ folio: 4, page: flagged })).toBe(true);
    expect(isTurnMisplaced({ folio: 5, page: flagged })).toBe(false);
    expect(isTurnMisplaced({ folio: 4, page: node("q", null, 2, 0) })).toBe(false);
  });

  it("attribue les dessins : ceux de la page, puis ceux du chapitre dans l'ordre", () => {
    const nodes = [node("c1", null, 1, 0), node("p1", "c1", 2, 0), node("p2", "c1", 2, 1), node("p3", "c1", 2, 2)];
    const documents = new Map([
      ["p1", [doc("source", "p1", "p1.psd", "image/vnd.adobe.photoshop"), doc("png", "p1", "p1.png", "image/png")]],
      ["p3", [doc("seul", "p3", "p3.clip", "application/x-clip-studio"), doc("note", "p3", "note.pdf", "application/pdf")]],
      ["c1", [doc("a", "c1", "a.jpg", "image/jpeg"), doc("b", "c1", "b.jpg", "image/jpeg"), doc("pdf", "c1", "x.pdf", "application/pdf")]],
    ]);
    const { art, unplaced } = assignArt(pagesInOrder(nodes, 3), documents);
    expect([art.get("p1")?.id, art.get("p2")?.id, art.get("p3")?.id]).toEqual(["png", "a", "seul"]);
    expect(unplaced).toBe(1);
  });
});

describe("brouillon", () => {
  it("aller-retour, copie et déplacement", () => {
    const script = {
      page: node("p1", null, 2, 0, { rhythm: "reveal", pageTurn: true }),
      panels: [panel("a", "p1", 0, { action: "Porte.", texts: [{ id: "t", kind: "dialogue", characterId: "lea", content: "Allô ?" }] })],
    };
    const draft = draftFromScript(script);
    const input = inputFromDraft(draft, "Page 1");
    expect(input).toMatchObject({ rhythm: "reveal", pageTurn: true, pageLabel: "Page 1" });
    expect(input.panels[0]).toMatchObject({ id: "a", action: "Porte.", texts: [{ id: "t", kind: "dialogue", characterId: "lea", content: "Allô ?" }] });
    const copy = duplicatePanel(draft.panels[0]);
    expect(copy.id).toBeUndefined();
    expect(copy.texts[0].id).toBeUndefined();
    const before = draftSignature(draft);
    expect(draftSignature({ ...draft, panels: [...draft.panels, copy] })).not.toBe(before);
    expect(draftSignature(draftFromScript(script))).toBe(before);
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});

describe("export pour le dessinateur", () => {
  it("chapitres, pages, cases numérotées, personnages, textes", () => {
    const nodes = [node("c1", null, 1, 0, { title: "Le départ", narrativeGoal: "Présenter Léa." }), node("p1", "c1", 2, 0, { pageTurn: true })];
    const lea = { id: "lea", firstName: "Léa", lastName: "", fields: { description: "Archiviste." } } as unknown as Character;
    const lieu = { id: "l1", name: "Le phare", fields: {} } as unknown as Location;
    const panels = panelsByPage([
      panel("a", "p1", 0, {
        action: "Léa entre.",
        framing: "wide",
        locationId: "l1",
        moment: "Aube",
        characters: [{ characterId: "lea", state: "bras bandé" }],
        texts: [
          { id: "t1", kind: "dialogue", characterId: "lea", content: "Il y a quelqu'un ?" },
          { id: "t2", kind: "sfx", characterId: null, content: "GRIIIN" },
        ],
      }),
    ]);
    const labels: ScriptExportLabels = {
      subtitle: "Scénario", cast: "Personnages", places: "Lieux",
      pageHeading: (label, n) => `${label} — ${n} case(s)`, panelHeading: (n, f) => [`Case ${n}`, f].filter(Boolean).join(" — "),
      goal: "Objectif :", rhythm: (v) => `Fonction : ${v}`, pageTurn: "Révélation après le tourné de page", setting: "Décor :", place: "Lieu :",
      characters: "Personnages :", notes: "Pour le dessinateur :", continuity: "Continuité :",
      textLabel: (kind, speaker) => (kind === "dialogue" ? `${speaker.toUpperCase()} :` : "ONOMATOPÉE :"),
      framing: () => "Plan large", rhythmName: (v) => v, noPanels: "(aucune case)",
    };
    const doc = buildScriptExport({
      project: { name: "Valombre" },
      entries: pagesInOrder(nodes, 3),
      panels,
      labelOf: (n) => (n.id === "c1" ? "Chapitre 1 — Le départ" : "Page 1"),
      characters: [lea],
      locations: [lieu],
      nameOf: (c) => c.firstName,
      includeCast: true,
      labels,
    });
    const text = documentToText(doc);
    expect(doc.layout).toBe("script");
    expect(text).toContain("Léa — Archiviste.");
    expect(text).toContain("Le phare");
    expect(text).toContain("CHAPITRE 1 — LE DÉPART");
    expect(text).toContain("Objectif : Présenter Léa.");
    expect(text).toContain("Page 1 — 1 case(s)");
    expect(text).toContain("Révélation après le tourné de page");
    expect(text).toContain("Case 1 — Plan large");
    expect(text).toContain("    Lieu : Le phare — Aube");
    expect(text).toContain("    Personnages : Léa (bras bandé)");
    expect(text).toContain("        LÉA : Il y a quelqu'un ?");
    expect(text).toContain("        ONOMATOPÉE : GRIIIN");
  });
});
