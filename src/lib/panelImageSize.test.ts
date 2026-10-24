// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  PANEL_IMAGE_DEFAULT,
  PANEL_IMAGE_MAX,
  PANEL_IMAGE_MIN,
  clampPanelImageSize,
  getPanelImageSize,
  setPanelImageSize,
} from "./preferences";

describe("taille des images du panneau du milieu", () => {
  it("reste dans ses bornes, sur un multiple du pas", () => {
    expect(clampPanelImageSize(2)).toBe(PANEL_IMAGE_MIN);
    expect(clampPanelImageSize(500)).toBe(PANEL_IMAGE_MAX);
    expect(clampPanelImageSize(29)).toBe(28);
    expect(clampPanelImageSize(Number.NaN)).toBe(PANEL_IMAGE_DEFAULT);
  });

  it("s'enregistre et s'applique en variable CSS", () => {
    setPanelImageSize(40);
    expect(getPanelImageSize()).toBe(40);
    expect(document.documentElement.style.getPropertyValue("--panel-thumb")).toBe("2.5rem");
    localStorage.setItem("ganis-panel-image-size", "999");
    expect(getPanelImageSize()).toBe(PANEL_IMAGE_MAX);
  });
});
