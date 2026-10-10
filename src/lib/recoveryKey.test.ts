import { describe, expect, it } from "vitest";
import {
  isRecoveryKeyFormat,
  normalizeRecoveryGroup,
  splitRecoveryKey,
} from "./recoveryKey";

const KEY = "7KQ2MD-X94HTR-B3NW0C-PZ6EAJ-18VYGF-RM5S2K";

describe("clé de récupération", () => {
  it("se découpe en six groupes", () => {
    expect(splitRecoveryKey(KEY)).toEqual([
      "7KQ2MD",
      "X94HTR",
      "B3NW0C",
      "PZ6EAJ",
      "18VYGF",
      "RM5S2K",
    ]);
  });

  it("accepte les saisies approximatives", () => {
    expect(isRecoveryKeyFormat(KEY)).toBe(true);
    expect(isRecoveryKeyFormat(KEY.toLowerCase())).toBe(true);
    expect(isRecoveryKeyFormat(KEY.replace(/-/g, " "))).toBe(true);
    expect(isRecoveryKeyFormat(KEY.replace(/-/g, ""))).toBe(true);
  });

  it("corrige les confusions courantes dans un groupe", () => {
    expect(normalizeRecoveryGroup("b3nwoc")).toBe("B3NW0C");
    expect(normalizeRecoveryGroup(" iL8vyg ")).toBe("118VYG");
  });

  it("refuse ce qui n'a pas la forme d'une clé", () => {
    expect(isRecoveryKeyFormat("")).toBe(false);
    expect(isRecoveryKeyFormat("ABC-DEF")).toBe(false);
    expect(isRecoveryKeyFormat(`${KEY}-AAAAAA`)).toBe(false);
    expect(isRecoveryKeyFormat(KEY.replace("7", "U"))).toBe(false);
  });
});
