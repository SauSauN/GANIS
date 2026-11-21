import { describe, expect, it } from "vitest";
import { frameStyle, isNeutralFrame, normalizeFrame, panFrame, portraitFrameKey, imageFrameKey, MAX_ZOOM, stepZoom, wheelZoomFactor } from "@/lib/imageFrame";

describe("cadrage des images", () => {
  it("n'ajoute aucun style pour une image centrée sans zoom", () => {
    expect(frameStyle(null)).toBeUndefined();
    expect(frameStyle({ x: 50, y: 50, zoom: 1 })).toBeUndefined();
    expect(isNeutralFrame({ x: 50, y: 50, zoom: 1 })).toBe(true);
  });

  it("place le point choisi et agrandit autour de lui", () => {
    expect(frameStyle({ x: 20, y: 70, zoom: 2 })).toEqual({
      objectFit: "cover",
      objectPosition: "20% 70%",
      transform: "scale(2)",
      transformOrigin: "20% 70%",
    });
    expect(frameStyle({ x: 20, y: 70, zoom: 1 })?.transform).toBeUndefined();
  });

  it("garde le cadrage dans ses bornes", () => {
    expect(normalizeFrame({ x: -5, y: 120, zoom: 9 })).toEqual({ x: 0, y: 100, zoom: MAX_ZOOM });
    expect(normalizeFrame({ x: 33.333, y: 66.666, zoom: 1.234 })).toEqual({ x: 33.3, y: 66.7, zoom: 1.23 });
  });

  it("fait suivre le pointeur à l'image quand on la fait glisser", () => {
    const box = { width: 200, height: 200 };
    // Image en paysage (400 × 200) dans un cadre carré : 200 px de marge en largeur, aucune en hauteur.
    const landscape = { width: 400, height: 200 };
    const moved = panFrame({ x: 50, y: 50, zoom: 1 }, 50, 50, box, landscape);
    // Glisser vers la droite montre la gauche de l'image ; la hauteur, entière, ne bouge pas.
    expect(moved).toEqual({ x: 25, y: 50, zoom: 1 });
    // Avec un zoom ×2, la marge double : le même geste déplace deux fois moins.
    expect(panFrame({ x: 50, y: 50, zoom: 2 }, 50, 0, box, landscape).x).toBeCloseTo(50 - (50 / 600) * 100, 1);
    // Jamais au-delà du bord.
    expect(panFrame({ x: 10, y: 50, zoom: 1 }, 500, 0, box, landscape).x).toBe(0);
  });

  it("ne perd pas les petits mouvements avec un fort zoom", () => {
    const box = { width: 320, height: 320 };
    const image = { width: 1200, height: 800 };
    const start = { x: 50, y: 50, zoom: 4 };
    // Vingt mouvements d'un pixel vont aussi loin qu'un seul de vingt pixels…
    let step = start;
    for (let i = 0; i < 20; i++) step = panFrame(step, 1, 1, box, image);
    const once = panFrame(start, 20, 20, box, image);
    expect(step.x).toBeCloseTo(once.x, 6);
    expect(step.y).toBeCloseTo(once.y, 6);
    // … et l'image a bien bougé (avant, l'arrondi à chaque mouvement la bloquait).
    expect(step.x).toBeLessThan(start.x - 0.5);
  });

  it("zoome selon l'ampleur du mouvement : souris, pavé tactile, pincement", () => {
    // Un cran de molette de souris ≈ ×1,1 (vers le haut : on agrandit).
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(1.105, 2);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    // Molette en lignes (certaines souris) : même ordre de grandeur.
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-99, 0, false), 6);
    // Défilement à deux doigts : beaucoup de petits pas, qui finissent par zoomer nettement.
    let zoom = 1;
    for (let i = 0; i < 30; i++) zoom *= wheelZoomFactor(-4, 0, false);
    expect(zoom).toBeGreaterThan(1.5);
    // Pincer (Ctrl) : plus sensible, pour suivre les doigts.
    expect(wheelZoomFactor(-4, 0, true)).toBeGreaterThan(wheelZoomFactor(-4, 0, false));
    zoom = 1;
    for (let i = 0; i < 20; i++) zoom *= wheelZoomFactor(-3, 0, true);
    expect(zoom).toBeGreaterThan(1.7);
    // Un mouvement énorme reste un pas raisonnable.
    expect(wheelZoomFactor(-5000, 0, false)).toBeCloseTo(wheelZoomFactor(-300, 0, false), 6);
  });

  it("les boutons − / + vont de 10 % en 10 %, sur des valeurs rondes", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.1, 6);
    expect(stepZoom(1.5, 1)).toBeCloseTo(1.6, 6);
    expect(stepZoom(1.5, -1)).toBeCloseTo(1.4, 6);
    // Après un zoom à la molette (137 %) : la dizaine suivante ou précédente.
    expect(stepZoom(1.37, 1)).toBeCloseTo(1.4, 6);
    expect(stepZoom(1.37, -1)).toBeCloseTo(1.3, 6);
    // Bornes : 100 % et 500 %.
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(4.95, 1)).toBe(MAX_ZOOM);
  });

  it("nomme les images cadrées", () => {
    expect(portraitFrameKey("location", "abc")).toBe("location:abc");
    expect(imageFrameKey("xyz")).toBe("image:xyz");
  });
});
