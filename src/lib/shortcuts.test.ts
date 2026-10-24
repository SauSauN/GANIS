import { describe, expect, it } from "vitest";
import { findShortcut, formatCombo, matches, REFERENCE } from "@/lib/shortcuts";
import enCommon from "@/i18n/locales/en/common.json";
import frCommon from "@/i18n/locales/fr/common.json";

const en = () => ({ ...enCommon.keys });
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
    expect(findShortcut(key("F5"))?.action).toBe("readStory");
  });

  it("Ctrl+Maj+S reste libre pour « Barré » dans l'éditeur", () => {
    expect(findShortcut(key("S", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
    expect(findShortcut(key("s"))).toBeUndefined();
  });

  it("« / » fonctionne avec ou sans Maj (AZERTY)", () => {
    expect(matches({ ctrl: true, key: "/" }, key("/", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(findShortcut(key(":", { ctrlKey: true }))?.action).toBe("shortcuts");
  });

  it("affichage, noms de touches dans la langue de l'interface", () => {
    const fr = { ...frCommon.keys };
    const en = { ...enCommon.keys };
    expect(formatCombo({ ctrl: true, alt: true, key: "s" }, fr)).toBe("Ctrl+Alt+S");
    expect(formatCombo({ ctrl: true, shift: true, key: "tab" }, fr)).toBe("Ctrl+Maj+Tab");
    expect(formatCombo({ ctrl: true, shift: true, key: "tab" }, en)).toBe("Ctrl+Shift+Tab");
    expect(formatCombo({ key: "escape" }, fr)).toBe("Échap");
    expect(formatCombo({ key: "escape" }, en)).toBe("Esc");
    expect(formatCombo({ ctrl: true, key: "pagedown" }, en)).toBe("Ctrl+PgDn");
    expect(formatCombo({ alt: true, key: "arrowleft" }, en)).toBe("Alt+←");
  });

  it("aucun nom de touche français dans la liste de référence", () => {
    // La liste ne contient que des combinaisons : rien n'est écrit en dur.
    for (const entry of REFERENCE) {
      for (const combo of entry.keys) {
        expect(formatCombo(combo, en())).not.toMatch(/Maj|Échap|PgSuiv|PgPréc/);
      }
    }
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

  it("n'affiche jamais « Enregistré » après un échec masqué", () => {
    // Échec masqué, aucune écriture réussie depuis : toujours signalé.
    expect(resolveSaveState(0, "x", 0, "t", true)).toBe("failed");
    expect(resolveSaveState(0, "x", 0, null, true)).toBe("failed");
    // Modifications en attente : elles passent devant l'échec masqué.
    expect(resolveSaveState(0, "x", 2, "t", true)).toBe("unsaved");
    // Écriture en cours : affichée en priorité.
    expect(resolveSaveState(1, "x", 0, "t", true)).toBe("saving");
  });
});
