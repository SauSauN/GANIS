// @vitest-environment jsdom
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { noteExtensions } from "@/components/notes/editor/extensions";

const system = getSchema(noteExtensions("", { system: true }));
const full = getSchema(noteExtensions(""));

describe("éditeur d'une note système", () => {
  it("garde l'écriture : titres, police, taille et listes", () => {
    for (const node of ["heading", "paragraph", "bulletList", "orderedList", "taskList"]) {
      expect(system.nodes[node], node).toBeDefined();
    }
    for (const mark of ["bold", "italic", "underline", "strike", "textStyle"]) {
      expect(system.marks[mark], mark).toBeDefined();
    }
    expect(system.marks.textStyle.spec.attrs).toHaveProperty("fontFamily");
    expect(system.marks.textStyle.spec.attrs).toHaveProperty("fontSize");
  });

  it("refuse les tableaux, encadrés, schémas et autres blocs", () => {
    for (const node of ["table", "callout", "chain", "diagram", "blockquote", "codeBlock", "horizontalRule"]) {
      expect(system.nodes[node], node).toBeUndefined();
    }
    for (const mark of ["highlight", "link", "code", "subscript", "superscript"]) {
      expect(system.marks[mark], mark).toBeUndefined();
    }
    expect(system.marks.textStyle.spec.attrs).not.toHaveProperty("color");
  });

  it("n'enlève rien aux autres notes", () => {
    for (const node of ["table", "callout", "chain", "diagram", "blockquote"]) {
      expect(full.nodes[node], node).toBeDefined();
    }
    expect(full.marks.highlight).toBeDefined();
  });

  it("correspond à ce que Rust accepte d'enregistrer", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src-tauri/src/services/system_note_service.rs", "utf8");
    const allowed = (name: string) => [...(source.match(new RegExp(`const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);

    const nodes = [...allowed("WRITING_NODES"), "entityMention"];
    expect(Object.keys(system.nodes).filter((node) => !nodes.includes(node))).toEqual([]);
    expect(Object.keys(system.marks).filter((mark) => !allowed("WRITING_MARKS").includes(mark))).toEqual([]);
  });
});
