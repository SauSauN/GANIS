/*
 * Préparation de la photo d'un personnage avant l'envoi à Rust.
 *
 * L'image choisie est redessinée dans un canevas :
 * - réduite (côté le plus long : 768 px au plus), pour que la base du
 *   projet reste légère ;
 * - réencodée en WebP (JPEG si le WebP n'est pas disponible) ;
 * - débarrassée de ses métadonnées (position GPS, appareil…), qui ne
 *   sont pas recopiées par le canevas.
 *
 * Rust vérifie ensuite le type réel de l'image et sa taille.
 */

/** Côté le plus long de la photo enregistrée (px). */
export const PORTRAIT_MAX_SIDE = 768;

/** Côté le plus long d'une image de la galerie (px). */
export const GALLERY_MAX_SIDE = 1280;

/** Taille maximale du fichier choisi (avant réduction). */
export const PORTRAIT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Formats acceptés à l'ouverture du sélecteur de fichiers. */
export const PORTRAIT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export type PortraitErrorCode = "notImage" | "fileTooLarge" | "unreadable";

export interface PreparedPortrait {
  /** Image encodée en base64. */
  data: string;
  /** Type de l'image (`image/webp` ou `image/jpeg`). */
  mime: string;
}

export class PortraitError extends Error {
  constructor(readonly code: PortraitErrorCode) {
    super(code);
    this.name = "PortraitError";
  }
}

/** Dimensions réduites, en gardant les proportions. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Essai suivant : élément <img>.
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new PortraitError("unreadable");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new PortraitError("unreadable"));
    reader.readAsDataURL(blob);
  });
}

/** Vrai si le fichier semble être une image (le type réel est vérifié par Rust). */
export function looksLikeImage(file: File): boolean {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

/**
 * Réduit et réencode une image choisie par l'utilisateur.
 * Renvoie l'image encodée en base64 (prête pour `setCharacterPortrait`)
 * et son type.
 */
export async function preparePortrait(
  file: File,
  maxSide: number = PORTRAIT_MAX_SIDE,
): Promise<PreparedPortrait> {
  if (!looksLikeImage(file)) {
    throw new PortraitError("notImage");
  }

  if (file.size > PORTRAIT_MAX_FILE_BYTES) {
    throw new PortraitError("fileTooLarge");
  }

  const image = await decode(file);
  const { width, height } = fitWithin(image.width, image.height, maxSide);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new PortraitError("unreadable");
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  let blob = await toBlob(canvas, "image/webp", 0.85);

  // Sans WebP, le navigateur renvoie un PNG : on préfère un JPEG, plus
  // léger, sur fond blanc (le JPEG n'a pas de transparence).
  if (!blob || blob.type !== "image/webp") {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg", 0.88);
  }

  if (!blob) {
    throw new PortraitError("unreadable");
  }

  return { data: await blobToBase64(blob), mime: blob.type };
}
