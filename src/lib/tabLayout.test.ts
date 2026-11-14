import { describe, expect, it } from "vitest";
import { addTab, closeTab, keepTab, moveTab, normalize, previewTab, togglePin, type TabLayout } from "@/lib/tabLayout";

const layout = (tabs: string[], pinned: string[] = [], preview: string | null = null): TabLayout => ({ tabs, pinned, preview });

describe("onglets d'aperçu", () => {
  it("un simple clic ouvre un aperçu à la fin", () => {
    expect(previewTab(layout(["home"]), "a")).toEqual(layout(["home", "a"], [], "a"));
  });

  it("le prochain aperçu remplace le précédent, à la même place", () => {
    const opened = previewTab(layout(["home", "a", "x"], [], "a"), "b");
    expect(opened).toEqual(layout(["home", "b", "x"], [], "b"));
  });

  it("un onglet déjà ouvert ne change pas", () => {
    const current = layout(["home", "a"], [], "a");
    expect(previewTab(current, "home")).toBe(current);
  });

  it("un aperçu qui ne peut pas être remplacé (modifié) reste, le nouveau s'ajoute", () => {
    const opened = previewTab(layout(["home", "a"], [], "a"), "b", () => false);
    expect(opened).toEqual(layout(["home", "a", "b"], [], "b"));
  });

  it("le double-clic (ouverture définitive) garde l'aperçu", () => {
    expect(addTab(layout(["home", "a"], [], "a"), "a")).toEqual(layout(["home", "a"]));
    expect(keepTab(layout(["home", "a"], [], "a"), "a").preview).toBeNull();
  });

  it("un onglet définitif n'est jamais remplacé par un aperçu", () => {
    const kept = keepTab(layout(["home", "a"], [], "a"), "a");
    expect(previewTab(kept, "b")).toEqual(layout(["home", "a", "b"], [], "b"));
  });

  it("épingler un aperçu le rend définitif ; épingler un autre onglet ne change rien", () => {
    expect(togglePin(layout(["home", "a"], [], "a"), "a")).toEqual(layout(["a", "home"], ["a"]));
    expect(togglePin(layout(["home", "a"], [], "a"), "home").preview).toBe("a");
  });

  it("fermer l'aperçu l'oublie ; le déplacer le garde", () => {
    expect(closeTab(layout(["home", "a"], [], "a"), "a")).toEqual(layout(["home"]));
    expect(moveTab(layout(["home", "a"], [], "a"), "a", "home").preview).toBe("a");
  });

  it("normalize écarte un aperçu absent ou épinglé", () => {
    expect(normalize({ tabs: ["home"], pinned: [], preview: "a" }).preview).toBeNull();
    expect(normalize({ tabs: ["a"], pinned: ["a"], preview: "a" }).preview).toBeNull();
  });
});
