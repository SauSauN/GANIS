// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { setSheetPreviewEach } from "@/lib/preferences";
import { hasSheetPreview, useSheetPreviewStore } from "@/stores/sheetPreviewStore";

const state = () => useSheetPreviewStore.getState();

describe("aperçu des fiches", () => {
  beforeEach(() => {
    localStorage.clear();
    useSheetPreviewStore.setState({ all: false, each: {} });
  });

  it("par défaut, l'aperçu vaut pour toutes les fiches", () => {
    state().toggle("aldric");
    expect(state().all).toBe(true);
    expect(state().each).toEqual({});
    // Revenir au formulaire depuis une autre fiche les y ramène toutes.
    state().toggle("mirabelle");
    expect(state().all).toBe(false);
  });

  it("fiche par fiche (Paramètres généraux) : chaque fiche garde son état", () => {
    setSheetPreviewEach(true);
    state().toggle("aldric");
    expect(state().each).toEqual({ aldric: true });
    expect(state().all).toBe(false);
    state().toggle("mirabelle");
    state().toggle("aldric");
    expect(state().each).toEqual({ mirabelle: true });
  });

  it("concerne les fiches personnage, lieu et monde", () => {
    expect(hasSheetPreview("character:a")).toBe(true);
    expect(hasSheetPreview("location:b")).toBe(true);
    expect(hasSheetPreview("note:c")).toBe(false);
    expect(hasSheetPreview(null)).toBe(false);
  });
});
