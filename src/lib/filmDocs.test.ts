import { describe, expect, it } from "vitest";
import { buildBreakdownDoc, buildFilmDossier, buildSeriesBible, type DossierInput, buildScheduleDoc, dayOrNight, shootingSchedule, stepOutline, treatment, type BreakdownLabels, type BreakdownScene } from "@/lib/filmDocs";
import { sceneTimes } from "@/lib/filmTools";
import { documentToText } from "@/lib/novelExport";
import { screenplayElements } from "@/lib/screenplayExport";
import { EMPTY_FILM, scenesInOrder, type SeriesExportInput } from "@/lib/series";
import type { Character, SceneBlock, StructureNode } from "@/types";

const date = "2026-11-15T00:00:00Z";
const node = (id: string, parentId: string | null, level: number, position: number, extra: Partial<StructureNode> = {}): StructureNode => ({
  id, parentId, level, title: "", summary: "", position, numbered: true, number: null, contentWords: 0, wordGoal: null, writingStatus: null,
  narrativePerson: null, narrativeTense: null, narrativeGoal: "", pageGoal: null, scriptStatus: null, rhythm: null, pageTurn: false, productionStage: null,
  logline: "", runtimeGoal: null, episodeStatus: null, writer: "", scenePlace: null, sceneLocationId: null, sceneTime: null,
  createdAt: date, updatedAt: date, ...extra,
});
const block = (id: string, sceneId: string, position: number, extra: Partial<SceneBlock> = {}): SceneBlock => ({
  id, sceneId, position, kind: "action", characterId: null, parenthetical: "", content: "", ...extra,
});

const nodes = [
  node("a1", null, 0, 0, { title: "L'île" }),
  node("q1", "a1", 1, 0, { title: "La disparition", summary: "Yann ne rentre pas." }),
  node("s1", "q1", 2, 0, { summary: "Le sel du soir.", scenePlace: "ext", sceneTime: "dusk" }),
  node("s2", "q1", 2, 1, { scenePlace: "ext", sceneTime: "night" }),
  node("q2", "a1", 1, 1, { title: "Le conseil" }),
  node("s3", "q2", 2, 0, { scenePlace: "int", sceneTime: "day" }),
];
const entries = scenesInOrder(nodes, 3);
const blocks = new Map<string, SceneBlock[]>([
  ["s1", [block("b1", "s1", 0, { content: "Maëlle tire le sel." })]],
  ["s2", [block("b2", "s2", 0, { content: "Deux lanternes avancent sur la digue." }), block("b3", "s2", 1, { kind: "dialogue", characterId: "loic", content: "Yann !" })]],
]);
const times = sceneTimes(entries, blocks);
const labelOf = (n: StructureNode) => n.title || n.id;

describe("séquencier et traitement", () => {
  it("groupe les séquences par acte avec leurs scènes et leur durée", () => {
    const outline = stepOutline(nodes, 3, times);
    expect(outline).toHaveLength(1);
    expect(outline[0].act?.id).toBe("a1");
    expect(outline[0].sequences.map((s) => [s.node.id, s.scenes])).toEqual([["q1", 2], ["q2", 1]]);
  });

  it("raconte chaque scène par son résumé, sinon sa première action", () => {
    expect(treatment(entries, blocks).map((s) => s.text)).toEqual(["Le sel du soir.", "Deux lanternes avancent sur la digue.", ""]);
  });

  it("assemble le dossier du film", () => {
    const input = (): DossierInput => ({
      project: { name: "Le Sel" },
      details: { ...EMPTY_FILM, logline: "Une saunière…", pitch: "Le pitch.", intention: "Pourquoi.\n\nComment.", writer: "N. K.", runtimeGoal: 105 },
      synopsis: [{ type: "paragraph", runs: [{ text: "Sur l'île de Kerlenn…" }] }],
      outline: stepOutline(nodes, 3, times),
      scenes: treatment(entries, blocks),
      labelOf,
      headingOf: (s) => s.id.toUpperCase(),
      numbers: new Map([["s1", "1"], ["s2", "2"], ["s3", "3"]]),
      duration: (m) => `${m} min`,
      characters: [{ name: "Maëlle", role: "Principale", description: "Saunière." }],
      labels: { subtitle: "Dossier", writer: "Écrit par", logline: "Logline :", pitch: "Pitch", intention: "Intention", synopsis: "Synopsis", characters: "Personnages", outline: "Séquencier", treatment: "Traitement", runtime: (d) => `Durée : ${d}` },
    });
    const doc = buildFilmDossier(input());
    expect(doc.subtitle).toEqual(["Dossier", "Écrit par N. K.", "Durée : 105 min"]);
    const text = documentToText(doc).toLowerCase();
    for (const part of ["pitch", "logline : une saunière…", "intention", "comment.", "personnages", "maëlle — principale", "séquencier", "la disparition — yann ne rentre pas.", "traitement", "1. s1", "synopsis", "sur l'île de kerlenn…"]) {
      expect(text).toContain(part);
    }
    expect(buildFilmDossier({ ...input(), synopsis: [] }).blocks.some((b) => b.type === "heading" && b.text === "Synopsis")).toBe(false); // section vide : absente
  });
});

describe("bible de série", () => {
  it("assemble le concept, les personnages, les saisons et leurs épisodes", () => {
    const series = [
      node("t1", null, 0, 0, { title: "Saison 1", summary: "La ligne fantôme." }),
      node("e1", "t1", 1, 0, { title: "0 h 12", logline: "Une rame s'arrête seule.", writer: "Claire", runtimeGoal: 52, summary: "Inès voit Méridienne." }),
      node("x1", "e1", 2, 0),
    ];
    const doc = buildSeriesBible({
      project: { name: "Les Traboules" },
      synopsis: [{ type: "paragraph", runs: [{ text: "Sous Lyon, une ville." }] }],
      characters: [{ name: "Inès", role: "Principale", description: "Conductrice." }],
      outline: stepOutline(series, 3, new Map()),
      labelOf,
      duration: (m) => `${m} min`,
      labels: { subtitle: "Bible", concept: "Concept", characters: "Personnages", seasons: "Saisons", logline: "Logline :", writer: "Écrit par", runtime: (d) => `Durée : ${d}` },
    });
    const text = documentToText(doc).toLowerCase();
    for (const part of ["concept", "sous lyon, une ville.", "inès — principale", "saison 1", "la ligne fantôme.", "0 h 12", "logline : une rame s'arrête seule.", "inès voit méridienne.", "écrit par claire · durée : 52 min"]) {
      expect(text).toContain(part);
    }
  });
});

describe("dépouillement et plan de travail", () => {
  const scene = (id: string, location: string, place: "int" | "ext", time: "day" | "night" | "dusk", minutes: number): BreakdownScene => ({
    sceneId: id, number: id, heading: id, place, time, locationId: location, location, minutes,
    cast: [{ id: "c", name: "Maëlle", state: "Foulard rouge" }], entries: [{ kind: "item", name: "Las" }],
    breakdown: { extras: "Vingt pêcheurs", props: "", costumes: "", makeup: "", vehicles: "", effects: "Brume", sound: "", notes: "" },
  });
  const labels: BreakdownLabels = {
    subtitle: "Dépouillement", scheduleSubtitle: "Plan de travail",
    fields: { extras: "Figurants", props: "Accessoires", costumes: "Costumes", makeup: "Maquillage", vehicles: "Véhicules", effects: "Effets", sound: "Son", notes: "Notes", cast: "Personnages", entries: "Fiches", duration: "Durée" },
    place: (v) => (v === "int" ? "INT." : "EXT."), moment: (v) => ({ day: "Jour", night: "Nuit", unknown: "?" })[v], noLocation: "Sans lieu", scenes: "Scènes",
  };

  it("regroupe par décor, intérieur ou extérieur, jour ou nuit", () => {
    expect([dayOrNight("dusk"), dayOrNight("morning"), dayOrNight(null)]).toEqual(["night", "day", "unknown"]);
    const groups = shootingSchedule([scene("1", "Marais", "ext", "day", 2), scene("2", "Phare", "int", "night", 1), scene("3", "Marais", "ext", "dusk", 3), scene("4", "Marais", "ext", "day", 1.5)]);
    expect(groups.map((g) => [g.location, g.moment, g.scenes.map((s) => s.number), g.minutes])).toEqual([
      ["Marais", "day", ["1", "4"], 3.5],
      ["Marais", "night", ["3"], 3],
      ["Phare", "night", ["2"], 1],
    ]);
    const text = documentToText(buildScheduleDoc({ name: "Le Sel" }, groups, (m) => `${m} min`, labels));
    expect(text).toContain("EXT. MARAIS — JOUR · 3.5 min");
    expect(text).toContain("Scènes : 1, 4");
  });

  it("écrit une fiche par scène, sans les champs vides", () => {
    const text = documentToText(buildBreakdownDoc({ name: "Le Sel" }, [scene("12A", "Marais", "ext", "day", 2)], (m) => `${m} min`, labels));
    for (const part of ["12A. 12A", "Personnages : Maëlle (Foulard rouge)", "Fiches : Las", "Figurants : Vingt pêcheurs", "Effets : Brume"]) expect(text).toContain(part);
    expect(text).not.toContain("Accessoires");
  });
});

describe("éléments du scénario exporté", () => {
  it("ajoute « (SUITE) » quand un personnage reprend après une action, et les numéros", () => {
    const input: SeriesExportInput = {
      project: { name: "Le Sel" },
      entries,
      blocks: new Map([
        ["s1", [
          block("x1", "s1", 0, { kind: "dialogue", characterId: "lea", content: "Un." }),
          block("x2", "s1", 1, { content: "Elle se tait." }),
          block("x3", "s1", 2, { kind: "dialogue", characterId: "lea", content: "Deux.", updatedAt: "2026-11-21T00:00:00Z" }),
          block("x4", "s1", 3, { kind: "dialogue", characterId: "lea", content: "Trois." }),
        ]],
      ]),
      labelOf,
      characters: [{ id: "lea", firstName: "Léa", lastName: "", fields: {} } as unknown as Character],
      locations: [],
      nameOf: (c) => c.firstName,
      labels: { place: () => "EXT.", time: () => "NUIT", subtitle: "Scénario", untitledScene: (l) => l, logline: "Logline :", writer: "Écrit par", noScript: "Pas écrite." },
      film: EMPTY_FILM,
    };
    const elements = screenplayElements(input, { labels: new Map([["s1", "1"], ["s2", "1A"], ["s3", "2"]]), revisionSince: "2026-11-20T00:00:00Z" });
    const dialogues = elements.filter((e) => e.type === "dialogue");
    expect(dialogues.map((d) => d.type === "dialogue" && d.contd)).toEqual([false, true, false]);
    expect(dialogues.map((d) => d.type === "dialogue" && !!d.revised)).toEqual([false, true, false]);
    expect(elements.filter((e) => e.type === "heading").map((e) => e.type === "heading" && e.number)).toEqual(["1", "1A", "2"]);
    expect(elements.some((e) => e.type === "section")).toBe(false);
  });
});
