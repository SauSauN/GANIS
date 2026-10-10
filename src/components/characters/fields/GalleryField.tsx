import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import {
  GALLERY_MAX_SIDE,
  PORTRAIT_ACCEPT,
  PortraitError,
  preparePortrait,
} from "@/lib/portraitImage";
import { cn } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import type { GalleryImage } from "@/types";

/** Nombre maximal d'images (identique à Rust). */
export const MAX_GALLERY_IMAGES = 30;

export interface GalleryItem {
  id: string;
  /** Image (`data:`) ; `null` pendant son chargement. */
  url: string | null;
}

interface GalleryGridProps {
  label: string;
  items: GalleryItem[];
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}

/**
 * Galerie de références visuelles : vignettes, ajout (bouton ou
 * glisser-déposer, plusieurs images à la fois), agrandissement au clic.
 */
export function GalleryGrid({ label, items, busy, error, disabled, onAdd, onRemove }: GalleryGridProps) {
  const { t } = useTranslation("characters");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [zoomed, setZoomed] = useState<GalleryItem | null>(null);

  const full = items.length >= MAX_GALLERY_IMAGES;
  const locked = disabled || busy || full;

  function onDrop(event: DragEvent) {
    setDragOver(false);
    if (locked) return;

    event.preventDefault();
    onAdd(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-medium">{label}</p>

      <div
        onDragOver={(event) => {
          if (locked || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "grid grid-cols-3 gap-3 rounded-lg sm:grid-cols-4 lg:grid-cols-5",
          dragOver && "ring-2 ring-primary ring-offset-4 ring-offset-card",
        )}
      >
        {items.map((item) => (
          <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
            {item.url ? (
              <button
                type="button"
                onClick={() => setZoomed(item)}
                className="block size-full focus-visible:outline-none"
                aria-label={t("gallery.open")}
              >
                <img src={item.url} alt="" className="size-full object-cover" draggable={false} />
              </button>
            ) : (
              <span className="flex size-full items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </span>
            )}

            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={disabled || busy}
              aria-label={t("gallery.remove")}
              title={t("gallery.remove")}
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {t("gallery.add")}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        multiple
        // `hidden` (et non `sr-only`, positionné en absolu) : le champ ne
        // doit jamais dépasser de la zone qui défile.
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("gallery.hint", { count: items.length, max: MAX_GALLERY_IMAGES })}
        </p>
      )}

      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogHeader>
          <DialogTitle className="sr-only">{label}</DialogTitle>
        </DialogHeader>
        {zoomed?.url && (
          <img src={zoomed.url} alt="" className="max-h-[70vh] w-full rounded-md object-contain" />
        )}
      </Dialog>
    </div>
  );
}

/** Message d'erreur d'une image refusée. */
function imageError(t: (key: string) => string, e: unknown): string {
  if (e instanceof PortraitError) return t(`portrait.errors.${e.code}`);
  return e instanceof Error ? e.message : String(e);
}

// ----------------------------------------------------------------------------
// Galerie d'un personnage enregistré
// ----------------------------------------------------------------------------

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = new Map<string, string>();

/** Images en cours de chargement : pas de demande en double. */
const inflight = new Set<string>();

interface CharacterGalleryProps {
  label: string;
  projectId: string;
  characterId: string;
  disabled?: boolean;
}

/** Galerie d'un personnage enregistré : chaque image est enregistrée tout de suite. */
export function CharacterGallery({ label, projectId, characterId, disabled }: CharacterGalleryProps) {
  const { t } = useTranslation("characters");
  const adjustGalleryCount = useCharacterStore((state) => state.adjustGalleryCount);

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .listCharacterGallery(projectId, characterId)
      .then((list) => !cancelled && setImages(list))
      .catch((e) => !cancelled && setError(imageError(t as (key: string) => string, e)));

    return () => {
      cancelled = true;
    };
  }, [projectId, characterId, t]);

  // Contenu des images, une par une (gardé en cache pour la session).
  useEffect(() => {
    for (const image of images) {
      if (urls[image.id] || inflight.has(image.id)) continue;

      const cached = urlCache.get(image.id);

      if (cached) {
        setUrls((current) => ({ ...current, [image.id]: cached }));
        continue;
      }

      inflight.add(image.id);

      api
        .getCharacterGalleryImage(projectId, image.id)
        .then((data) => {
          const url = `data:${data.mime};base64,${data.data}`;
          urlCache.set(image.id, url);
          setUrls((current) => ({ ...current, [image.id]: url }));
        })
        .catch(() => {})
        .finally(() => inflight.delete(image.id));
    }
  }, [images, projectId, urls]);

  async function add(files: File[]) {
    setBusy(true);
    setError(null);

    try {
      for (const file of files.slice(0, MAX_GALLERY_IMAGES - images.length)) {
        const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
        const image = await api.addCharacterGalleryImage(projectId, characterId, data);
        const url = `data:${mime};base64,${data}`;

        urlCache.set(image.id, url);
        setUrls((current) => ({ ...current, [image.id]: url }));
        setImages((current) => [...current, image]);
        adjustGalleryCount(projectId, characterId, 1);
      }
    } catch (e) {
      setError(imageError(t as (key: string) => string, e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);

    try {
      await api.deleteCharacterGalleryImage(projectId, id);
      urlCache.delete(id);
      setImages((current) => current.filter((image) => image.id !== id));
      adjustGalleryCount(projectId, characterId, -1);
    } catch (e) {
      setError(imageError(t as (key: string) => string, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GalleryGrid
      label={label}
      items={images.map((image) => ({ id: image.id, url: urls[image.id] ?? null }))}
      busy={busy}
      error={error}
      disabled={disabled}
      onAdd={(files) => void add(files)}
      onRemove={(id) => void remove(id)}
    />
  );
}

// ----------------------------------------------------------------------------
// Galerie d'un personnage pas encore créé
// ----------------------------------------------------------------------------

export interface PendingImage {
  id: string;
  data: string;
  url: string;
}

interface PendingGalleryProps {
  label: string;
  images: PendingImage[];
  onChange: (images: PendingImage[]) => void;
  disabled?: boolean;
}

/** Galerie du formulaire de création : les images sont envoyées après la création. */
export function PendingGallery({ label, images, onChange, disabled }: PendingGalleryProps) {
  const { t } = useTranslation("characters");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: File[]) {
    setBusy(true);
    setError(null);

    const added: PendingImage[] = [];

    try {
      for (const file of files.slice(0, MAX_GALLERY_IMAGES - images.length)) {
        const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
        added.push({ id: crypto.randomUUID(), data, url: `data:${mime};base64,${data}` });
      }
    } catch (e) {
      setError(imageError(t as (key: string) => string, e));
    } finally {
      onChange([...images, ...added]);
      setBusy(false);
    }
  }

  return (
    <GalleryGrid
      label={label}
      items={images}
      busy={busy}
      error={error}
      disabled={disabled}
      onAdd={(files) => void add(files)}
      onRemove={(id) => onChange(images.filter((image) => image.id !== id))}
    />
  );
}
