import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadDocumentBlob } from "@/lib/documents";
import type { StructureDocument } from "@/types";

const THUMBNAIL_WIDTH = 320;
/** Vignettes calculées en parallèle : décoder une planche pèse lourd. */
const THUMBNAIL_WORKERS = 2;

export type ThumbnailLoader = (document: StructureDocument) => Promise<string | null>;

/** Réduit une planche en vignette ; à défaut, l'image telle quelle (SVG…). */
async function thumbnailUrl(blob: Blob): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob, { resizeWidth: THUMBNAIL_WIDTH, resizeQuality: "high" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    // Fond blanc : une planche à fond transparent reste lisible en JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const small = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return URL.createObjectURL(small ?? blob);
  } catch {
    return URL.createObjectURL(blob);
  }
}

/**
 * Vignettes d'une vue, en mémoire seulement et effacées à sa fermeture : ce
 * sont des copies en clair de dessins chiffrés dans le projet.
 */
export function useThumbnails(projectId: string): ThumbnailLoader {
  const cache = useRef(new Map<string, Promise<string | null>>());
  const queue = useRef<Array<() => void>>([]);
  const running = useRef(0);

  useEffect(() => {
    const entries = cache.current;
    return () => {
      entries.forEach((url) => void url.then((value) => value && URL.revokeObjectURL(value)));
      entries.clear();
      queue.current = [];
    };
  }, []);

  return (document) => {
    const key = `${document.id}:${document.updatedAt}`;
    const known = cache.current.get(key);
    if (known) return known;
    const result = new Promise<string | null>((resolve) => {
      const start = () => {
        running.current += 1;
        loadDocumentBlob(projectId, document)
          .then(thumbnailUrl)
          .then(resolve, () => resolve(null))
          .finally(() => {
            running.current -= 1;
            queue.current.shift()?.();
          });
      };
      if (running.current < THUMBNAIL_WORKERS) start();
      else queue.current.push(start);
    });
    cache.current.set(key, result);
    return result;
  };
}

/** Vignette chargée quand elle approche de l'écran. Remplit son parent. */
export function Thumbnail({ document, load, alt }: { document: StructureDocument; load: ThumbnailLoader; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "600px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const version = `${document.id}:${document.updatedAt}`;
  useEffect(() => {
    if (!near) return;
    let stale = false;
    void load(document).then((value) => !stale && setUrl(value));
    return () => {
      stale = true;
    };
    // `load` change à chaque rendu ; seule la version du dessin compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, version]);

  return (
    <div ref={ref} className="absolute inset-0 flex items-center justify-center bg-white">
      {url ? <img src={url} alt={alt} className="size-full object-contain" /> : <Loader2 className="size-4 animate-spin text-neutral-400" aria-hidden="true" />}
    </div>
  );
}
