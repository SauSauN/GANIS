import { describe, expect, it } from "vitest";
import { beatsReport, episodeSceneLabels, lockNumbers, revisedBlocks, sceneLabels, sceneTimes, scenesOfCharacter, speakingStats } from "@/lib/filmTools";
import { completions } from "@/lib/screenplayTyping";
import { isOverdue, scenesInOrder } from "@/lib/series";
import type { SceneBlock, StructureNode } from "@/types";

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

// Acte I › Séquence 1 (s1, s2) ; Acte II › Séquence 2 (s3, s4).
const nodes = [
  node("a1", null, 0, 0), node("q1", "a1", 1, 0), node("s1", "q1", 2, 0), node("s2", "q1", 2, 1),
  node("a2", null, 0, 1), node("q2", "a2", 1, 0), node("s3", "q2", 2, 0), node("s4", "q2", 2, 1),
];
const entries = scenesInOrder(nodes, 3);
const long = "x".repeat(600); // ≈ 11 lignes d'action
const blocks = new Map<string, SceneBlock[]>([
  ["s1", [block("b1", "s1", 0, { content: long }), block("b2", "s1", 1, { kind: "dialogue", characterId: "lea", content: "Bonjour." })]],
  ["s2", [block("b3", "s2", 0, { content: long })]],
  ["s3", [block("b4", "s3", 0, { kind: "dialogue", characterId: "sam", content: "Salut." }), block("b5", "s3", 1, { content: long })]],
  ["s4", [block("b6", "s4", 0, { kind: "dialogue", characterId: "lea", content: "Me revoilà.", updatedAt: "2026-11-20T10:00:00Z" })]],
]);

describe("numéros de scène", () => {
  it("numérote dans l'ordre tant que rien n'est verrouillé", () => {
    expect([...sceneLabels(entries, {}).values()]).toEqual(["1", "2", "3", "4"]);
  });

  it("une scène ajoutée après le verrouillage prend une lettre", () => {
    const locked = lockNumbers(entries.filter((e) => e.scene.id !== "s3"), {});
    expect(locked).toEqual({ s1: "1", s2: "2", s4: "3" });
    expect([...sceneLabels(entries, locked).values()]).toEqual(["1", "2", "2A", "3"]);
    // Avant la première scène verrouillée : A1, B1.
    const before = [{ scene: node("n1", "q1", 2, -2) }, { scene: node("n2", "q1", 2, -1) }, ...entries];
    expect([...sceneLabels(before, { s1: "1" }).values()].slice(0, 3)).toEqual(["A1", "B1", "1"]);
  });
});

describe("numéros d'une série", () => {
  it("numérote épisode.scène, et verrouille ces numéros", () => {
    const labels = episodeSceneLabels(entries);
    expect([...labels.values()]).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    const locked = lockNumbers(entries.filter((e) => e.scene.id !== "s2"), {}, labels);
    expect([...sceneLabels(entries, locked, labels).values()]).toEqual(["1.1", "1.1A", "2.1", "2.2"]);
  });

  it("signale une échéance dépassée tant que l'épisode n'est pas validé", () => {
    expect(isOverdue({ dueDate: "2026-11-01", episodeStatus: "draft" }, "2026-11-22")).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-01", episodeStatus: "final" }, "2026-11-22")).toBe(false);
    expect(isOverdue({ dueDate: "2026-12-01", episodeStatus: null }, "2026-11-22")).toBe(false);
    expect(isOverdue({ dueDate: null, episodeStatus: null }, "2026-11-22")).toBe(false);
  });
});

describe("repères de structure", () => {
  it("compare la minute de chaque repère à sa place attendue", () => {
    const times = sceneTimes(entries, blocks);
    expect(times.get("s1")!.start).toBe(0);
    expect(times.get("s3")!.start).toBeGreaterThan(times.get("s2")!.start);
    const report = beatsReport({ inciting: "s1", midpoint: "s3", climax: "s2", plot1: "inconnue" }, times, 10);
    const byBeat = Object.fromEntries(report.map((r) => [r.beat, r]));
    // Élément déclencheur à 0 min pour 1,2 min attendue : au-delà des 5 % tolérés.
    expect(byBeat.inciting.verdict).toBe("early");
    // Premier pivot au quart de la durée : bien placé.
    const quarter = times.get("s2")!.start / 0.25;
    expect(beatsReport({ plot1: "s2" }, times, quarter).find((r) => r.beat === "plot1")!.verdict).toBe("onTime");
    expect(byBeat.plot1.verdict).toBe("missing");
    expect(byBeat.plot2.verdict).toBe("missing");
    expect(byBeat.climax.verdict).toBe("early");
    expect(byBeat.midpoint.minute).toBe(times.get("s3")!.start);
    expect(byBeat.midpoint.expected).toBe(5);
  });
});

describe("temps de parole", () => {
  it("compte répliques, minutes, scènes et la plus longue absence", () => {
    const present = new Map([["s2", new Set(["sam"])]]);
    const stats = speakingStats(entries, blocks, present);
    const lea = stats.find((s) => s.characterId === "lea")!;
    const sam = stats.find((s) => s.characterId === "sam")!;
    expect([lea.lines, lea.scenes]).toEqual([2, 2]);
    expect([sam.lines, sam.scenes]).toEqual([1, 2]);
    expect(lea.byAct.get("a1")).toBeGreaterThan(0);
    expect(lea.byAct.get("a2")).toBeGreaterThan(0);
    expect(lea.longestGap).toBeGreaterThan(0);
    expect(lea.gapFrom).toBe(0);
    // Série : minutes par épisode.
    const byEpisode = speakingStats(entries, blocks, present, (e) => e.episode?.id ?? "");
    expect([...byEpisode.find((s) => s.characterId === "lea")!.byAct.keys()]).toEqual(["q1", "q2"]);
  });

  it("donne les scènes d'un comédien et les éléments révisés", () => {
    expect(scenesOfCharacter(entries, blocks, "lea").map((e) => e.scene.id)).toEqual(["s1", "s4"]);
    expect(scenesOfCharacter(entries, blocks, "sam", new Map([["s2", new Set(["sam"])]])).map((e) => e.scene.id)).toEqual(["s2", "s3"]);
    expect([...revisedBlocks(blocks.get("s4")!, "2026-11-19T00:00:00Z")]).toEqual(["b6"]);
    expect(revisedBlocks(blocks.get("s4")!, null).size).toBe(0);
  });
});

describe("saisie assistée", () => {
  const names = { characters: ["Maëlle Kervran", "Loïc Le Goff"], locations: ["Phare des Sept Veilleuses"] };

  it("propose les transitions et les plans qui commencent comme la frappe", () => {
    expect(completions("transition", "fondu", names).map((c) => c.value)).toEqual(["FONDU ENCHAÎNÉ :", "FONDU AU NOIR.", "FONDU AU BLANC.", "FONDU EN OUVERTURE :"]);
    expect(completions("shot", "gros", names)[0].value).toBe("GROS PLAN SUR");
    expect(completions("transition", "FONDU AU NOIR.", names)).toEqual([]);
  });

  it("complète un nom de personnage en capitales dans une action, un lieu tel quel", () => {
    expect(completions("action", "La porte s'ouvre sur mae", names)).toEqual([{ label: "MAËLLE KERVRAN", value: "La porte s'ouvre sur MAËLLE KERVRAN" }]);
    expect(completions("action", "Elle court vers le Pha", names)[0].value).toBe("Elle court vers le Phare des Sept Veilleuses");
    expect(completions("dialogue", "Dis-le à Lo", names)[0].value).toBe("Dis-le à Loïc Le Goff");
    expect(completions("action", "x", names)).toEqual([]);
    expect(completions("note", "mae", names)).toEqual([]);
  });
});
