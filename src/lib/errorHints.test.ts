// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@/i18n";
import { ApiError } from "@/lib/api";

describe("pistes de solution", () => {
  it("ajoute la piste après le message traduit", () => {
    const error = new ApiError("VALIDATION", "x", "ganix.notGanix");
    expect(error.message).toBe("Ce fichier n'est pas un projet GANIS. Choisissez un fichier qui se termine par .ganix.");
  });

  it("piste générique selon le code, sans clé", () => {
    const error = new ApiError("DATABASE", "Erreur SQL");
    expect(error.message.startsWith("Erreur SQL Réessayez dans un instant.")).toBe(true);
  });

  it("pas de piste : message seul", () => {
    expect(new ApiError("VALIDATION", "x", "note.titleTooLong", { max: 200 }).message).toBe(
      "Le titre ne doit pas dépasser 200 caractères.",
    );
  });

  it("vrais pluriels, sans « (s) »", () => {
    const one = new ApiError("VALIDATION", "x", "world.speciesHasMembers", { count: 1 }).message;
    const many = new ApiError("VALIDATION", "x", "world.speciesHasMembers", { count: 3 }).message;
    expect(one).toBe("1 fiche appartient à cette espèce : elle ne peut pas devenir un individu.");
    expect(many).toBe("3 fiches appartiennent à cette espèce : elle ne peut pas devenir un individu.");
    expect(
      new ApiError("VALIDATION", "x", "structure.levelInUse", { count: 2 }).message.startsWith(
        "Ce niveau contient encore 2 éléments",
      ),
    ).toBe(true);
  });
});

describe("textes de l'interface", () => {
  it("aucun pseudo-pluriel « (s) » ni « (e) » dans les traductions", async () => {
    const files = import.meta.glob("@/i18n/locales/*/*.json", { eager: true, import: "default" });
    const offenders: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === "string") {
        if (/\((s|e|x|es|ies)\)/.test(value)) offenders.push(`${path} : ${value}`);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      }
    };
    // Les deux langues sont bien lues (une trentaine de fichiers chacune).
    expect(Object.keys(files).length).toBeGreaterThan(40);
    for (const [file, content] of Object.entries(files)) walk(content, file);
    expect(offenders).toEqual([]);
  });
});
