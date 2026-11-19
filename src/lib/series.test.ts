import { describe, expect, it } from "vitest";
import {
  blockLines,
  buildFountain,
  buildSeriesExport,
  episodeProgress,
  formatMinutes,
  inputFromSceneDraft,
  isSeriesProject,
  linesToMinutes,
  newBlock,
  nextBlockAfter,
  sceneDraftFromScript,
  sceneDraftSignature,
  sceneHeadingText,
  sceneLines,
  scenesInOrder,
  withKind,
  type SeriesExportInput,
} from "@/lib/series";
import { documentToText } from "@/lib/novelExport";
import type { Character, Location, SceneBlock, StructureNode } from "@/types";

const date = "2026-11-15T00:00:00Z";
const node = (id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode => ({
  id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null,
  narrativePerson: null, narrativeTense: null, narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false, productionStage: null,
  logline: "", runtimeGoal: null, episodeStatus: null, writer: "", scenePlace: null, sceneLocationId: null, sceneTime: null,
  createdAt: date, updatedAt: date, ...extra,
});
const block = (id: string, sceneId: string, position: number, extra: Partial<SceneBlock> = {}): SceneBlock => ({
  id, sceneId, position, kind: "action", characterId: null, parenthetical: "", content: "", ...extra,
});
const character = (id: string, firstName: string): Character => ({ id, firstName, lastName: "", fields: {} }) as unknown as Character;
const location = (id: string, name: string): Location => ({ id, name, fields: {} }) as unknown as Location;

const headingLabels = {
  place: (v: string) => ({ int: "Int.", ext: "Ext.", intExt: "Int./Ext." })[v] ?? v,
  time: (v: string) => ({ day: "Jour", night: "Nuit" })[v] ?? v,
};

// Saison 1 › Épisode 1 (2 scènes), Épisode 2 (1 scène).
const nodes = [
  node("s1", null, 0, 0, { title: "Le retour" }),
  node("e1", "s1", 1, 0, { title: "Pilote", logline: "Léa revient.", runtimeGoal: 1, episodeStatus: "draft", writer: "Sam" }),
  node("c1", "e1", 2, 0, { scenePlace: "int", sceneLocationId: "kitchen", sceneTime: "night" }),
  node("c2", "e1", 2, 1),
  node("e2", "s1", 1, 1),
  node("c3", "e2", 2, 0, { scenePlace: "ext", sceneLocationId: "ghost", sceneTime: "day" }),
];

describe("projet de série", () => {
  it("reconnaît une série", () => {
    expect(isSeriesProject({ type: "series" })).toBe(true);
    expect(isSeriesProject({ type: "manga" })).toBe(false);
    expect(isSeriesProject(null)).toBe(false);
  });
});

describe("brouillon d'une scène", () => {
  it("garde personnage et didascalie seulement pour une réplique", () => {
    const line = { ...newBlock("dialogue", "lea"), parenthetical: "bas", content: "Salut" };
    expect(withKind(line, "action")).toMatchObject({ kind: "action", characterId: null, parenthetical: "" });
    expect(newBlock("action", "lea").characterId).toBeNull();
    const input = inputFromSceneDraft({ place: "int", locationId: null, time: null, blocks: [{ ...line, kind: "note" }] });
    expect(input.blocks[0]).toMatchObject({ kind: "note", characterId: null, parenthetical: "" });
  });

  it("propose l'élément suivant : l'autre personnage répond", () => {
    const a = { ...newBlock("dialogue", "lea"), content: "Tu es là ?" };
    const b = { ...newBlock("dialogue", "marc"), content: "Oui." };
    expect(nextBlockAfter(b, [a, b])).toMatchObject({ kind: "dialogue", characterId: "lea" });
    expect(nextBlockAfter(a, [a])).toMatchObject({ kind: "dialogue", characterId: null });
    expect(nextBlockAfter(newBlock("transition"), []).kind).toBe("action");
    expect(nextBlockAfter(undefined, []).kind).toBe("action");
  });

  it("compare deux brouillons sans les clés locales", () => {
    const script = { scene: nodes[2], blocks: [block("b1", "c1", 0, { content: "Porte." })] };
    const a = sceneDraftFromScript(script);
    const b = sceneDraftFromScript(script);
    b.blocks[0].key = "autre";
    expect(sceneDraftSignature(a)).toBe(sceneDraftSignature(b));
    b.blocks[0].content = "Fenêtre.";
    expect(sceneDraftSignature(a)).not.toBe(sceneDraftSignature(b));
  });
});

describe("en-tête et durée", () => {
  it("écrit l'en-tête en capitales et ignore un lieu disparu", () => {
    const name = (id: string) => (id === "kitchen" ? "Cuisine" : null);
    expect(sceneHeadingText(nodes[2], name, headingLabels)).toBe("INT. CUISINE — NUIT");
    expect(sceneHeadingText(nodes[5], name, headingLabels)).toBe("EXT. — JOUR");
    expect(sceneHeadingText(nodes[3], name, headingLabels)).toBe("");
  });

  it("estime la durée à une page (55 lignes) par minute", () => {
    expect(blockLines({ kind: "note", parenthetical: "", content: "x".repeat(500) })).toBe(0);
    expect(blockLines({ kind: "action", parenthetical: "", content: "x".repeat(120) })).toBe(3);
    expect(blockLines({ kind: "dialogue", parenthetical: "bas", content: "x".repeat(70) })).toBe(5);
    expect(sceneLines([])).toBe(0);
    expect(linesToMinutes(55)).toBe(1);
    const labels = { lessThanOne: "< 1", minutes: (n: number) => `${n} min`, hours: (h: number, m: string) => `${h} h ${m}` };
    expect(formatMinutes(0.4, labels)).toBe("< 1");
    expect(formatMinutes(52.4, labels)).toBe("52 min");
    expect(formatMinutes(65, labels)).toBe("1 h 05");
  });
});

describe("ordre et suivi", () => {
  it("range les scènes avec leur épisode et leur saison", () => {
    const entries = scenesInOrder(nodes, 3);
    expect(entries.map((e) => [e.scene.id, e.episode?.id, e.season?.id])).toEqual([
      ["c1", "e1", "s1"],
      ["c2", "e1", "s1"],
      ["c3", "e2", "s1"],
    ]);
  });

  it("compte les scènes écrites, la durée et les répliques", () => {
    const blocks = [
      block("b1", "c1", 0, { content: "x".repeat(600) }),
      block("b2", "c1", 1, { kind: "dialogue", characterId: "lea", content: "Salut" }),
      block("b3", "c1", 2, { kind: "dialogue", characterId: "lea", content: "  " }),
      block("b4", "c2", 0, { kind: "note", content: "À écrire" }),
    ];
    const [first, second] = episodeProgress(nodes, 3, blocks);
    expect([first.episode.id, first.scenes, first.writtenScenes]).toEqual(["e1", 2, 1]);
    expect(first.lines.get("lea")).toBe(1);
    expect(first.minutes).toBeGreaterThan(0);
    expect([second.episode.id, second.scenes, second.writtenScenes, second.minutes]).toEqual(["e2", 1, 0, 0]);
  });
});

describe("export", () => {
  const input = (): SeriesExportInput => ({
    project: { name: "Le Phare" },
    entries: scenesInOrder(nodes, 3),
    blocks: new Map([
      [
        "c1",
        [
          block("b1", "c1", 0, { content: "Léa entre." }),
          block("b2", "c1", 1, { kind: "dialogue", characterId: "lea", parenthetical: "bas", content: "Il y a quelqu'un ?" }),
          block("b3", "c1", 2, { kind: "note", content: "secret" }),
          block("b4", "c1", 3, { kind: "transition", content: "cut to:" }),
        ],
      ],
    ]),
    labelOf: (n) => ({ s1: "Saison 1", e1: "Épisode 1", e2: "Épisode 2", c1: "Scène 1", c2: "Scène 2", c3: "Scène 3" })[n.id] ?? n.id,
    characters: [character("lea", "Léa")],
    locations: [location("kitchen", "Cuisine")],
    nameOf: (c) => c.firstName,
    labels: { ...headingLabels, subtitle: "Scénario", untitledScene: (l) => l, logline: "Logline :", writer: "Écrit par :", noScript: "Pas encore écrite." },
  });

  it("met en page le scénario et ne publie pas les notes", () => {
    const doc = buildSeriesExport(input());
    expect(doc.titlePage).toBe(true);
    const text = documentToText(doc);
    for (const part of ["SAISON 1", "Épisode 1", "INT. CUISINE — NUIT", "LÉA", "(bas)", "Il y a quelqu'un ?", "CUT TO:", "SCÈNE 2", "Pas encore écrite.", "Écrit par : Sam"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain("secret");
  });

  it("écrit un Fountain lisible par les logiciels de scénario", () => {
    const fountain = buildFountain(input());
    expect(fountain).toContain("Title: Le Phare");
    expect(fountain).toContain(".INT. CUISINE — NUIT");
    expect(fountain).toContain("@LÉA\n(bas)\nIl y a quelqu'un ?");
    expect(fountain).toContain("> CUT TO:");
    expect(fountain).toContain("[[secret]]");
    expect(fountain).toContain("## Épisode 2");
    expect(fountain).toContain("= Léa revient.");
  });
});
