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
});
