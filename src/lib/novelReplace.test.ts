import { describe, expect, it } from "vitest";
import { adaptCase, groupMatches, matchKey } from "@/lib/novelReplace";

describe("adaptCase", () => {
  it("suit la casse de l'occurrence", () => {
    expect(adaptCase("Marc", "martin")).toBe("Martin");
    expect(adaptCase("MARC", "martin")).toBe("MARTIN");
    expect(adaptCase("marc", "martin")).toBe("martin");
    expect(adaptCase("Élise", "émilie")).toBe("Émilie");
    expect(adaptCase("A", "martin")).toBe("Martin");
    expect(adaptCase("Marc", "")).toBe("");
  });
});

describe("groupMatches", () => {
  it("regroupe par élément dans l'ordre du plan", () => {
    const m = (nodeId: string, index: number) => ({ nodeId, index, before: "", text: "x", after: "" });
    const groups = groupMatches([m("b", 0), m("a", 0), m("b", 1)], new Map([["a", 0], ["b", 1]]));
    expect(groups.map((g) => [g.nodeId, g.matches.length])).toEqual([["a", 1], ["b", 2]]);
    expect(matchKey(m("a", 3))).toBe("a:3");
  });
});
