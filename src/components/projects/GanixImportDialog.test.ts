import { describe, expect, it } from "vitest";
import { formatBytes } from "@/components/projects/GanixImportDialog";
import en from "@/i18n/locales/en/projects.json";
import fr from "@/i18n/locales/fr/projects.json";
import enErrors from "@/i18n/locales/en/errors.json";
import frErrors from "@/i18n/locales/fr/errors.json";

describe("import .ganix", () => {
  it("affiche une taille lisible", () => {
    expect(formatBytes(512, "fr")).toBe("512 o");
    expect(formatBytes(1536, "fr")).toBe("1,5 Ko");
    expect(formatBytes(25 * 1024 * 1024, "en")).toBe("25 MB");
  });

  it("traduit les mêmes messages en français et en anglais", () => {
    expect(Object.keys(en.ganix.import.counts)).toEqual(Object.keys(fr.ganix.import.counts));
    expect(Object.keys(enErrors.ganix).sort()).toEqual(Object.keys(frErrors.ganix).sort());
  });
});
