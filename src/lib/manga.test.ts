import { describe, expect, it } from "vitest";
import {
  assignArt,
  buildScriptExport,
  draftFromScript,
  draftSignature,
  duplicatePanel,
  extrasOfVolume,
  isExtraItem,
  inputFromDraft,
  isTurnMisplaced,
  moveItem,
  pagesByVolume,
  pagesInOrder,
  panelsByPage,
  panelVolume,
  pageVolume,
  productionPercent,
  readingOrder,
  spreadsOf,
  stageCounts,
  textStats,
  volumeSequence,
  type ScriptExportLabels,
} from "@/lib/manga";
import { documentToText } from "@/lib/novelExport";
import type { Character, ExtraPageKind, Location, MangaExtraPage, Panel, StructureDocument, StructureNode } from "@/types";

const date = "2026-10-19T00:00:00Z";
const node = (id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode => ({
  id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null,
  narrativePerson: null, narrativeTense: null, narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false, productionStage: null, logline: "", runtimeGoal: null, episodeStatus: null, writer: "", scenePlace: null, sceneLocationId: null, sceneTime: null,
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
    const entries = pagesInOrder(nodes, 3);
    const assigned = assignArt(entries, documents);
    const { art, unplaced } = assigned;
    expect([art.get("p1")?.id, art.get("p2")?.id, art.get("p3")?.id]).toEqual(["png", "a", "seul"]);
    expect(unplaced.map((d) => d.id)).toEqual(["b"]);
    // Lecteur : les images dans l'ordre des pages (sans le fichier source).
    expect(readingOrder(entries, assigned).map((d) => d.id)).toEqual(["png", "a", "b"]);
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

const extra = (id: string, kind: ExtraPageKind, placement: "front" | "back", position: number, volumeId: string | null = "t1"): MangaExtraPage => ({
  id, volumeId, placement, position, kind, title: "", notes: "", productionStage: null, hasArt: false, artUpdatedAt: null, createdAt: date, updatedAt: date,
});

describe("fabrication et pages hors récit", () => {
  const extras = [
    extra("bonus", "bonus", "back", 0),
    extra("titre", "title", "front", 0),
    extra("couv", "cover", "front", 1),
    extra("credits", "credits", "front", 2),
    extra("4e", "backCover", "back", 1),
    extra("autre-tome", "title", "front", 0, "t2"),
  ];

  it("range les pages hors récit d'un tome et met les couvertures à part", () => {
    const volume = extrasOfVolume(extras, "t1");
    expect(volume.cover?.id).toBe("couv");
    expect(volume.backCover?.id).toBe("4e");
    expect(volume.front.map((e) => e.id)).toEqual(["titre", "credits"]);
    expect(volume.back.map((e) => e.id)).toEqual(["bonus"]);
    expect(extrasOfVolume(extras, null).front).toEqual([]);
  });

  it("numérote les pages intérieures dans l'ordre d'impression, couvertures exclues", () => {
    const nodes = [node("c1", null, 1, 0), node("p1", "c1", 2, 0), node("p2", "c1", 2, 1)];
    const items = volumeSequence(pagesInOrder(nodes, 3), extrasOfVolume(extras, "t1"), 3);
    expect(items.map((item) => (isExtraItem(item) ? item.extra.id : item.page.id))).toEqual(["titre", "credits", "p1", "p2", "bonus"]);
    expect(items.map((item) => item.folio)).toEqual([3, 4, 5, 6, 7]);
    // Les planches tiennent compte des pages hors récit.
    expect(spreadsOf(items)[0].first).toBeNull();
  });

  it("compte les étapes et l'avancement", () => {
    const counts = stageCounts([null, "done", "inks", "done"]);
    expect(counts).toMatchObject({ none: 1, done: 2, inks: 1, pencils: 0 });
    expect(productionPercent([])).toBe(0);
    expect(productionPercent(["done", "done"])).toBe(100);
    expect(productionPercent([null, "inks"])).toBe(25);
  });

  it("exporte un tome avec ses folios et ses pages hors récit", () => {
    const nodes = [node("c1", null, 1, 0), node("p1", "c1", 2, 0)];
    const entries = pagesInOrder(nodes, 3);
    const volumeExtras = extrasOfVolume([{ ...extra("titre", "title", "front", 0), notes: "Logo centré." }, extra("couv", "cover", "front", 1), extra("bonus", "bonus", "back", 0)], "t1");
    const items = volumeSequence(entries, volumeExtras, 1);
    const labels: ScriptExportLabels = {
      subtitle: "Scénario", cast: "", places: "", pageHeading: (label) => label, panelHeading: (n) => `Case ${n}`,
      goal: "", rhythm: (v) => v, pageTurn: "", setting: "", place: "", characters: "", notes: "", continuity: "",
      textLabel: () => "", framing: () => "", rhythmName: (v) => v, noPanels: "(aucune case)",
      folio: (folio, label) => `p. ${folio} — ${label}`,
      extraHeading: (e, folio) => (folio === null ? e.kind : `p. ${folio} — ${e.kind}`),
      frontMatter: "Avant le récit", backMatter: "Après le récit",
    };
    const text = documentToText(
      buildScriptExport({
        project: { name: "Valombre" }, entries, panels: new Map(), labelOf: (n) => (n.id === "c1" ? "Chapitre 1" : "Page 1"),
        characters: [], locations: [], nameOf: () => "", includeCast: false, labels, volume: { items, extras: volumeExtras },
      }),
    );
    const order = ["AVANT LE RÉCIT", "cover", "p. 1 — title", "Logo centré.", "CHAPITRE 1", "p. 2 — Page 1", "APRÈS LE RÉCIT", "p. 3 — bonus"];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
