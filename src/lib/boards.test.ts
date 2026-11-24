import { describe, expect, it } from "vitest";
import { BOARD_WIDTH, boardIdOfTab, boardLinksTo, boardTabId, MAX_ITEM_WIDTH, freeSpot, newItem, normalizeBoard, topZ } from "@/lib/boards";

describe("planches d'inspiration", () => {
  it("lit une planche enregistrée, même abîmée", () => {
    const board = normalizeBoard({
      items: [
        { id: "a", kind: "image", imageId: "img1", x: -50, y: 20, w: 9999, z: 3, rot: 40 },
        { id: "b", kind: "image", x: 10, y: 10 },
        { id: "a", kind: "quote", text: "Ce qui brûle peut renaître.", by: "Orvel", x: BOARD_WIDTH + 500, y: 5 },
        { kind: "palette", colors: ["#123456", "rouge", "#ABCDEF", "#111111", "#222222", "#333333"] },
        { kind: "inconnu" },
        { kind: "note", text: "Cloches fêlées", by: "ignoré" },
      ],
    });
    expect(board.items.map((i) => i.kind)).toEqual(["image", "quote", "palette", "note"]);
    const [image, quote, palette, note] = board.items;
    expect([image.x, image.w, image.rot]).toEqual([0, MAX_ITEM_WIDTH, 6]);
    expect(quote.id).not.toBe("a");
    expect(quote.by).toBe("Orvel");
    expect(quote.x).toBeLessThan(BOARD_WIDTH);
    expect(palette.colors).toEqual(["#123456", "#ABCDEF", "#111111", "#222222"]);
    expect(note.by).toBe("");
    expect(normalizeBoard("x").items).toEqual([]);
  });

  it("lie une planche à des éléments du projet", () => {
    const board = normalizeBoard({
      links: [
        { kind: "character", id: "c1" },
        { kind: "character", id: "c1" },
        { kind: "node", id: "ch3" },
        { kind: "inconnu", id: "x" },
        { kind: "note", id: "" },
      ],
    });
    expect(board.links).toEqual([{ kind: "character", id: "c1" }, { kind: "node", id: "ch3" }]);
    expect(boardLinksTo(board, "character", "c1")).toBe(true);
    expect(boardLinksTo(board, "location", "c1")).toBe(false);
    expect(normalizeBoard({}).links).toEqual([]);
  });

  it("chaque planche a son onglet", () => {
    expect(boardTabId("b1")).toBe("board:b1");
    expect(boardIdOfTab("board:b1")).toBe("b1");
    expect(boardIdOfTab("board:")).toBeNull();
    expect(boardIdOfTab("boards")).toBeNull();
    expect(boardIdOfTab(null)).toBeNull();
  });

  it("ajoute un élément devant les autres, sans le poser sur un autre", () => {
    const board = normalizeBoard({ items: [{ id: "a", kind: "note", x: 140, y: 140, z: 7 }] });
    expect(topZ(board)).toBe(7);
    expect(freeSpot(board, { x: 100, y: 100 })).toEqual({ x: 168, y: 168 });
    const item = newItem(board, "quote", { x: 100, y: 100 }, { text: "Bonjour" });
    expect(item.z).toBe(8);
    expect(item.text).toBe("Bonjour");
    expect(newItem(board, "palette", { x: 0, y: 0 }).colors.length).toBe(4);
  });
});
