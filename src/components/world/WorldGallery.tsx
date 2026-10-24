import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GalleryGrid, MAX_GALLERY_IMAGES } from "@/components/characters/fields/GalleryField";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useWorldStore } from "@/stores/worldStore";
import type { WorldImage, WorldModule } from "@/types";

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = new Map<string, string>();
const inflight = new Set<string>();

/**
 * Galerie d'une fiche enregistrée (photos, plans, croquis) : chaque image
 * est enregistrée tout de suite. Même présentation que les autres galeries.
 */
export function WorldGallery({
  label,
  projectId,
  module,
  entryId,
  disabled,
}: {
  label: string;
  projectId: string;
  module: WorldModule;
  entryId: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("characters");
  const adjustGalleryCount = useWorldStore((state) => state.adjustGalleryCount);

  const [images, setImages] = useState<WorldImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageError = (e: unknown) => (e instanceof PortraitError ? t(`portrait.errors.${e.code}`) : errorText(e));

  useEffect(() => {
    let cancelled = false;
    api
      .listWorldEntryGallery(projectId, module, entryId)
      .then((list) => !cancelled && setImages(list))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [projectId, module, entryId]);

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
        .getWorldEntryGalleryImage(projectId, module, image.id)
        .then((data) => {
          const url = `data:${data.mime};base64,${data.data}`;
          urlCache.set(image.id, url);
          setUrls((current) => ({ ...current, [image.id]: url }));
        })
        .catch(() => {})
        .finally(() => inflight.delete(image.id));
    }
  }, [images, projectId, module, urls]);

  async function add(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of files.slice(0, MAX_GALLERY_IMAGES - images.length)) {
        const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
        const image = await api.addWorldEntryGalleryImage(projectId, module, entryId, data);
        const url = `data:${mime};base64,${data}`;
        urlCache.set(image.id, url);
        setUrls((current) => ({ ...current, [image.id]: url }));
        setImages((current) => [...current, image]);
        adjustGalleryCount(projectId, module, entryId, 1);
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
      await api.deleteWorldEntryGalleryImage(projectId, module, id);
      urlCache.delete(id);
      setImages((current) => current.filter((image) => image.id !== id));
      adjustGalleryCount(projectId, module, entryId, -1);
    } catch (e) {
      setError(imageError(e));
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
