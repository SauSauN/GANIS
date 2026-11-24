import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  ageAt,
  blankPlot,
  DEFAULT_YEAR,
  computeIssues,
  timeline,
  timelineRange,
  timelineStep,
  timelineStepAt,
  timelineGaps,
  timelineTicks,
  datePartsOf,
  instantOf,
  updateWhen,
  yearInText,
  dropMissing,
  eventsOfCharacter,
  eventsOfEntry,
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
    entries: [],
    nodeId: null,
    alsoNodeIds: [],
    noteIds: [],
    date: "",
    year: null,
    yearEnd: null,
    yearDetail: null,
    yearEndDetail: null,
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

  it("timeline: years, story start, eras, ages", () => {
    const data = sample();
    data.events[0].year = 322;
    data.events[1].year = 301;
    data.events[1].yearEnd = 318;
    const { items, undated, storyStart } = timeline(data);
    // Les deux événements datés, puis ceux sans année, placés en l'an 2000.
    expect(items.slice(0, 2).map((i) => [i.event.id, i.from, i.to])).toEqual([["e2", 301, 318], ["e1", 322, 322]]);
    expect(items.slice(2).every((i) => i.from === DEFAULT_YEAR && i.event.year === null)).toBe(true);
    expect(items.length).toBe(data.events.length);
    expect(undated.length).toBe(data.events.length - 2);
    expect(storyStart).toBe(Math.min(...items.filter((i) => i.event.row >= 0 && i.event.year !== null).map((i) => i.from)));
    // L'année de naissance vient de la fiche du personnage (texte libre).
    expect(yearInText("12 mars 1890")).toBe(1890);
    expect(yearInText("an 299, 3e lune")).toBe(299);
    expect(yearInText("1890-03-12")).toBe(1890);
    expect(yearInText("-45")).toBe(-45);
    expect(yearInText("au printemps")).toBeNull();
    expect(yearInText(undefined)).toBeNull();
    expect(ageAt(300, 322)).toBe(22);
    expect(ageAt(300, 299)).toBeNull();
    expect(ageAt(null, 322)).toBeNull();
    expect(timelineStep(50)).toBe(10);
    // 64 px par année et 64 px entre deux graduations : chaque année.
    expect(timelineStepAt(64, 64)).toBe(1);
    expect(timelineStepAt(20, 64)).toBe(5);
    expect(timelineStepAt(1, 64)).toBe(100);
    expect(timelineStep(4)).toBe(1);
    expect(timelineRange(data, items.slice(0, 2))).toEqual({ from: 301 - 1, to: 322 + 1 });

    // Lecture d'un document : années entières, fin après le début, époques triées.
    const read = normalizePlot(
      {
        lanes: [{ id: "l1" }],
        events: [
          { id: "a", laneId: "l1", row: 0, year: "312", yearEnd: 300 },
          { id: "b", laneId: "l1", row: 1, year: 1.5, yearEnd: 4 },
        ],
        eras: [{ name: "Exil", from: 330, to: 318 }, { name: "Paix", from: 280, to: 301 }, { name: "?", from: "x", to: 2 }],
        yearLabel: "  an  ",
      },
      "Principale",
    );
    expect(read.events.map((e) => [e.year, e.yearEnd])).toEqual([[312, null], [null, null]]);
    expect(read.eras.map((e) => [e.name, e.from, e.to])).toEqual([["Paix", 280, 301], ["Exil", 318, 330]]);
    expect(read.yearLabel).toBe("an");

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

describe("fiches du monde dans la trame", () => {
  it("garde les sortes connues, sans doublon, et retrouve les événements d'une fiche", () => {
    const data = normalizePlot(
      {
        lanes: [{ id: "a", name: "A" }],
        events: [
          { id: "e1", laneId: "a", row: 0, entries: [{ kind: "item", id: "i1" }, { kind: "item", id: "i1" }, { kind: "plot", id: "x" }, { kind: "faction", id: "f1" }] },
          { id: "e2", laneId: "a", row: 1 },
        ],
      },
      "A",
    );
    expect(data.events[0].entries).toEqual([{ kind: "item", id: "i1" }, { kind: "faction", id: "f1" }]);
    expect(data.events[1].entries).toEqual([]);
    expect(eventsOfEntry(data, "item", "i1").map((e) => e.id)).toEqual(["e1"]);
    expect(eventsOfEntry(data, "magic", "i1")).toEqual([]);
  });
});

describe("frise au mois, au jour, à l'heure", () => {
  it("place un instant dans l'année selon la précision", () => {
    const detail = { month: 3, day: 2, hour: 12 };
    expect(instantOf(1850, detail, "year")).toBe(1850);
    // 1850 n'est pas bissextile : mars commence au 59e jour.
    expect(instantOf(1850, detail, "month")).toBeCloseTo(1850 + 59 / 365);
    expect(instantOf(1850, detail, "day")).toBeCloseTo(1850 + 60 / 365);
    expect(instantOf(1850, detail, "hour")).toBeCloseTo(1850 + 60.5 / 365);
    expect(datePartsOf(instantOf(2000, { month: 2, day: 29, hour: 23 }))).toEqual({ year: 2000, month: 2, day: 29, hour: 23 });
  });

  it("garde une date cohérente quand on la change", () => {
    const e = ev("e", "l", 0, { year: 1850 });
    updateWhen(e, "start", { month: 2, day: 31 });
    expect(e.yearDetail).toEqual({ month: 2, day: 28, hour: null });
    updateWhen(e, "start", { hour: 9 });
    expect(e.yearDetail?.hour).toBe(9);
    // Choisir le mois de fin sans année de fin : même année que le début.
    updateWhen(e, "end", { month: 5 });
    expect([e.yearEnd, e.yearEndDetail?.month]).toEqual([1850, 5]);
    // Une fin qui passe avant le début est retirée.
    updateWhen(e, "start", { month: 7 });
    expect([e.yearEnd, e.yearEndDetail]).toEqual([null, null]);
    // Sans mois, plus de jour ni d'heure.
    updateWhen(e, "start", { month: null });
    expect(e.yearDetail).toBeNull();
  });

  it("lit les dates et la précision enregistrées", () => {
    const read = normalizePlot(
      {
        lanes: [{ id: "l1", name: "A" }],
        timePrecision: "day",
        events: [
          { id: "a", laneId: "l1", row: 0, year: 1850, yearDetail: { month: 4, day: 31, hour: 5 } },
          { id: "b", laneId: "l1", row: 1, year: 1850, yearDetail: { month: 3 }, yearEnd: 1850, yearEndDetail: { month: 6, day: 1 } },
        ],
      },
      "A",
    );
    expect(read.timePrecision).toBe("day");
    // Le 31 avril n'existe pas : ni jour, ni heure.
    expect(read.events[0].yearDetail).toEqual({ month: 4, day: null, hour: null });
    expect([read.events[1].yearEnd, read.events[1].yearEndDetail]).toEqual([1850, { month: 6, day: 1, hour: null }]);
    expect(normalizePlot({ lanes: [], timePrecision: "minute" }, "A").timePrecision).toBe("year");
  });

  it("choisit les graduations les plus fines que la précision permet", () => {
    const perYear = 365.25 * 64;
    const days = timelineTicks(1850, 1850 + 10 / 365, perYear, 64, "day");
    expect(days.unit).toBe("day");
    expect(days.ticks[0]).toMatchObject({ year: 1850, month: 1, day: 1, major: true });
    // Même échelle, précision limitée au mois : pas de graduation par jour.
    expect(timelineTicks(1850, 1851, perYear, 64, "month").unit).toBe("month");
    expect(timelineTicks(1850, 1851, perYear, 64, "year").unit).toBe("year");
    const hours = timelineTicks(1850, 1850 + 1 / 365, 8766 * 64, 64, "hour");
    expect([hours.unit, hours.step, hours.ticks.length]).toEqual(["hour", 1, 25]);
  });

  it("chaque palier du zoom donne un écart de graduations différent", () => {
    const shown = timelineGaps("hour", 100).map((gap) => {
      const { unit, step } = timelineTicks(1850, 1850.01, (64 / gap) * 1.0001, 64, "hour");
      return `${step} ${unit}`;
    });
    expect(shown).toEqual(["100 year", "50 year", "20 year", "10 year", "5 year", "2 year", "1 year", "6 month", "3 month", "1 month", "7 day", "1 day", "12 hour", "6 hour", "3 hour", "1 hour"]);
    expect(timelineGaps("year", 10)).toEqual([10, 5, 2, 1]);
  });

  it("le début du récit ignore les événements sans année", () => {
    const data = blankPlot("A");
    const lane = data.lanes[0].id;
    data.events = [ev("passe", lane, -1, { year: 2100 }), ev("debut", lane, 0, { year: 2150 }), ev("sans", lane, 1, { year: null })];
    // L'événement sans année est placé en 2000 sur la frise, mais ne fixe pas le début du récit.
    expect(timeline(data).storyStart).toBe(2150);
    data.events[1].year = null;
    expect(timeline(data).storyStart).toBeNull();
  });
});
