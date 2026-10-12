import { describe, expect, it } from "vitest";
import { changedFields, diffWords, noteText, readableFields } from "@/lib/versions";

describe("versions", () => {
  it("texte d'une note, schéma compris", () => {
    const doc = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Le donjon" }] },
        { type: "diagram", attrs: { data: { boxes: [{ label: "Mage" }, { label: "Ambre" }] } } },
      ],
    });
    expect(noteText(doc)).toBe("Le donjon\nMage → Ambre");
    expect(noteText("")).toBe("");
    expect(noteText("pas du json")).toBe("");
  });

  it("champs modifiés d'un personnage, références remplacées par un nom", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const resolve = (value: string) => (value === id ? "Valona" : null);
    const before = readableFields("character", { first_name: "Aldric", last_name: "", role: "main", status: "alive", fields: JSON.stringify({ origin: id }) }, resolve);
    const after = readableFields("character", { first_name: "Aldric", last_name: "Venn", role: "main", status: "alive", fields: "{}" }, resolve);
    const changes = changedFields(before, after);
    expect(changes.map((c) => c.key)).toEqual(["lastName", "fields.origin"]);
    expect(changes[1].before).toBe("Valona");
    expect(changes[1].after).toBe("");
  });

  it("différences mot à mot", () => {
    expect(diffWords("Le roi est mort", "Le roi est vivant")).toEqual([
      { kind: "same", text: "Le roi est " },
      { kind: "removed", text: "mort" },
      { kind: "added", text: "vivant" },
    ]);
    expect(diffWords("", "Nouveau")).toEqual([{ kind: "added", text: "Nouveau" }]);
  });
});
