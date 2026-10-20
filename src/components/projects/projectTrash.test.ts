import { describe, expect, it } from "vitest";
import { daysLeft, PROJECT_TRASH_DAYS } from "./ProjectTrashList";
import { overallPercent } from "./GanixProgress";

const DAY = 24 * 60 * 60 * 1000;

describe("corbeille des projets", () => {
  it("compte les jours avant la suppression définitive", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");

    expect(daysLeft("2026-10-20T12:00:00Z", now)).toBe(PROJECT_TRASH_DAYS);
    expect(daysLeft(new Date(now - 10 * DAY).toISOString(), now)).toBe(20);
    expect(daysLeft(new Date(now - 29.5 * DAY).toISOString(), now)).toBe(1);
    expect(daysLeft(new Date(now - 31 * DAY).toISOString(), now)).toBe(0);
  });
});

describe("progression .ganix", () => {
  it("convertit chaque étape en pourcentage global", () => {
    expect(overallPercent({ operation: "export", stage: "data", done: 0, total: 10 })).toBe(0);
    expect(overallPercent({ operation: "export", stage: "data", done: 5, total: 10 })).toBe(35);
    expect(overallPercent({ operation: "export", stage: "files", done: 2, total: 2 })).toBe(95);
    expect(overallPercent({ operation: "export", stage: "verify", done: 0, total: 0 })).toBe(95);
    expect(overallPercent({ operation: "import", stage: "files", done: 0, total: 0 })).toBe(0);
    expect(overallPercent({ operation: "import", stage: "build", done: 50, total: 100 })).toBe(65);
    expect(overallPercent({ operation: "import", stage: null, done: 0, total: 0 })).toBe(100);
  });

  it("ne dépasse jamais la fin de l'étape", () => {
    expect(overallPercent({ operation: "import", stage: "build", done: 120, total: 100 })).toBe(100);
  });
});
