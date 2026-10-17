// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { projectsInSpace, spaceOf } from "@/lib/projectSpace";
import {
  closeGuide,
  getGuideState,
  guideKey,
  markGuideStep,
  parseGuideState,
  reopenGuide,
} from "@/lib/startGuide";
import type { Project } from "@/types";

function project(id: string, visibility: Project["visibility"]): Project {
  return {
    id,
    name: id,
    description: "",
    type: "novel",
    status: "preparing",
    isFavorite: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    visibility,
  };
}

describe("espaces de projets", () => {
  it("connecté → espace privé, sans connexion → espace public", () => {
    expect(spaceOf(true)).toBe("private");
    expect(spaceOf(false)).toBe("public");
  });

  it("ne mélange jamais projets publics et privés", () => {
    const all = [project("a", "public"), project("b", "private"), project("c", "public")];
    expect(projectsInSpace(all, "public").map((p) => p.id)).toEqual(["a", "c"]);
    expect(projectsInSpace(all, "private").map((p) => p.id)).toEqual(["b"]);
  });
});

describe("guide de démarrage", () => {
  beforeEach(() => localStorage.clear());

  it("une clé par espace, et par compte pour l'espace privé", () => {
    expect(guideKey("public")).not.toBe(guideKey("private", "u1"));
    expect(guideKey("private", "u1")).not.toBe(guideKey("private", "u2"));
    expect(guideKey("public", "u1")).toBe(guideKey("public"));
  });

  it("s'affiche à la première visite", () => {
    expect(getGuideState(guideKey("public"))).toEqual({ closed: false, done: [] });
  });

  it("reste fermé une fois terminé ou ignoré, et peut être rouvert", () => {
    const key = guideKey("public");
    closeGuide(key);
    expect(getGuideState(key).closed).toBe(true);
    // L'autre espace n'est pas concerné.
    expect(getGuideState(guideKey("private", "u1")).closed).toBe(false);
    reopenGuide(key);
    expect(getGuideState(key).closed).toBe(false);
  });

  it("retient les étapes faites, sans doublon", () => {
    const key = guideKey("private", "u1");
    markGuideStep(key, "universe");
    markGuideStep(key, "universe");
    markGuideStep(key, "create");
    expect(getGuideState(key).done).toEqual(["create", "universe"]);
  });

  it("ignore un état enregistré invalide", () => {
    expect(parseGuideState("{pas du json")).toEqual({ closed: false, done: [] });
    expect(parseGuideState('{"closed":"oui","done":["x","story"]}')).toEqual({
      closed: false,
      done: ["story"],
    });
  });
});
