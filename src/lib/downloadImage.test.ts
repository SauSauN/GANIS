import { describe, expect, it } from "vitest";
import { decodeDataUrl } from "@/lib/downloadImage";

describe("téléchargement d'une image", () => {
  it("lit le contenu et l'extension d'une image data:", () => {
    // « GANIS » en base64.
    const png = decodeDataUrl("data:image/png;base64,R0FOSVM=");
    expect(png?.extension).toBe("png");
    expect(Array.from(png?.bytes ?? [])).toEqual([71, 65, 78, 73, 83]);
    expect(decodeDataUrl("data:image/jpeg;base64,R0FOSVM=")?.extension).toBe("jpg");
    expect(decodeDataUrl("data:image/webp;base64,R0FOSVM=")?.extension).toBe("webp");
  });

  it("refuse ce qui n'est pas une image connue", () => {
    expect(decodeDataUrl("https://exemple.fr/image.png")).toBeNull();
    expect(decodeDataUrl("data:text/plain;base64,R0FOSVM=")).toBeNull();
  });
});
