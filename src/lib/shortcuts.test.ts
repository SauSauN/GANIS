import { describe, expect, it } from "vitest";
import { findShortcut, formatCombo, matches } from "@/lib/shortcuts";
import { isWriteCommand, resolveSaveState } from "@/lib/saveStatus";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) =>
  ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

describe("raccourcis", () => {
  it("reconnaît les commandes principales", () => {
    expect(findShortcut(key("s", { ctrlKey: true }))?.action).toBe("save");
    expect(findShortcut(key("S", { ctrlKey: true, altKey: true }))?.action).toBe("saveAll");
    expect(findShortcut(key("n", { ctrlKey: true }))?.action).toBe("new");
    expect(findShortcut(key("w", { ctrlKey: true }))?.action).toBe("closeTab");
    expect(findShortcut(key("Tab", { ctrlKey: true, shiftKey: true }))?.action).toBe("previousTab");
    expect(findShortcut(key("F1"))?.action).toBe("center");
    expect(findShortcut(key("k", { ctrlKey: true }))?.action).toBe("palette");
  });

  it("Ctrl+Maj+S reste libre pour « Barré » dans l'éditeur", () => {
    expect(findShortcut(key("S", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
    expect(findShortcut(key("s"))).toBeUndefined();
  });

  it("« / » fonctionne avec ou sans Maj (AZERTY)", () => {
    expect(matches({ ctrl: true, key: "/" }, key("/", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(findShortcut(key(":", { ctrlKey: true }))?.action).toBe("shortcuts");
  });

  it("affichage", () => {
    expect(formatCombo({ ctrl: true, alt: true, key: "s" }, "Maj")).toBe("Ctrl+Alt+S");
    expect(formatCombo({ ctrl: true, shift: true, key: "tab" }, "Maj")).toBe("Ctrl+Maj+Tab");
  });
});

describe("état des enregistrements", () => {
  it("distingue les écritures des lectures", () => {
    expect(isWriteCommand("update_note")).toBe(true);
    expect(isWriteCommand("delete_character")).toBe(true);
    expect(isWriteCommand("restore_trash")).toBe(true);
    expect(isWriteCommand("list_notes")).toBe(false);
    expect(isWriteCommand("get_structure")).toBe(false);
    expect(isWriteCommand("save_recovery_key_file")).toBe(false);
  });

  it("priorité : en cours, échec, non enregistré, enregistré, prêt", () => {
    expect(resolveSaveState(1, "x", 2, "t")).toBe("saving");
    expect(resolveSaveState(0, "x", 2, "t")).toBe("error");
    expect(resolveSaveState(0, null, 2, "t")).toBe("unsaved");
    expect(resolveSaveState(0, null, 0, "t")).toBe("saved");
    expect(resolveSaveState(0, null, 0, null)).toBe("idle");
  });
});
