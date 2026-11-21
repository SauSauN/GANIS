import { api, isTauri } from "@/lib/api";
import { exportFileName } from "@/lib/novel";

/** Extension de fichier d'un type d'image (`image/png` → `png`). */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Contenu et extension d'une image `data:` (`null` si ce n'en est pas une). */
export function decodeDataUrl(url: string): { bytes: Uint8Array; extension: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!match) return null;
  const extension = EXTENSIONS[match[1].toLowerCase()];
  if (!extension) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, extension };
}

/**
 * Télécharge une image affichée dans GANIS (galerie, logo, fiches) : la
 * fenêtre « Enregistrer sous » du système s'ouvre, avec `name` comme nom
 * de fichier proposé. Renvoie le nom du fichier écrit, ou `null` si
 * l'utilisateur a annulé.
 */
export async function downloadImage(url: string, name: string, dialogTitle: string): Promise<string | null> {
  const image = decodeDataUrl(url);
  if (!image) throw new Error("Image illisible.");
  const fileName = exportFileName(name, image.extension);

  if (isTauri()) return api.saveExportFile(fileName, dialogTitle, image.bytes);

  // Navigateur (développement) : téléchargement classique.
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  return fileName;
}
