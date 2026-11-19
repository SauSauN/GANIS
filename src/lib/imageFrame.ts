import type { CSSProperties } from "react";

/*
 * Cadrage d'une image : la zone affichée dans son cadre (photo, vignette,
 * bandeau…), sans toucher à l'image elle-même (voir
 * `image_frame_service.rs`).
 *
 * L'image remplit son cadre (`object-fit: cover`). Le point (x %, y %) de
 * l'image est placé au même endroit relatif du cadre (`object-position`),
 * puis l'image est agrandie autour de ce point (`zoom`). Le même cadrage
 * vaut ainsi pour un cadre carré, rond ou en bandeau.
 */

export interface ImageFrame {
  /** Point de l'image gardé en place, en % de sa largeur (0 à 100). */
  x: number;
  /** … et de sa hauteur. */
  y: number;
  /** 1 : l'image remplit juste le cadre ; jusqu'à `MAX_ZOOM`. */
  zoom: number;
}

export const MAX_ZOOM = 5;

export const NEUTRAL_FRAME: ImageFrame = { x: 50, y: 50, zoom: 1 };

/** Clé du cadrage de l'image principale d'une fiche. */
export const portraitFrameKey = (kind: string, id: string) => `${kind}:${id}`;

/** Clé du cadrage d'une image de galerie. */
export const imageFrameKey = (imageId: string) => `image:${imageId}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Cadrage remis dans ses bornes, sans arrondi : pendant qu'on fait glisser
 * l'image, un arrondi à chaque mouvement annulerait les petits déplacements
 * (surtout avec un fort zoom, où un pixel ne vaut qu'une fraction de %).
 */
export function clampFrame(frame: ImageFrame): ImageFrame {
  return { x: clamp(frame.x, 0, 100), y: clamp(frame.y, 0, 100), zoom: clamp(frame.zoom, 1, MAX_ZOOM) };
}

/** Cadrage remis dans ses bornes et arrondi, pour l'enregistrer. */
export function normalizeFrame(frame: ImageFrame): ImageFrame {
  return {
    x: Math.round(clamp(frame.x, 0, 100) * 10) / 10,
    y: Math.round(clamp(frame.y, 0, 100) * 10) / 10,
    zoom: Math.round(clamp(frame.zoom, 1, MAX_ZOOM) * 100) / 100,
  };
}

export function isNeutralFrame(frame: ImageFrame | null | undefined): boolean {
  return !frame || (Math.abs(frame.x - 50) < 0.01 && Math.abs(frame.y - 50) < 0.01 && Math.abs(frame.zoom - 1) < 0.001);
}

/** Style de l'image (`<img>` qui remplit un cadre `overflow: hidden`). */
export function frameStyle(frame: ImageFrame | null | undefined): CSSProperties | undefined {
  if (isNeutralFrame(frame)) return undefined;
  const { x, y, zoom } = frame!;
  return {
    objectFit: "cover",
    objectPosition: `${x}% ${y}%`,
    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
    transformOrigin: `${x}% ${y}%`,
  };
}

/** Pas des boutons − / + du zoom (10 %). */
export const ZOOM_STEP = 0.1;

/**
 * Zoom après un clic sur − (`-1`) ou + (`1`) : la dizaine de % suivante
 * (137 % → 140 % ou 130 %), pour retomber sur des valeurs rondes même après
 * un zoom à la molette.
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const tens = zoom / ZOOM_STEP;
  const next = direction > 0 ? Math.floor(tens + 1e-6) + 1 : Math.ceil(tens - 1e-6) - 1;
  return Math.min(MAX_ZOOM, Math.max(1, Math.round(next) * ZOOM_STEP));
}

/**
 * Facteur de zoom d'un événement « molette ». Il dépend de l'ampleur du
 * mouvement, pour convenir à tous les appareils :
 * - molette de souris : un cran (≈ 100 px) ≈ ×1,1 ;
 * - défilement à deux doigts sur le pavé tactile : beaucoup de petits
 *   mouvements, qui s'additionnent en un zoom progressif ;
 * - pincer sur le pavé tactile : le système l'envoie comme une molette avec
 *   Ctrl, en tout petits pas : plus sensible, pour suivre les doigts.
 * `deltaMode` : 0 en pixels, 1 en lignes, 2 en pages.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const pixels = deltaY * (deltaMode === 1 ? 33 : deltaMode === 2 ? 800 : 1);
  // Un cran de molette ne doit jamais dépasser un pas raisonnable.
  const limited = Math.max(-300, Math.min(300, pixels));
  const sensitivity = ctrlKey ? 0.01 : Math.abs(limited) >= 50 ? 0.001 : 0.004;
  return Math.exp(-limited * sensitivity);
}

/**
 * Déplace le cadrage quand on fait glisser l'image de (dx, dy) pixels dans
 * un cadre de `box` pixels, pour une image de `image` pixels : le point
 * saisi suit le pointeur. Une image qui tient entière dans le cadre ne se
 * déplace pas dans ce sens.
 */
export function panFrame(
  frame: ImageFrame,
  dx: number,
  dy: number,
  box: { width: number; height: number },
  image: { width: number; height: number },
): ImageFrame {
  const cover = Math.max(box.width / image.width, box.height / image.height);
  // Marge de l'image agrandie au-delà du cadre, dans chaque sens.
  const slackX = image.width * cover * frame.zoom - box.width;
  const slackY = image.height * cover * frame.zoom - box.height;
  return clampFrame({
    ...frame,
    x: slackX > 0.5 ? frame.x - (dx / slackX) * 100 : frame.x,
    y: slackY > 0.5 ? frame.y - (dy / slackY) * 100 : frame.y,
  });
}
