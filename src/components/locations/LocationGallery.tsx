import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GalleryGrid,
  MAX_GALLERY_IMAGES,
} from "@/components/characters/fields/GalleryField";
import { api } from "@/lib/api";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useLocationStore } from "@/stores/locationStore";
import type { LocationImage } from "@/types";

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = new Map<string, string>();

/** Images en cours de chargement : pas de demande en double. */
const inflight = new Set<string>();

interface LocationGalleryProps {
  label: string;
  projectId: string;
  locationId: string;
  disabled?: boolean;
}

/**
 * Galerie d'un lieu enregistré (cartes, plans, références) : chaque image
 * est enregistrée tout de suite. Même présentation que la galerie des
 * personnages.
 */
export function LocationGallery({ label, projectId, locationId, disabled }: LocationGalleryProps) {
  const { t } = useTranslation("characters");
  const adjustGalleryCount = useLocationStore((state) => state.adjustGalleryCount);

  const [images, setImages] = useState<LocationImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageError = (e: unknown) =>
    e instanceof PortraitError
      ? t(`portrait.errors.${e.code}`)
      : e instanceof Error
        ? e.message
        : String(e);

  useEffect(() => {
    let cancelled = false;

    api
      .listLocationGallery(projectId, locationId)
      .then((list) => !cancelled && setImages(list))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
    };
  }, [projectId, locationId]);

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
        .getLocationGalleryImage(projectId, image.id)
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
        const image = await api.addLocationGalleryImage(projectId, locationId, data);
        const url = `data:${mime};base64,${data}`;

        urlCache.set(image.id, url);
        setUrls((current) => ({ ...current, [image.id]: url }));
        setImages((current) => [...current, image]);
        adjustGalleryCount(projectId, locationId, 1);
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
      await api.deleteLocationGalleryImage(projectId, id);
      urlCache.delete(id);
      setImages((current) => current.filter((image) => image.id !== id));
      adjustGalleryCount(projectId, locationId, -1);
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
