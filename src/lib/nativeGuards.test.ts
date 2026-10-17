// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isBrowserShortcut, isEditableTarget, isHistoryMouseButton } from "@/lib/nativeGuards";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("raccourcis du navigateur", () => {
  it("neutralise rechargement, impression et historique", () => {
    expect(isBrowserShortcut(key("F5"), true)).toBe(true);
    expect(isBrowserShortcut(key("r", { ctrlKey: true }), true)).toBe(true);
    expect(isBrowserShortcut(key("R", { ctrlKey: true, shiftKey: true }), true)).toBe(true);
    expect(isBrowserShortcut(key("p", { ctrlKey: true }), true)).toBe(true);
    expect(isBrowserShortcut(key("ArrowLeft", { altKey: true }), true)).toBe(true);
    expect(isBrowserShortcut(key("BrowserBack"), true)).toBe(true);
  });

  it("laisse passer les raccourcis de GANIS et l'édition", () => {
    for (const k of ["s", "n", "w", "k", "c", "v", "x", "z", "f"]) {
      expect(isBrowserShortcut(key(k, { ctrlKey: true }), false)).toBe(false);
    }
    expect(isBrowserShortcut(key("ArrowLeft"), false)).toBe(false);
    expect(isBrowserShortcut(key("ArrowLeft", { ctrlKey: true }), false)).toBe(false);
  });

  it("outils de développement : gardés en développement seulement", () => {
    expect(isBrowserShortcut(key("F12"), true)).toBe(false);
    expect(isBrowserShortcut(key("F12"), false)).toBe(true);
    expect(isBrowserShortcut(key("i", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });
});

describe("menu contextuel", () => {
  it("reste natif dans un champ de texte, pas ailleurs", () => {
    document.body.innerHTML = `
      <input id="t" type="text" /><input id="c" type="checkbox" />
      <textarea id="a"></textarea><textarea id="ro" readonly></textarea>
      <div id="e" contenteditable="true"><p id="p">x</p></div>
      <div id="d"><span id="s">x</span></div>`;
    const el = (id: string) => document.getElementById(id);
    expect(isEditableTarget(el("t"))).toBe(true);
    expect(isEditableTarget(el("a"))).toBe(true);
    expect(isEditableTarget(el("c"))).toBe(false);
    expect(isEditableTarget(el("ro"))).toBe(false);
    expect(isEditableTarget(el("s"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("boutons précédent / suivant de la souris", () => {
    expect(isHistoryMouseButton(3)).toBe(true);
    expect(isHistoryMouseButton(4)).toBe(true);
    expect(isHistoryMouseButton(0)).toBe(false);
    expect(isHistoryMouseButton(2)).toBe(false);
  });
});
