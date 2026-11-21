import { describe, expect, it } from "vitest";
import { isMentionTrigger, matchMentions, parseMentionQuery, type MentionItem } from "@/components/notes/editor/noteLinks";

const items: MentionItem[] = [
  { kind: "character", id: "c1", label: "Rose Martin" },
  { kind: "location", id: "l1", label: "La Rose" },
  { kind: "node", id: "n1", label: "Scène 2" },
  { kind: "faction", id: "f1", label: "Rosiers noirs" },
  { kind: "note", id: "no1", label: "Idées rose" },
  { kind: "image", id: "i1", label: "Portrait de Rose" },
];

const ids = (query: string) => matchMentions(items, query).map((item) => item.id);

describe("déclencheurs « $ »", () => {
  it("« $$ » cherche dans tout le projet", () => {
    expect(parseMentionQuery("$ros")).toEqual({ kinds: null, text: "ros" });
    // Tout sauf « Scène 2 », qui ne contient pas « ros ».
    expect(ids("$ros").sort()).toEqual(["c1", "f1", "i1", "l1", "no1"]);
  });

  it("une lettre entre deux « $ » ne propose qu'une sorte", () => {
    expect(ids("c$ros")).toEqual(["c1"]);
    expect(ids("l$ros")).toEqual(["l1"]);
    expect(ids("s$sc")).toEqual(["n1"]);
    expect(ids("w$ros")).toEqual(["f1"]);
    expect(ids("n$ros")).toEqual(["no1"]);
    expect(ids("i$ros")).toEqual(["i1"]);
  });

  it("les lettres françaises marchent aussi, majuscules comprises", () => {
    expect(ids("p$ros")).toEqual(["c1"]);
    expect(ids("d$sc")).toEqual(["n1"]);
    expect(ids("u$ros")).toEqual(["f1"]);
    expect(ids("C$ros")).toEqual(["c1"]);
  });

  it("un prix ou une lettre inconnue ne propose rien", () => {
    expect(parseMentionQuery("5")).toBeNull();
    expect(parseMentionQuery("c")).toBeNull();
    expect(parseMentionQuery("x$ros")).toBeNull();
    expect(ids(" et plus")).toEqual([]);
  });

  it("reconnaît le texte tapé qui ouvre la liste", () => {
    expect(isMentionTrigger("$$")).toBe(true);
    expect(isMentionTrigger("$c$jul")).toBe(true);
    expect(isMentionTrigger("$")).toBe(false);
    expect(isMentionTrigger("$c")).toBe(false);
    expect(isMentionTrigger("$5")).toBe(false);
  });
});
