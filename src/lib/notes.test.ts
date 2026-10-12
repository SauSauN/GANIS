import { describe, expect, it } from "vitest";
import {
  buildFolderTree,
  folderAndDescendants,
  folderPath,
  makeExcerpt,
  matchesNote,
  noteIdOfTab,
  notesIn,
  noteTabId,
  parseNoteContent,
} from "@/lib/notes";
import { readDiagram } from "@/components/notes/editor/Diagram";
import type { NoteFolder, NoteSummary } from "@/types";

const folder = (id: string, name: string, parentId: string | null = null): NoteFolder => ({
  id,
  parentId,
  name,
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const note = (id: string, title: string, folderId: string | null, extra: Partial<NoteSummary> = {}): NoteSummary => ({
  id,
  folderId,
  title,
  excerpt: "",
  pinned: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...extra,
});

describe("onglets de note", () => {
  it("aller-retour identifiant ↔ onglet", () => {
    expect(noteIdOfTab(noteTabId("n1"))).toBe("n1");
    expect(noteIdOfTab("notes.list")).toBeNull();
    expect(noteIdOfTab("note:")).toBeNull();
  });
});

describe("arborescence des dossiers", () => {
  const folders = [
    folder("b", "Recherches"),
    folder("a", "Idées"),
    folder("c", "Époque", "b"),
    folder("d", "Orphelin", "disparu"),
  ];

  it("trie par nom et rattache les orphelins à la racine", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((node) => node.folder.id)).toEqual(["a", "d", "b"]);
    expect(tree[2].children.map((node) => node.folder.id)).toEqual(["c"]);
    expect(tree[2].children[0].depth).toBe(1);
  });

  it("ne boucle pas sur des données circulaires", () => {
    const loop = [folder("x", "X", "y"), folder("y", "Y", "x")];
    const tree = buildFolderTree(loop);
    const count = (nodes: typeof tree): number => nodes.reduce((n, node) => n + 1 + count(node.children), 0);
    expect(count(tree)).toBe(2);
  });

  it("descendants et chemin", () => {
    expect([...folderAndDescendants(folders, "b")].sort()).toEqual(["b", "c"]);
    expect(folderPath(folders, "c").map((item) => item.name)).toEqual(["Recherches", "Époque"]);
    expect(folderPath(folders, null)).toEqual([]);
  });
});

describe("notes d'un dossier", () => {
  it("épinglées d'abord, puis par titre", () => {
    const notes = [note("1", "Zèbre", null), note("2", "abeille", null), note("3", "Milieu", null, { pinned: true }), note("4", "Ailleurs", "f")];
    expect(notesIn(notes, null, "Sans titre").map((item) => item.id)).toEqual(["3", "2", "1"]);
    expect(notesIn(notes, "f", "Sans titre").map((item) => item.id)).toEqual(["4"]);
  });

  it("recherche sans accents ni casse, dans le titre et l'extrait", () => {
    const item = note("1", "Château", null, { excerpt: "Le donjon est en ruine" });
    expect(matchesNote(item, "chateau")).toBe(true);
    expect(matchesNote(item, "DONJON")).toBe(true);
    expect(matchesNote(item, "forêt")).toBe(false);
    expect(matchesNote(item, "  ")).toBe(true);
  });
});

describe("contenu", () => {
  it("extrait : espaces réduits, 300 caractères", () => {
    expect(makeExcerpt("  Un\n\ntexte   ici ")).toBe("Un texte ici");
    expect(Array.from(makeExcerpt("é".repeat(400)))).toHaveLength(300);
  });

  it("document JSON relu ; vide ou illisible : note vide", () => {
    expect(parseNoteContent('{"type":"doc","content":[]}')).toEqual({ type: "doc", content: [] });
    expect(parseNoteContent("")).toBeNull();
    expect(parseNoteContent("<p>html</p>")).toBeNull();
    expect(parseNoteContent("[1,2]")).toBeNull();
  });

  it("schéma : données invalides écartées, flèches orphelines retirées", () => {
    const data = readDiagram({
      boxes: [
        { id: "a", x: 10, y: "x", label: "A", color: "pink" },
        { id: "b", x: 1, y: 2, label: 42, color: "rouge" },
        "pas une boîte",
      ],
      links: [
        { id: "l1", source: "a", target: "b", label: "vers" },
        { id: "l2", source: "a", target: "inconnu" },
      ],
    });
    expect(data.boxes).toEqual([
      { id: "a", x: 10, y: 0, label: "A", color: "pink" },
      { id: "b", x: 1, y: 2, label: "", color: null },
    ]);
    expect(data.links.map((link) => link.id)).toEqual(["l1"]);
    expect(readDiagram(null)).toEqual({ boxes: [], links: [] });
  });
});
