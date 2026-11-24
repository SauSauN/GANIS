import { describe, expect, it } from "vitest";
import { ARC_TYPES, arcDeltas, arcSummary, arcValue, blankArc, isEmptyArc, normalizeArc, orderedBeats } from "@/lib/arcs";

describe("arcs des personnages", () => {
  it("lit un arc enregistré, même abîmé", () => {
    const arc = normalizeArc({
      type: "inconnu",
      lie: "Tout ce que je touche se brise.",
      beats: [
        { id: "b1", nodeId: "ch2", value: 9, step: "Rester" },
        { id: "b1", nodeId: "", value: "-3.4", step: "Fuir" },
        { value: "beaucoup" },
      ],
    });
    expect(arc.type).toBe("positive");
    expect(arc.lie).toBe("Tout ce que je touche se brise.");
    expect(arc.beats.map((b) => [b.nodeId, b.value])).toEqual([["ch2", 5], [null, -3], [null, 0]]);
    expect(new Set(arc.beats.map((b) => b.id)).size).toBe(3);
    expect(normalizeArc(null)).toEqual(blankArc());
    expect(arcValue(-12)).toBe(-5);
  });

  it("ordonne les étapes selon le plan, résume l'évolution", () => {
    const arc = normalizeArc({
      beats: [
        { id: "x", nodeId: null, value: 1 },
        { id: "c", nodeId: "ch3", value: 2 },
        { id: "a", nodeId: "ch1", value: -4 },
        { id: "gone", nodeId: "supprimé", value: 0 },
        { id: "b", nodeId: "ch2", value: -1 },
      ],
    });
    const order = new Map([["ch1", 0], ["ch2", 1], ["ch3", 2]]);
    const beats = orderedBeats(arc, order);
    expect(beats.map((b) => b.id)).toEqual(["a", "b", "c", "x", "gone"]);
    expect(arcDeltas(beats)).toEqual([null, 3, 3, -1, -1]);
    expect(arcSummary(beats)).toEqual({ first: -4, last: 0, worstDrop: -1 });
    expect(arcSummary([])).toBeNull();
    expect(isEmptyArc(blankArc())).toBe(true);
    expect(isEmptyArc(arc)).toBe(false);
  });

  it("garde les nouveaux types d'arc et revient à « positif » pour un type inconnu", () => {
    for (const type of ARC_TYPES) expect(normalizeArc({ type }).type).toBe(type);
    expect(normalizeArc({ type: "epic" }).type).toBe("positive");
    expect(ARC_TYPES).toContain("tragic");
  });
});
