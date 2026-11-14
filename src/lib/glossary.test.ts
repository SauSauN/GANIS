import { describe, expect, it } from "vitest";
import { categoriesOf, filterTerms, groupByLetter, letterOf, OTHER_LETTER, sortTerms } from "@/lib/glossary";
import type { GlossaryTerm } from "@/types";

let next = 0;
function term(name: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm {
  next++;
  return {
    id: `t${next}`,
    term: name,
    definition: "",
    category: "",
    links: [],
    createdAt: `2026-01-01T00:00:${String(next).padStart(2, "0")}Z`,
    updatedAt: "",
    ...extra,
  };
}

describe("glossaire", () => {
  it("trie sans tenir compte des accents ni de la casse", () => {
    const sorted = sortTerms([term("zéphyr"), term("Écume"), term("eau"), term("Ancre"), term("éclipse")]);
    expect(sorted.map((t) => t.term)).toEqual(["Ancre", "eau", "éclipse", "Écume", "zéphyr"]);
  });

  it("range chaque terme sous sa lettre, # pour le reste", () => {
    expect(letterOf("Éclipse")).toBe("E");
    expect(letterOf("« Ressac »")).toBe("R");
    expect(letterOf("Œil-de-lune")).toBe("O");
    expect(letterOf("7e lune")).toBe(OTHER_LETTER);
    expect(letterOf("   ")).toBe(OTHER_LETTER);

    const groups = groupByLetter([term("Raz"), term("7e lune"), term("Ressac"), term("éclipse"), term("Ancre")]);
    expect(groups.map((g) => g.letter)).toEqual(["A", "E", "R", OTHER_LETTER]);
    expect(groups[2].terms.map((t) => t.term)).toEqual(["Raz", "Ressac"]);
  });

  it("cherche dans le terme, la définition et la catégorie", () => {
    const terms = [
      term("Lunéa", { definition: "La force des marées", category: "Magie" }),
      term("Ressac", { definition: "Premier rang de la lunea", category: "Titre" }),
      term("Kaze-no-Mura", { category: "Lieu" }),
    ];
    expect(filterTerms(terms, "LUNEA").map((t) => t.term)).toEqual(["Lunéa", "Ressac"]);
    expect(filterTerms(terms, "rang lunéa").map((t) => t.term)).toEqual(["Ressac"]);
    expect(filterTerms(terms, "").length).toBe(3);
    expect(filterTerms(terms, "", "magie").map((t) => t.term)).toEqual(["Lunéa"]);
    expect(filterTerms(terms, "", "")).toEqual([]);
    expect(categoriesOf([...terms, term("x", { category: " magie " })])).toEqual(["Lieu", "Magie", "Titre"]);
  });
});
