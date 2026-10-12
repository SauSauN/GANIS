import { describe, expect, it } from "vitest";
import { buildYear, formatDuration, levelOf, levelThresholds, summarize } from "@/lib/workCalendar";

const d = (day: string, minutes: number) => ({ day, minutes, actions: minutes * 2 });

describe("calendrier de travail", () => {
  it("365 cases rangées en semaines du lundi, mois repérés", () => {
    const { cells, weeks, monthStarts } = buildYear(2026, [], new Date(2026, 9, 12));
    expect(cells).toHaveLength(365);
    // 1er janvier 2026 : un jeudi (ligne 3, colonne 0).
    expect(cells[0]).toMatchObject({ day: "2026-01-01", week: 0, weekday: 3 });
    expect(weeks).toBe(53);
    expect(monthStarts[0]).toBe(0);
    expect(cells.find((c) => c.day === "2026-10-13")?.future).toBe(true);
    expect(cells.find((c) => c.day === "2026-10-12")?.future).toBe(false);
    expect(buildYear(2024, []).cells).toHaveLength(366);
  });

  it("niveaux : seuils fixes avec peu de jours, quartiles sinon", () => {
    expect(levelThresholds([d("2026-01-01", 30)])).toEqual([15, 60, 150]);
    expect(levelOf(0, [15, 60, 150])).toBe(0);
    expect(levelOf(10, [15, 60, 150])).toBe(1);
    expect(levelOf(200, [15, 60, 150])).toBe(4);
    const many = Array.from({ length: 9 }, (_, i) => d(`2026-02-0${i + 1}`, (i + 1) * 10));
    expect(levelThresholds(many)).toEqual([30, 50, 70]);
  });

  it("séries, pauses, mois et rythme", () => {
    const today = new Date(2026, 2, 10); // 10 mars
    const data = [
      d("2026-01-05", 60), d("2026-01-06", 30), d("2026-01-07", 90),
      d("2026-02-20", 120),
      d("2026-03-09", 20), d("2026-03-10", 40),
      d("2026-04-01", 999), // futur : ignoré
    ];
    const s = summarize(2026, data, today);
    expect(s.activeDays).toBe(6);
    expect(s.totalMinutes).toBe(360);
    expect(s.longestStreak).toEqual({ days: 3, from: "2026-01-05", to: "2026-01-07" });
    expect(s.currentStreak).toBe(2);
    expect(s.longestBreak).toEqual({ days: 43, from: "2026-01-08", to: "2026-02-19" });
    expect(s.busiestMonth).toBe(0);
    expect(s.busiestWeek).toEqual({ monday: "2026-01-05", minutes: 180 });
    expect(s.busiestDay?.day).toBe("2026-02-20");
    expect(s.rhythm).toBe("occasional");
    expect(summarize(2026, [], today).rhythm).toBe("none");
  });

  it("durées", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(135)).toBe("2 h 15");
    expect(formatDuration(120)).toBe("2 h");
  });
});
