// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { canOpenExternally, documentKind, extensionOf, formatSize, moveInList, readingPages, stemOf } from "@/lib/documents";
import type { StructureDocument } from "@/types";

const doc = (name: string, mime: string, id = name): StructureDocument => ({
  id,
  nodeId: "n1",
  name,
  mime,
  size: 1,
  note: "",
  position: 0,
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
  versions: 0,
});

describe("documents", () => {
  it("chooses how to show each type", () => {
    expect(documentKind(doc("a.pdf", "application/pdf"))).toBe("pdf");
    expect(documentKind(doc("p01.png", "image/png"))).toBe("image");
    expect(documentKind(doc("planche.psd", "image/vnd.adobe.photoshop"))).toBe("other");
    expect(documentKind(doc("c.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe("word");
    expect(documentKind(doc("c.doc", "application/msword"))).toBe("other");
    expect(documentKind(doc("s.md", "text/markdown"))).toBe("text");
    expect(documentKind(doc("m.mp3", "audio/mpeg"))).toBe("audio");
    expect(documentKind(doc("v.mp4", "video/mp4"))).toBe("video");
    expect(documentKind(doc("v.mov", "video/quicktime"))).toBe("other");
  });

  it("names, extensions and sizes", () => {
    expect(extensionOf("Chapitre 1.pdf")).toBe("PDF");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("sans")).toBe("");
    expect(stemOf("Chapitre 1.final.docx")).toBe("Chapitre 1.final");
    expect(formatSize(512, "fr")).toBe("512 o");
    expect(formatSize(1536, "fr")).toBe("1,5 Ko");
    expect(formatSize(12.4 * 1024 * 1024, "en")).toBe("12.4 MB");
    expect(formatSize(300 * 1024 * 1024, "fr")).toBe("300 Mo");
  });

  it("never opens programs", () => {
    expect(canOpenExternally("Chapitre.docx")).toBe(true);
    expect(canOpenExternally("setup.exe")).toBe(false);
    expect(canOpenExternally("x.PS1")).toBe(false);
    expect(canOpenExternally("sans-extension")).toBe(false);
  });

  it("reorders and keeps the pages of a chapter", () => {
    expect(moveInList(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], 2, -2)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveInList(same, 0, -1)).toBe(same);
    const pages = readingPages([doc("p1.jpg", "image/jpeg"), doc("script.pdf", "application/pdf"), doc("p2.webp", "image/webp")]);
    expect(pages.map((p) => p.name)).toEqual(["p1.jpg", "p2.webp"]);
  });
});
