import { describe, expect, it } from "vitest";
import { appearanceCounts, characterAppearances, panelPresences, presenceTable } from "@/lib/continuity";
import type { NodeCharacterLink, NodeLocationLink, StructureNode } from "@/types";

const at = "2026-11-15T00:00:00Z";
const node = (id: string, parentId: string | null, level: number, position: number): StructureNode => ({
  id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null,
  narrativePerson: null, narrativeTense: null, narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false, productionStage: null,
  logline: "", runtimeGoal: null, episodeStatus: null, writer: "", scenePlace: null, sceneLocationId: null, sceneTime: null,
  createdAt: at, updatedAt: at,
});
const who = (nodeId: string, characterId: string, role: NodeCharacterLink["role"] = "present", state = ""): NodeCharacterLink => ({ nodeId, characterId, role, state, createdAt: at });
const where = (nodeId: string, locationId: string, role: NodeLocationLink["role"] = "setting"): NodeLocationLink => ({ nodeId, locationId, role, createdAt: at });

// Partie 1 › Chapitre 1 (scènes 1, 2), Chapitre 2 (scène 3). Positions mélangées : l'ordre est celui du plan.
const nodes = [node("s3", "c2", 2, 0), node("p1", null, 0, 0), node("c2", "p1", 1, 1), node("c1", "p1", 1, 0), node("s2", "c1", 2, 1), node("s1", "c1", 2, 0)];

describe("continuité", () => {
  const links = {
    characters: [who("s2", "lea", "pov", "bras en écharpe"), who("s1", "lea", "present", "indemne"), who("s3", "lea", "mentioned", "bras en écharpe"), who("s3", "marc"), who("p1", "orvel")],
    locations: [where("c1", "phare"), where("s3", "port"), where("s2", "lettre", "mentioned")],
  };

  it("suit un personnage dans l'ordre du plan et signale un changement d'état", () => {
    const rows = characterAppearances(nodes, links, "lea");
    expect(rows.map((r) => [r.node.id, r.role, r.state, r.changed])).toEqual([
      ["s1", "present", "indemne", false],
      ["s2", "pov", "bras en écharpe", true],
      ["s3", "mentioned", "bras en écharpe", false],
    ]);
    expect(rows[1].previousState).toBe("indemne");
    expect(rows[0].path.map((n) => n.id)).toEqual(["p1", "c1"]);
    // Le lieu d'une scène sans décor est celui de son chapitre ; un lieu cité ne compte pas.
    expect(rows.map((r) => r.places)).toEqual([["phare"], ["phare"], ["port"]]);
  });

  it("filtre par lieu sans perdre le suivi de l'état", () => {
    const rows = characterAppearances(nodes, links, "lea", {}, "port");
    expect(rows.map((r) => [r.node.id, r.changed])).toEqual([["s3", false]]);
    const inLighthouse = characterAppearances(nodes, links, "lea", {}, "phare");
    expect(inLighthouse.map((r) => [r.node.id, r.changed])).toEqual([["s1", false], ["s2", true]]);
  });

  it("compte aussi les répliques et les lieux propres au type (série)", () => {
    const extra = { lines: new Map([["s1", new Map([["marc", 3]])]]), places: new Map([["s1", ["cuisine"]]]) };
    const rows = characterAppearances(nodes, links, "marc", extra);
    expect(rows.map((r) => [r.node.id, r.role, r.lines, r.places])).toEqual([
      ["s1", null, 3, ["cuisine"]],
      ["s3", "present", 0, ["port"]],
    ]);
    expect(appearanceCounts(links, extra)).toEqual(new Map([["lea", 3], ["marc", 2], ["orvel", 1]]));
  });

  it("manga : une page compte une fois par personnage, présent ou qui parle", () => {
    const panels = [
      { pageId: "s1", characters: [{ characterId: "lea" }], texts: [{ characterId: "lea" }, { characterId: null }] },
      { pageId: "s1", characters: [], texts: [{ characterId: "marc" }] },
      { pageId: "s3", characters: [{ characterId: "lea" }], texts: [] },
    ];
    const presences = panelPresences(panels);
    expect(presences.characters).toEqual([
      { nodeId: "s1", characterId: "lea" },
      { nodeId: "s1", characterId: "marc" },
      { nodeId: "s3", characterId: "lea" },
    ]);
    expect(presenceTable(nodes, presences, 1).rows).toEqual([
      { characterId: "lea", cells: [1, 1], total: 2 },
      { characterId: "marc", cells: [1, 0], total: 1 },
    ]);
  });

  it("dresse le tableau des présences par chapitre", () => {
    const { columns, rows } = presenceTable(nodes, links, 1);
    expect(columns.map((c) => c.node.id)).toEqual(["c1", "c2"]);
    // Orvel n'est lié qu'à la partie : pas de ligne.
    expect(rows).toEqual([
      { characterId: "lea", cells: [2, 1], total: 2 },
      { characterId: "marc", cells: [0, 1], total: 1 },
    ]);
  });
});
