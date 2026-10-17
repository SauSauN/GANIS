import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  blankPlot,
  chronology,
  computeIssues,
  dropMissing,
  eventsOfCharacter,
  matchesFilter,
  EMPTY_FILTER,
  moveInReadingOrder,
  normalizePlot,
  placeEvent,
  planOrder,
  plotSummary,
  reach,
  readingOrder,
  rowsCount,
  shiftRows,
  tourList,
  attachToNode,
  eventsOfNode,
  eventsRetoldIn,
  moveInScene,
  insertMoment,
  momentNumber,
  pastRowsCount,
  removeMoment,
  rowFromMoment,
  PAST_MIN_ROWS,
  type PlotData,
  type PlotEvent,
} from "@/lib/plot";

function ev(id: string, laneId: string, row: number, extra: Partial<PlotEvent> = {}): PlotEvent {
  return {
    id,
    laneId,
    row,
    title: id,
    note: "",
    pivot: false,
    status: "idea",
    tags: [],
    characterIds: [],
    povId: null,
    locationId: null,
    nodeId: null,
    alsoNodeIds: [],
    noteIds: [],
    date: "",
    words: 0,
    ...extra,
  };
}

function sample(): PlotData {
  const data = blankPlot("Principale");
  data.lanes = [
    { id: "a", name: "Élise", color: "#e0483d", main: true, hidden: false, characterId: null },
    { id: "b", name: "Marc", color: "#1fa37a", main: false, hidden: false, characterId: null },
    { id: "c", name: "Passé", color: "#e3a21a", main: false, hidden: false, characterId: null },
  ];
  data.events = [
    ev("e1", "a", 0, { nodeId: "ch2" }),
    ev("e2", "a", 4, { nodeId: "ch1" }),
    ev("m1", "b", 1, { characterIds: ["marc"], povId: "marc" }),
    ev("m2", "b", 3),
    ev("p1", "c", 2),
  ];
  data.links = [
    { id: "k1", from: "m1", to: "m2", kind: "impact", label: "", note: "" },
    { id: "k2", from: "m2", to: "e2", kind: "influence", label: "", note: "" },
  ];
  return data;
}

describe("plot", () => {
  it("normalizes any JSON into a coherent plot", () => {
    const empty = normalizePlot(null, "Principale");
    expect(empty.lanes).toHaveLength(1);
    expect(empty.lanes[0]).toMatchObject({ name: "Principale", main: true });

    const messy = normalizePlot(
      {
        lanes: [
          { id: "x", name: "X", main: true, hidden: true },
          { id: "y", main: true, color: "pas une couleur" },
        ],
        events: [
          { id: "1", laneId: "x", row: 2, status: "nope", tags: ["Brume", "brume", " "] },
          { id: "2", laneId: "x", row: 2 },
          { id: "3", laneId: "inconnue", row: 0 },
        ],
        links: [
          { from: "1", to: "2" },
          { from: "1", to: "2" },
          { from: "1", to: "1" },
          { from: "1", to: "3" },
        ],
        tension: { 0: 12, 1: "x", "-2": 3 },
        questions: [{ text: "  " }, { text: "Qui ?", eventId: "3" }],
        clues: [{ text: "Indice", mysteryId: "m" }],
        mysteries: [{ id: "m", question: "Pourquoi ?" }],
      },
      "Principale",
    );
    expect(messy.lanes.filter((l) => l.main)).toHaveLength(1);
    expect(messy.lanes[1].name).toBe("Principale");
    expect(messy.lanes[1].color).toMatch(/^#/);
    expect(messy.events.map((e) => [e.id, e.row])).toEqual([["1", 2], ["2", 3]]);
    expect(messy.events[0].status).toBe("idea");
    expect(messy.events[0].tags).toEqual(["Brume"]);
    expect(messy.links).toHaveLength(1);
    // Les moments négatifs sont le passé narratif : ils sont gardés.
    expect(messy.tension).toEqual({ 0: 10, [-2]: 3 });
    expect(messy.questions).toEqual([{ id: expect.any(String), text: "Qui ?", done: false, eventId: null }]);
    expect(messy.clues[0].mysteryId).toBe("m");
    expect(messy.readingFollowsStructure).toBe(true);
  });

  it("places events and bumps the occupants down", () => {
    const data = sample();
    const p1 = data.events.find((e) => e.id === "p1")!;
    placeEvent(data, p1, "b", 1);
    expect(data.events.find((e) => e.id === "m1")!.row).toBe(2);
    expect(data.events.find((e) => e.id === "m2")!.row).toBe(3);
    expect(p1).toMatchObject({ laneId: "b", row: 1 });

    placeEvent(data, data.events.find((e) => e.id === "e1")!, "b", 2);
    expect(data.events.filter((e) => e.laneId === "b").map((e) => e.row).sort()).toEqual([1, 2, 3, 4]);
  });

  it("inserts and removes moments with their labels, acts and tension", () => {
    const data = sample();
    data.acts = { 0: "Acte I", 3: "Acte II" };
    data.tension = { 3: 7 };
    data.rowLabels = { 4: "La cave" };
    shiftRows(data, 2, 1);
    expect(data.acts).toEqual({ 0: "Acte I", 4: "Acte II" });
    expect(data.tension).toEqual({ 4: 7 });
    expect(data.rowLabels).toEqual({ 5: "La cave" });
    expect(data.events.find((e) => e.id === "m1")!.row).toBe(1);
    expect(data.events.find((e) => e.id === "p1")!.row).toBe(3);
    expect(rowsCount(data)).toBe(10);
  });

  it("follows links downstream and upstream", () => {
    const data = sample();
    expect(reach(data, "m1", "out").sort()).toEqual(["e2", "m2"]);
    expect(reach(data, "e2", "in").sort()).toEqual(["m1", "m2"]);
  });

  it("reads in structure order, or in the manual order", () => {
    const data = sample();
    expect(planOrder(data).map((e) => e.id)).toEqual(["e1", "m1", "p1", "m2", "e2"]);

    const structure = new Map([
      ["ch1", 0],
      ["ch2", 1],
    ]);
    // e2 (ch1) d'abord ; les événements sans chapitre suivent celui qui les précède dans le plan.
    expect(readingOrder(data, structure).map((e) => e.id)).toEqual(["e2", "e1", "m1", "p1", "m2"]);

    data.readingFollowsStructure = false;
    data.readingOrder = ["p1", "e1"];
    expect(readingOrder(data, structure).map((e) => e.id)).toEqual(["p1", "e1", "m1", "m2", "e2"]);
    expect(moveInReadingOrder(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(tourList(data, "lane", "b", structure).map((e) => e.id)).toEqual(["m1", "m2"]);
  });

  it("flags structural issues without fixing anything", () => {
    const data = sample();
    const keys = computeIssues(data, "Sans titre").map((i) => `${i.key}:${i.target?.id ?? ""}`);
    expect(keys).toContain("mainGap:e2");
    expect(keys).toContain("laneIsolated:c");
    expect(keys).toContain("noPivot:");
    expect(keys.some((k) => k.startsWith("laneUnreached"))).toBe(false);

    data.links.push({ id: "k3", from: "e2", to: "p1", kind: "impact", label: "", note: "" });
    expect(computeIssues(data, "Sans titre").map((i) => i.key)).toContain("backInTime");
  });

  it("links events to characters and cleans missing references", () => {
    const data = sample();
    expect(eventsOfCharacter(data, "marc").map((e) => e.id)).toEqual(["m1"]);
    expect(matchesFilter(data.events[2], { ...EMPTY_FILTER, characterId: "marc" })).toBe(true);
    expect(matchesFilter(data.events[0], { ...EMPTY_FILTER, q: "elise" }, "Élise")).toBe(true);
    const removed = dropMissing(data, { character: () => false, location: () => true, node: (id) => id === "ch1", note: () => true });
    expect(removed).toBe(3);
    expect(data.events.find((e) => e.id === "e1")!.nodeId).toBeNull();
  });

  it("dates, templates and version summary", () => {
    const data = sample();
    data.events[0].date = "1987-08-20";
    data.events[1].date = "1987-05-12";
    expect(chronology(data).dated.map((e) => e.id)).toEqual(["e2", "e1"]);

    applyTemplate(data, [0, 0.5, 1], ["Début", "Milieu", "Fin"], 9, true);
    expect(data.acts).toEqual({ 0: "Début", 4: "Milieu", 8: "Fin" });

    expect(plotSummary(JSON.stringify(data), "?")).toContain("1. [Élise] e1");
    expect(plotSummary("", "?")).toContain("▥ —");
  });
});

describe("trames toutes supprimées", () => {
  it("une trame jamais enregistrée commence avec une trame principale, une liste vide est respectée", () => {
    expect(normalizePlot({}, "Principale").lanes.map((l) => [l.name, l.main])).toEqual([["Principale", true]]);
    const empty = normalizePlot({ lanes: [], events: [{ id: "e", laneId: "x", row: 0, title: "?" }] }, "Principale");
    expect(empty.lanes).toEqual([]);
    expect(empty.events).toEqual([]);
    const two = normalizePlot({ lanes: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }, "Principale");
    expect(two.lanes.map((l) => l.main)).toEqual([true, false]);
  });
});

describe("scènes et événements", () => {
  it("une scène range ses événements, l'ordre compte pour la lecture, un événement peut être repris ailleurs", () => {
    const data = blankPlot("P");
    const lane = data.lanes[0].id;
    data.events.push(ev("a", lane, 0), ev("b", lane, 1), ev("c", lane, 2));
    attachToNode(data, "a", "s1");
    attachToNode(data, "b", "s1");
    attachToNode(data, "c", "s2");
    expect(eventsOfNode(data, "s1").map((e) => e.id)).toEqual(["a", "b"]);
    moveInScene(data, "s1", "b", -1);
    expect(eventsOfNode(data, "s1").map((e) => e.id)).toEqual(["b", "a"]);
    const order = new Map([["s1", 0], ["s2", 1]]);
    expect(readingOrder(data, order).map((e) => e.id)).toEqual(["b", "a", "c"]);
    data.events[2].alsoNodeIds = ["s1"];
    expect(eventsRetoldIn(data, "s1").map((e) => e.id)).toEqual(["c"]);
    // Changer de scène retire l'événement de l'ancienne.
    attachToNode(data, "a", "s2");
    expect(eventsOfNode(data, "s1").map((e) => e.id)).toEqual(["b"]);
    const again = normalizePlot(JSON.parse(JSON.stringify(data)), "P");
    expect(again.sceneOrder.s1).toEqual(["b"]);
  });
});

describe("passé narratif (moments négatifs)", () => {
  it("garde les événements du passé à l'enregistrement et au rechargement", () => {
    const data = sample();
    data.events.push(ev("f1", "a", -1, { tags: ["flash-back"] }), ev("f2", "a", -3));
    data.acts[-3] = "Avant";
    data.tension[-1] = 4;
    data.rowLabels[-1] = "La veille";
    const again = normalizePlot(JSON.parse(JSON.stringify(data)), "Principale");
    expect(again.events.find((e) => e.id === "f1")?.row).toBe(-1);
    expect(again.events.find((e) => e.id === "f2")?.row).toBe(-3);
    expect(again.acts[-3]).toBe("Avant");
    expect(again.tension[-1]).toBe(4);
    expect(again.rowLabels[-1]).toBe("La veille");
  });

  it("projets existants : rien ne change", () => {
    const again = normalizePlot(JSON.parse(JSON.stringify(sample())), "Principale");
    expect(again.events.map((e) => e.row)).toEqual([0, 4, 1, 3, 2]);
    expect(pastRowsCount(again)).toBe(PAST_MIN_ROWS);
  });

  it("le passé vient avant l'histoire dans l'ordre du plan", () => {
    const data = sample();
    data.events.push(ev("f1", "b", -1), ev("f2", "a", -2));
    expect(planOrder(data).slice(0, 3).map((e) => e.id)).toEqual(["f2", "f1", "e1"]);
  });

  it("affiche assez de passé au-dessus du moment le plus ancien", () => {
    const data = sample();
    data.events.push(ev("f", "a", -7));
    expect(pastRowsCount(data)).toBe(9);
  });

  it("numérote −1, −2… avant le début, 1, 2… ensuite", () => {
    expect(momentNumber(0)).toBe("1");
    expect(momentNumber(4)).toBe("5");
    expect(momentNumber(-1)).toBe("\u22121");
    expect(momentNumber(-3)).toBe("\u22123");
    expect(rowFromMoment("1")).toBe(0);
    expect(rowFromMoment("-2")).toBe(-2);
    expect(rowFromMoment("\u22122")).toBe(-2);
    expect(rowFromMoment("0")).toBeNull();
    expect(rowFromMoment("")).toBeNull();
  });

  it("dans le passé, une case prise fait remonter ses occupants sans franchir le début", () => {
    const data = sample();
    data.events.push(ev("f1", "a", -1), ev("f2", "a", -2));
    const added = ev("n", "a", 0);
    data.events.push(added);
    placeEvent(data, added, "a", -1);
    const row = (id: string) => data.events.find((e) => e.id === id)!.row;
    expect(row("n")).toBe(-1);
    expect(row("f1")).toBe(-2);
    expect(row("f2")).toBe(-3);
    expect(row("e1")).toBe(0);
  });

  it("insérer ou retirer un moment du passé ne déplace pas le début de l'histoire", () => {
    const data = sample();
    data.events.push(ev("f1", "a", -1), ev("f2", "a", -2));
    data.acts[0] = "Acte I";
    expect(insertMoment(data, -1, "before")).toBe(-2);
    expect(data.events.find((e) => e.id === "f2")!.row).toBe(-3);
    expect(data.events.find((e) => e.id === "f1")!.row).toBe(-1);
    expect(data.events.find((e) => e.id === "e1")!.row).toBe(0);
    expect(data.acts[0]).toBe("Acte I");

    removeMoment(data, -2);
    expect(data.events.find((e) => e.id === "f2")!.row).toBe(-2);
    expect(data.events.find((e) => e.id === "e1")!.row).toBe(0);

    // Juste après le dernier moment du passé : entre −1 et le début.
    expect(insertMoment(data, -1, "after")).toBe(-1);
    expect(data.events.find((e) => e.id === "f1")!.row).toBe(-2);
    expect(data.events.find((e) => e.id === "e1")!.row).toBe(0);
  });

  it("dans l'histoire principale, insérer avant le premier moment reste comme avant", () => {
    const data = sample();
    expect(insertMoment(data, 0, "before")).toBe(0);
    expect(data.events.find((e) => e.id === "e1")!.row).toBe(1);
  });

  it("les liens vers le passé sont conservés", () => {
    const data = sample();
    data.events.push(ev("f1", "c", -2));
    data.links.push({ id: "k3", from: "f1", to: "e1", kind: "impact", label: "", note: "" });
    const again = normalizePlot(JSON.parse(JSON.stringify(data)), "Principale");
    expect(again.links.map((l) => l.id)).toContain("k3");
  });
});
