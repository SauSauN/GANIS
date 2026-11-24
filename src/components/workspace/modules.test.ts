import { describe, expect, it } from "vitest";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";
import {
  MODULE_ORDER_KEYS,
  PREVIOUS_MODULE_ORDER,
  featureAvailable,
  findFeature,
  modulesFor,
  normalizeModuleOrder,
  orderSettingsSections,
  projectTypeModuleId,
} from "@/components/workspace/modules";

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

describe("module du film", () => {
  it("un film a son module Scénario, juste après la Trame", () => {
    const list = ids("film");
    expect(list.indexOf("film")).toBe(list.indexOf("plot") + 1);
    expect(list).not.toContain("screenplay");
    expect(ids("series")).not.toContain("film");
    expect(projectTypeModuleId("film")).toBe("film");
    expect(projectTypeModuleId("game")).toBeNull();
  });

  it("ses outils remplacent la lecture et la continuité génériques", () => {
    for (const id of ["film.read", "film.progress", "film.continuity", "film.breakdown", "film.board", "film.import"]) {
      expect(featureAvailable(id, "film")).toBe(true);
      expect(featureAvailable(id, "series")).toBe(false);
    }
    expect(featureAvailable("structure.read", "film")).toBe(false);
    expect(featureAvailable("structure.continuity", "film")).toBe(false);
    expect(featureAvailable("screenplay.read", "film")).toBe(false);
    expect(featureAvailable("structure.read", "game")).toBe(true);
    for (const id of ["screenplay.board", "screenplay.breakdown", "screenplay.import"]) {
      expect(featureAvailable(id, "series")).toBe(true);
      expect(featureAvailable(id, "film")).toBe(false);
    }
    // Le dossier n'a plus d'onglet : il s'exporte depuis le Suivi du film.
    expect(findFeature("film.dossier")).toBeUndefined();
  });
});
