import { describe, expect, it } from "vitest";
import { countWords, type NodeText } from "@/lib/novel";
import type { PlotEvent } from "@/lib/plot";
import { assembleStory, eventsByNode, readingFeatureFor, unplacedEvents } from "@/lib/storyReading";
import type { StructureNode } from "@/types";

let clock = 0;
function node(id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode {
  clock += 1;
  const date = `2026-10-20T10:00:${String(clock).padStart(2, "0")}Z`;
  return {
    id, parentId, level, title: id, summary: "", position, numbered: true, number: null,
    contentWords: 0, wordGoal: null, writingStatus: null, narrativePerson: null, narrativeTense: null,
    narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false,
    createdAt: date, updatedAt: date, ...extra,
  };
}

function event(id: string, nodeId: string | null, row: number): PlotEvent {
  return {
    id, laneId: "l", row, title: id, note: "", pivot: false, status: "idea" as PlotEvent["status"], tags: [],
    characterIds: [], povId: null, locationId: null, nodeId, alsoNodeIds: [], noteIds: [], date: "", words: 0,
  };
}

const text = (html: string): NodeText => ({ html, source: "sheet", words: countWords(html) });
const label = (n: StructureNode) => n.title;

// Acte 1 › Séquence 1 (scènes 1, 2) › Séquence 2 (scène 3, vide)
const NODES = [
  node("a1", null, 0, 0, { summary: "Le départ" }),
  node("q2", "a1", 1, 1),
  node("q1", "a1", 1, 0),
  node("s2", "q1", 2, 1),
  node("s1", "q1", 2, 0),
  node("s3", "q2", 2, 0),
];

describe("lecture complète", () => {
  it("choisit l'onglet de lecture selon le type de projet", () => {
    expect(readingFeatureFor("novel")).toBe("manuscript.read");
    expect(readingFeatureFor("manga")).toBe("script.read");
    for (const type of ["film", "series", "game", "rpg", "custom"]) expect(readingFeatureFor(type)).toBe("structure.read");
  });

  it("suit l'ordre du plan et omet les éléments vides", () => {
    const texts = new Map([["s1", text("<p>Il pleut.</p>")]]);
    const events = eventsByNode([event("e2", "s2", 4), event("e1", "s2", 1)]);
    const entries = assembleStory(NODES, texts, events, label);
    expect(entries.map((e) => `${e.kind}:${e.kind === "event" ? e.event.id : e.node.id}`)).toEqual([
      "heading:a1",
      "summary:a1",
      "heading:q1",
      "heading:s1",
      "text:s1",
      "heading:s2",
      "event:e1",
      "event:e2",
    ]);
    // Séquence 2 et scène 3 n'ont rien : absentes.
    expect(entries.some((e) => e.node.id === "q2" || e.node.id === "s3")).toBe(false);
  });

  it("le texte écrit l'emporte sur les événements de la trame", () => {
    const texts = new Map([["s1", text("<p>Écrit.</p>")]]);
    const entries = assembleStory(NODES, texts, eventsByNode([event("e", "s1", 0)]), label);
    expect(entries.some((e) => e.kind === "event")).toBe(false);
  });

  it("manga : les pages se lisent comme des scènes de roman", () => {
    const nodes = [
      node("c1", null, 1, 0, { summary: "Kenji arrive en ville." }),
      node("p1", "c1", 2, 0, { summary: "La ville sous la pluie." }),
      node("p2", "c1", 2, 1, { summary: "Il découvre la tour vide." }),
      node("p3", "c1", 2, 2),
    ];
    const entries = assembleStory(nodes, new Map(), new Map(), label, { sceneLevel: 2 });
    expect(entries.map((e) => `${e.kind}:${e.node.id}`)).toEqual(["heading:c1", "summary:c1", "scene:p1", "scene:p2"]);
    expect(entries.filter((e) => e.kind === "scene").map((e) => e.kind === "scene" && e.breakBefore)).toEqual([false, true]);
  });

  it("compte les événements hors découpage", () => {
    expect(unplacedEvents([event("a", null, 0), event("b", "zz", 0), event("c", "s1", 0)], NODES)).toBe(2);
  });
});
