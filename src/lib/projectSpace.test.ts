import { describe, expect, it } from "vitest";
import { projectsInSpace, spaceOf } from "@/lib/projectSpace";
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
