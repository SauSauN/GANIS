import { describe, expect, it } from "vitest";
import {
  buildScriptExport,
  draftFromScript,
  draftSignature,
  duplicatePanel,
  inputFromDraft,
  moveItem,
  pagesInOrder,
  panelsByPage,
  panelVolume,
  pageVolume,
  textStats,
  type ScriptExportLabels,
} from "@/lib/manga";
import { documentToText } from "@/lib/novelExport";
import type { Character, Location, Panel, StructureNode } from "@/types";

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
