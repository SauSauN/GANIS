import { describe, expect, it } from "vitest";
import { helpSectionOfTab } from "@/components/layout/helpSection";
import { characterTabId } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import { structureNodeTabId } from "@/lib/structure";
import { worldTabId } from "@/lib/world";

describe("rubrique de l'aide selon l'onglet affiché", () => {
  it("aucun onglet ou onglet inconnu : l'espace de travail", () => {
    expect(helpSectionOfTab(null)).toBe("workspace");
    expect(helpSectionOfTab("inconnu")).toBe("workspace");
  });

  it("fiches et listes : la rubrique de leur module", () => {
    expect(helpSectionOfTab(characterTabId("c1"))).toBe("characters");
    expect(helpSectionOfTab("characters.list")).toBe("characters");
    expect(helpSectionOfTab(locationTabId("l1"))).toBe("locations");
    expect(helpSectionOfTab(worldTabId("faction", "f1"))).toBe("factions");
    expect(helpSectionOfTab(worldTabId("people", "p1"))).toBe("peoples");
    expect(helpSectionOfTab(structureNodeTabId("n1"))).toBe("structure");
    expect(helpSectionOfTab(noteTabId("no1"))).toBe("notes");
    expect(helpSectionOfTab("plot.board")).toBe("plot");
    expect(helpSectionOfTab("home")).toBe("details");
  });

  it("onglets qui ont leur propre rubrique", () => {
    expect(helpSectionOfTab("structure.read")).toBe("reading");
    expect(helpSectionOfTab("history")).toBe("history");
    expect(helpSectionOfTab("trash")).toBe("history");
    expect(helpSectionOfTab("settings:characters")).toBe("settings");
  });

  it("outils d'écriture : la rubrique de leur type de projet", () => {
    expect(helpSectionOfTab("manuscript.progress")).toBe("manuscript");
    expect(helpSectionOfTab("script.flatplan")).toBe("script");
    expect(helpSectionOfTab("film.breakdown")).toBe("screen");
    expect(helpSectionOfTab("screenplay.board")).toBe("screen");
  });
});
