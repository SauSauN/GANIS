import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { GalleryGrid, MAX_GALLERY_IMAGES } from "@/components/characters/fields/GalleryField";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import {
  GALLERY_MAX_SIDE,
  PORTRAIT_ACCEPT,
  PortraitError,
  preparePortrait,
} from "@/lib/portraitImage";
import { cn } from "@/lib/utils";
import { useProjectLogo, useProjectLogoStore } from "@/stores/projectLogoStore";
import type { Project, ProjectImage } from "@/types";

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = new Map<string, string>();
const inflight = new Set<string>();

function useImageError() {
  const { t } = useTranslation("characters");
  return (e: unknown) => (e instanceof PortraitError ? t(`portrait.errors.${e.code}`) : errorText(e));
}

/** Charge le logo du projet (une fois) et le renvoie. */
function useLoadedLogo(projectId: string) {
  const url = useProjectLogo(projectId);
  const fetchLogo = useProjectLogoStore((state) => state.fetchLogo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogo(projectId).catch((e) => setError(errorText(e)));
  }, [projectId, fetchLogo]);

  return { url: url ?? null, error };
}

/** Classes du cadre du logo : même hauteur pour tous, largeur selon l'image. */
const logoFrame = "relative flex h-24 items-center justify-center overflow-hidden rounded-lg sm:h-28";

/**
 * Logo du projet sur l'accueil, à côté de son nom, en lecture seule (on
 * l'ajoute dans Détails › Galerie). Le cadre suit la forme de l'image : un
 * logo long reste entier, jamais rogné. Rien n'est affiché sans logo.
 */
export function ProjectLogo({ project }: { project: Project }) {
  const { t } = useTranslation("workspaceHome");
  const { url } = useLoadedLogo(project.id);

  if (!url) return null;

  return (
    <div className={cn(logoFrame, "ml-auto max-w-[min(100%,24rem)] shrink-0 justify-end")} data-testid="project-logo">
      <img
        src={url}
        alt={t("logo.alt", { name: project.name })}
        className="h-full w-auto max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}

/**
 * Ajout et changement du logo (Détails › Galerie). Sans logo, un cadre
 * « Ajouter un logo » ; un clic ou un dépôt d'image en ajoute un, le survol
 * propose de le remplacer ou de le retirer.
 */
export function ProjectLogoEditor({ project }: { project: Project }) {
  const { t } = useTranslation("workspaceHome");
  const imageError = useImageError();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const removal = useConfirmImageRemoval(() => remove());
  const loaded = useLoadedLogo(project.id);
  const url = loaded.url;
  const storeLogo = useProjectLogoStore((state) => state.setLogo);
  const setUrl = (next: string | null) => storeLogo(project.id, next);
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? loaded.error;

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { data } = await preparePortrait(file, GALLERY_MAX_SIDE);
      const logo = await api.setProjectLogo(project.id, data);
      setUrl(`data:${logo.mime};base64,${logo.data}`);
    } catch (e) {
      setError(imageError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.removeProjectLogo(project.id);
      setUrl(null);
    } catch (e) {
      setError(imageError(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent) {
    setDragOver(false);
    if (busy) return;
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void pick(file);
  }

  const frame = cn(
    logoFrame,
    dragOver && "ring-4 ring-primary ring-offset-2 ring-offset-background",
  );

  return (
    <div
      className="flex max-w-full shrink-0 flex-col gap-1.5"
      data-testid="project-logo-editor"
      onDragOver={(event) => {
        if (busy || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {url ? (
        <div className={cn(frame, "group max-w-[min(100%,24rem)]")}>
          <img
            src={url}
            alt={t("logo.alt", { name: project.name })}
            className="h-full w-auto max-w-full object-contain"
            draggable={false}
          />

          {/* Actions au survol (ou au focus clavier). */}
          {!busy && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label={t("logo.change")}
                title={t("logo.change")}
                className="flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => removal.ask()}
                aria-label={t("logo.remove")}
                title={t("logo.remove")}
                className="flex size-9 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}

          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-6 animate-spin text-primary" />
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title={dragOver ? t("logo.drop") : t("logo.add")}
          className={cn(
            frame,
            "aspect-square flex-col gap-1 border border-dashed px-2 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {dragOver ? t("logo.drop") : t("logo.add")}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pick(file);
          event.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="max-w-56 text-xs text-destructive">
          {error}
        </p>
      )}
      {removal.dialog}
    </div>
  );
}

/**
 * Galerie de l'univers : affiches, cartes du monde, ambiances, croquis…
 * Chaque image est enregistrée tout de suite.
 */
export function ProjectGallery({ projectId, label }: { projectId: string; label: string }) {
  const imageError = useImageError();

  const [images, setImages] = useState<ProjectImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImages([]);
    api
      .listProjectGallery(projectId)
      .then((list) => !cancelled && setImages(list))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Contenu des images, une par une.
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
        .getProjectGalleryImage(projectId, image.id)
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
        const image = await api.addProjectGalleryImage(projectId, data);
        const url = `data:${mime};base64,${data}`;
        urlCache.set(image.id, url);
        setUrls((current) => ({ ...current, [image.id]: url }));
        setImages((current) => [...current, image]);
      }
    } catch (e) {
      setError(imageError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteProjectGalleryImage(projectId, id);
      urlCache.delete(id);
      setImages((current) => current.filter((image) => image.id !== id));
    } catch (e) {
      setError(imageError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="@container" data-testid="project-gallery">
      <GalleryGrid
        label={label}
        items={images.map((image) => ({ id: image.id, url: urls[image.id] ?? null }))}
        busy={busy}
        error={error}
        onAdd={(files) => void add(files)}
        onRemove={(id) => void remove(id)}
      />
    </div>
  );
}
