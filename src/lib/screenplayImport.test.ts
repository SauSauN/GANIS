// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanCharacter, importedNames, nameKey, parseFdx, parseFountain, parseHeading } from "@/lib/screenplayImport";

describe("en-tête de scène", () => {
  it("lit l'intérieur, le lieu et le moment", () => {
    expect(parseHeading("INT. CUISINE DU PHARE — NUIT")).toMatchObject({ place: "int", location: "Cuisine du phare", time: "night" });
    expect(parseHeading("EXT. MARAIS - DAY #12A#")).toMatchObject({ place: "ext", location: "Marais", time: "day", heading: "EXT. MARAIS - DAY" });
    expect(parseHeading("INT./EXT. VOITURE – CONTINU")).toMatchObject({ place: "intExt", location: "Voiture", time: "continuous" });
    expect(parseHeading("I/E Barque")).toMatchObject({ place: "intExt", location: "Barque", time: null });
    expect(parseHeading("FLASH-BACK")).toMatchObject({ place: null, location: "Flash-back" });
  });

  it("nettoie le nom d'un personnage et compare les noms sans accents", () => {
    expect(cleanCharacter("LÉA (V.O.)")).toBe("LÉA");
    expect(cleanCharacter("@McCLANE (CONT'D)")).toBe("McCLANE");
    expect(nameKey("  Maëlle   KERVRAN ")).toBe("maelle kervran");
  });
});

const FOUNTAIN = `Title: Le Sel des Veilleuses
Credit: Scénario
Author: N. K.

INT. CUISINE - NUIT

Maëlle entre, trempée.
Elle pose la lanterne.

MAËLLE
(à voix basse)
Il y a quelqu'un ?
(un temps)
Yann ?

ANNA (O.S.)
Je suis là.

[[Couper si trop long]]

> FONDU AU NOIR.

.FLASHBACK SUR LA LANDE

!PIERRICK tient la main de Maëlle enfant.

@Pierrick
Écoute.

CUT TO:

EXT. MARAIS — JOUR

Le sel brille.
`;

describe("Fountain", () => {
  it("lit les scènes, les répliques, les didascalies, les transitions et les notes", () => {
    const script = parseFountain(FOUNTAIN);
    expect(script.title).toBe("Le Sel des Veilleuses");
    expect(script.scenes.map((s) => s.heading)).toEqual(["INT. CUISINE - NUIT", "FLASHBACK SUR LA LANDE", "EXT. MARAIS — JOUR"]);
    const [cuisine, lande, marais] = script.scenes;
    expect(cuisine.blocks.map((b) => b.kind)).toEqual(["action", "dialogue", "dialogue", "dialogue", "note", "transition"]);
    expect(cuisine.blocks[0].content).toBe("Maëlle entre, trempée.\nElle pose la lanterne.");
    expect(cuisine.blocks[1]).toMatchObject({ character: "MAËLLE", parenthetical: "à voix basse", content: "Il y a quelqu'un ?" });
    expect(cuisine.blocks[2]).toMatchObject({ character: "MAËLLE", parenthetical: "un temps", content: "Yann ?" });
    expect(cuisine.blocks[3]).toMatchObject({ character: "ANNA", content: "Je suis là." });
    expect(cuisine.blocks[5].content).toBe("FONDU AU NOIR.");
    expect(lande.blocks.map((b) => b.kind)).toEqual(["action", "dialogue", "transition"]);
    expect(lande.blocks[0].content).toBe("PIERRICK tient la main de Maëlle enfant.");
    expect(lande.blocks[1].character).toBe("Pierrick");
    expect(marais).toMatchObject({ place: "ext", location: "Marais", time: "day" });
    expect(importedNames(script)).toEqual({ characters: ["MAËLLE", "ANNA", "Pierrick"], locations: ["Cuisine", "Flashback sur la lande", "Marais"] });
  });
});

const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. PHARE - NUIT</Text></Paragraph>
    <Paragraph Type="Action"><Text>Gwen note l'heure.</Text></Paragraph>
    <Paragraph Type="Character"><Text>GWEN (V.O.)</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(fatiguée)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>La troisième </Text><Text Style="Italic">fume</Text><Text>.</Text></Paragraph>
    <Paragraph Type="Shot"><Text>GROS PLAN SUR LA LANTERNE</Text></Paragraph>
    <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>EXT. GRÈVE - AUBE</Text></Paragraph>
    <Paragraph Type="General"><Text>Le vent tombe.</Text></Paragraph>
  </Content>
  <TitlePage><Content><Paragraph><Text>Le Sel</Text></Paragraph></Content></TitlePage>
</FinalDraft>`;

describe("Final Draft", () => {
  it("lit les paragraphes typés d'un .fdx", () => {
    const script = parseFdx(FDX);
    expect(script.title).toBe("Le Sel");
    expect(script.scenes).toHaveLength(2);
    expect(script.scenes[0]).toMatchObject({ place: "int", location: "Phare", time: "night" });
    expect(script.scenes[0].blocks.map((b) => b.kind)).toEqual(["action", "dialogue", "shot", "transition"]);
    expect(script.scenes[0].blocks[1]).toMatchObject({ character: "GWEN", parenthetical: "fatiguée", content: "La troisième fume." });
    expect(script.scenes[1]).toMatchObject({ location: "Grève", time: "dawn" });
    expect(() => parseFdx("<pas du xml")).toThrow();
  });
});
