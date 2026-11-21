import { describe, expect, it } from "vitest";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";
import { MODULE_ORDER_KEYS, PREVIOUS_MODULE_ORDER, modulesFor, normalizeModuleOrder, orderSettingsSections } from "@/components/workspace/modules";

const ids = (...args: Parameters<typeof modulesFor>) => modulesFor(...args).map((module) => module.id);

describe("ordre des modules", () => {
  it("par défaut : le projet d'abord, puis l'univers, la recherche à la fin", () => {
    expect(ids("manga", { species: true })).toEqual([
      "details",
      "notes",
      "structure",
      "plot",
      "script",
      "characters",
      "locations",
      "species",
      "search",
    ]);
  });

  it("suit l'ordre choisi, avec le module du type de projet à sa place", () => {
    const order = ["characters", "projectType", "details"];
    expect(ids("novel", {}, order)).toEqual([
      "characters",
      // Absent de l'ordre : se place après le module qui le précède par défaut.
      "locations",
      "manuscript",
      "details",
      "notes",
      "structure",
      "plot",
      "search",
    ]);
  });

  it("complète un ordre incomplet ou abîmé", () => {
    const order = normalizeModuleOrder(["magic", "inconnu", "magic", "details"]);
    expect(order[0]).toBe("magic");
    expect(order).toHaveLength(12);
    expect(new Set(order).size).toBe(12);
  });

  it("les paramètres du projet suivent l'ordre des modules", () => {
    const sections = (order: string[] | null) => orderSettingsSections(PROJECT_SETTINGS_SECTIONS, order).map((section) => section.id);
    expect(sections(null)).toEqual([
      "info",
      "status",
      "notes",
      "structure",
      "plot",
      "characters",
      "locations",
      "items",
      "species",
      "factions",
      "peoples",
      "magic",
      "danger",
    ]);
    // Ordre complet, comme l'enregistre la carte des paramètres généraux.
    const full = normalizeModuleOrder(null).filter((key) => key !== "magic");
    const moved = sections(["magic", ...full]);
    expect(moved.slice(0, 3)).toEqual(["info", "status", "magic"]);
    expect(moved[moved.length - 1]).toBe("danger");
  });

  it("l'ancien ordre range tous les modules, l'univers d'abord", () => {
    expect([...PREVIOUS_MODULE_ORDER].sort()).toEqual([...MODULE_ORDER_KEYS].sort());
    expect(ids("novel", { item: true }, PREVIOUS_MODULE_ORDER)).toEqual([
      "details",
      "characters",
      "locations",
      "items",
      "structure",
      "plot",
      "manuscript",
      "notes",
      "search",
    ]);
  });
});
