import { beforeEach, describe, expect, it } from "vitest";
import { buildReport, clearRecentErrors, MAX_RECENT_ERRORS, recentErrors, recordError } from "@/lib/problemReport";
import { releaseId, shouldShowWhatsNew } from "@/lib/releaseNotes";

const labels = {
  title: "Signalement GANIS",
  description: "Description",
  version: "Version",
  system: "Système",
  language: "Langue",
  session: "Session",
  signedIn: "compte connecté",
  guest: "espace public",
  display: "Affichage",
  lastSaveError: "Dernier échec d'enregistrement",
  recentErrors: "Derniers messages d'erreur",
  none: "aucun",
  unknown: "inconnue",
  notGiven: "non renseignée",
  colon: " :",
};

describe("signaler un problème", () => {
  beforeEach(() => clearRecentErrors());

  it("garde les derniers messages, une ligne chacun", () => {
    for (let i = 0; i < MAX_RECENT_ERRORS + 5; i++) recordError(new Error(`échec ${i}\ndétail technique`));
    const kept = recentErrors();
    expect(kept).toHaveLength(MAX_RECENT_ERRORS);
    expect(kept[kept.length - 1]?.message).toBe(`Error: échec ${MAX_RECENT_ERRORS + 4}`);
    expect(kept.every((entry) => !entry.message.includes("\n"))).toBe(true);
  });

  it("rapport : version, session sans nom de compte, description et erreurs", () => {
    recordError("update_note: DATABASE (database)");
    const text = buildReport(
      { version: "0.1.0", language: "fr", signedIn: true, lastSaveError: "Disque plein\nsuite", description: "  J'ai enregistré une note  ", labels },
      new Date("2026-10-24T12:00:00Z"),
    );
    expect(text).toContain("Version : GANIS 0.1.0");
    expect(text).toContain("Session : compte connecté");
    expect(text).toContain("J'ai enregistré une note");
    expect(text).toContain("Dernier échec d'enregistrement : Disque plein");
    expect(text).not.toContain("suite");
    expect(text).toContain("update_note: DATABASE (database)");
  });

  it("rapport sans erreur ni description", () => {
    const text = buildReport({ version: null, language: "en", signedIn: false, lastSaveError: null, description: "", labels: { ...labels, colon: ":" } });
    expect(text).toContain("Version: GANIS inconnue");
    expect(text).toContain("Session: espace public");
    expect(text).toContain("Derniers messages d'erreur:\naucun");
  });
});

describe("nouveautés", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };

  it("pas à la première installation, une fois après une mise à jour", () => {
    const storage = memory();
    expect(shouldShowWhatsNew("0.0.9", storage)).toBe(false); // première installation
    expect(shouldShowWhatsNew("0.1.0", storage)).toBe(true); // mise à jour
    expect(shouldShowWhatsNew("0.1.0", storage)).toBe(false); // déjà vue
  });

  it("identifiant de traduction sans points", () => {
    expect(releaseId("0.1.0")).toBe("v0_1_0");
  });
});
