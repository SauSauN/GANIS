import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Crop, ImagePlus, Trash2, X } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { FrameEditor } from "@/components/common/FrameEditor";
import { InfoTip } from "@/components/common/InfoTip";
import { Button } from "@/components/ui/button";
import { frameStyle, imageFrameKey } from "@/lib/imageFrame";
import { notifyError } from "@/lib/notify";
import { useImageFrame, useImageFrameStore } from "@/stores/imageFrameStore";
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
import { errorText } from "@/lib/errors";
import { sessionMap } from "@/lib/sessionCache";

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
  /**
   * Projet des images enregistrées : chaque vignette peut être cadrée
   * depuis la vue en grand. Absent (images pas encore enregistrées) : pas de
   * cadrage.
   */
  projectId?: string;
}

/**
 * Galerie de références visuelles : vignettes, ajout (bouton ou
 * glisser-déposer, plusieurs images à la fois), agrandissement au clic.
 */
export function GalleryGrid({ label, items, busy, error, disabled, onAdd, onRemove, projectId }: GalleryGridProps) {
  const { t } = useTranslation("characters");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Image affichée en grand (position dans `items`), ou `null`. */
  const [zoomed, setZoomed] = useState<number | null>(null);

  const full = items.length >= MAX_GALLERY_IMAGES;
  const locked = disabled || busy || full;
  const removal = useConfirmImageRemoval<string>(async (id) => {
    await onRemove(id);
    if (projectId) void useImageFrameStore.getState().setFrame(projectId, imageFrameKey(id), null).catch(() => {});
    // L'image affichée en grand vient d'être retirée : on referme.
    setZoomed(null);
  });

  function onDrop(event: DragEvent) {
    setDragOver(false);
    if (locked) return;

    event.preventDefault();
    onAdd(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-2 @md:col-span-2">
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
                onClick={() => setZoomed(items.indexOf(item))}
                className="block size-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label={t("gallery.open")}
              >
                <GalleryThumb projectId={projectId} id={item.id} url={item.url} />
              </button>
            ) : (
              <span className="flex size-full items-center justify-center">
                <LoadingDots className="size-4 text-muted-foreground" />
              </span>
            )}

            <button
              type="button"
              onClick={() => removal.ask(item.id)}
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
            {busy ? <LoadingDots className="size-5" /> : <ImagePlus className="size-5" />}
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

      <ImageViewer
        label={label}
        items={items}
        index={zoomed}
        onIndexChange={setZoomed}
        projectId={projectId}
        onRemove={disabled || busy ? undefined : (id) => removal.ask(id)}
      />
      {removal.dialog}
    </div>
  );
}

/** Vignette d'une image de galerie, avec son cadrage. */
function GalleryThumb({ projectId, id, url }: { projectId?: string; id: string; url: string }) {
  const frame = useImageFrame(projectId, projectId ? imageFrameKey(id) : null);
  return <img src={url} alt="" className="size-full object-cover" style={frameStyle(frame)} draggable={false} />;
}

/**
 * Image en grand, sur presque tout l'écran : flèches (boutons ou ← →) pour
 * passer d'une image à l'autre, Échap ou un clic à côté pour fermer. Images
 * enregistrées : cadrage de la vignette et retrait.
 */
function ImageViewer({
  label,
  items,
  index,
  onIndexChange,
  projectId,
  onRemove,
}: {
  label: string;
  items: GalleryItem[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  projectId?: string;
  onRemove?: (id: string) => void;
}) {
  const { t } = useTranslation(["characters", "common"]);
  const open = index !== null && index >= 0 && index < items.length;
  const count = items.length;
  const [framing, setFraming] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = open ? items[index] : null;
  const frame = useImageFrame(projectId, projectId && current ? imageFrameKey(current.id) : null);
  const setFrame = useImageFrameStore((s) => s.setFrame);

  // Autre image ou fenêtre refermée : on quitte le cadrage.
  useEffect(() => setFraming(false), [index, open]);

  useEffect(() => {
    if (!open || count < 2 || framing) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange(((index ?? 0) - 1 + count) % count);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange(((index ?? 0) + 1) % count);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, count, onIndexChange, framing]);

  const item = open ? items[index] : null;
  const navClass =
    "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-md transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  // Rendue hors de la fiche (portail) : la carte de la fiche ne doit pas
  // enfermer la fenêtre (voir `ImageDialog`).
  return createPortal(
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onIndexChange(null)}
      className="relative w-auto max-w-[96vw] overflow-hidden p-2"
    >
      <DialogHeader>
        <DialogTitle className="sr-only">{label}</DialogTitle>
      </DialogHeader>

      {item?.url && framing && projectId ? (
        <div className="w-[min(92vw,44rem)] space-y-4 p-4">
          {/* Titre du cadrage, avec son « i » (comme pour l'image d'une fiche). */}
          <div className="flex items-center gap-1.5 pr-10">
            <p className="text-lg font-semibold">{t("common:image.frameThumb")}</p>
            <InfoTip>{t("common:image.frameHint")}</InfoTip>
          </div>
          <FrameEditor
            url={item.url}
            frame={frame}
            busy={saving}
            onCancel={() => setFraming(false)}
            onSave={async (next) => {
              setSaving(true);
              try {
                await setFrame(projectId, imageFrameKey(item.id), next);
                setFraming(false);
              } catch (e) {
                notifyError(errorText(e), "image:frame");
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
      ) : item?.url ? (
        <img
          src={item.url}
          alt=""
          className="mx-auto block max-h-[calc(100vh-4rem)] max-w-full rounded-md object-contain"
          data-testid="gallery-viewer-image"
        />
      ) : (
        <span className="flex size-40 items-center justify-center">
          <LoadingDots className="size-6 text-muted-foreground" />
        </span>
      )}

      <button
        type="button"
        onClick={() => onIndexChange(null)}
        aria-label={t("gallery.close")}
        title={t("gallery.close")}
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-background/85 shadow-md hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>

      {item?.url && !framing && (projectId || onRemove) && (
        <div className="absolute right-3 bottom-3 flex gap-2">
          {onRemove && (
            <Button type="button" size="sm" variant="outline" className="bg-background/90 text-destructive shadow-md hover:text-destructive" onClick={() => onRemove(item.id)}>
              <Trash2 />
              {t("common:image.remove")}
            </Button>
          )}
          {projectId && (
            <Button type="button" size="sm" className="shadow-md" onClick={() => setFraming(true)}>
              <Crop />
              {t("common:image.frameThumb")}
            </Button>
          )}
        </div>
      )}

      {count > 1 && open && !framing && (
        <>
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + count) % count)}
            aria-label={t("gallery.previous")}
            title={t("gallery.previous")}
            className={cn(navClass, "left-3")}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % count)}
            aria-label={t("gallery.next")}
            title={t("gallery.next")}
            className={cn(navClass, "right-3")}
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-2.5 py-0.5 text-xs font-medium tabular-nums shadow-md">
            {t("gallery.position", { current: index + 1, total: count })}
          </span>
        </>
      )}
    </Dialog>,
    document.body,
  );
}

/** Message d'erreur d'une image refusée. */
function imageError(t: (key: string) => string, e: unknown): string {
  if (e instanceof PortraitError) return t(`portrait.errors.${e.code}`);
  return errorText(e);
}

// ----------------------------------------------------------------------------
// Galerie d'un personnage enregistré
// ----------------------------------------------------------------------------

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = sessionMap<string, string>();

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
      projectId={projectId}
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