import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingGallery, type PendingImage } from "@/components/characters/fields/GalleryField";
import { LocationSheet } from "@/components/locations/LocationSheet";
import { LocationTypePicker } from "@/components/locations/LocationTypePicker";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import {
  LOCATION_SETTINGS_TAB,
  MAX_LOCATION_NAME_LENGTH,
  emptyLocationDraft,
  isBlankLocationDraft,
  locationNameError,
  locationTabId,
  toLocationInput,
  type LocationDraft,
} from "@/lib/locations";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { useLocationStore, useProjectLocations } from "@/stores/locationStore";

interface LocationCreateViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

interface PendingBanner {
  data: string;
  url: string;
}

/**
 * Création d'un lieu, en deux temps : on choisit d'abord son type (la
 * fiche en dépend), puis on remplit la fiche. Une fois créé, le lieu
 * s'ouvre dans son onglet et le formulaire est vidé.
 *
 * « Ajouter un lieu ici » (depuis une fiche ou la liste) prérègle le lieu
 * parent via `createPreset`.
 */
export function LocationCreateView({ projectId, feature, onOpenFeature }: LocationCreateViewProps) {
  const { t } = useTranslation(["locations", "characters", "errors"]);
  const { locations, settings, loaded, error: loadError, reload } = useProjectLocations(projectId);
  const labels = useLocationLabels(settings.customTypes);

  const createLocation = useLocationStore((state) => state.createLocation);
  const setPortrait = useLocationStore((state) => state.setPortrait);
  const createPreset = useLocationStore((state) => state.createPreset);
  const setCreatePreset = useLocationStore((state) => state.setCreatePreset);

  const [draft, setDraft] = useState<LocationDraft>(() => emptyLocationDraft());
  const [showNameError, setShowNameError] = useState(false);
  const [banner, setBanner] = useState<PendingBanner | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Préréglage demandé (« Ajouter un lieu ici ») : appliqué puis oublié.
  useEffect(() => {
    if (!createPreset) return;

    setDraft((current) => ({
      ...current,
      parentId: createPreset.parentId,
      type: createPreset.type ?? current.type,
    }));
    setCreatePreset(null);
  }, [createPreset, setCreatePreset]);

  const nameProblem = locationNameError(draft.name);
  const dirty = !isBlankLocationDraft(draft) || banner !== null || gallery.length > 0;
  const parent = draft.parentId ? locations.find((item) => item.id === draft.parentId) : undefined;

  function clear() {
    // Le lieu parent est gardé : on crée souvent plusieurs lieux au même endroit.
    setDraft(emptyLocationDraft("", draft.parentId));
    setBanner(null);
    setBannerError(null);
    setGallery([]);
    setShowNameError(false);
    setError(null);
  }

  async function create(): Promise<boolean> {
    if (!draft.type) return false;

    if (nameProblem) {
      setShowNameError(true);
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const created = await createLocation(projectId, toLocationInput(draft));
      let imageFailure: string | null = null;

      // Le lieu existe : une image refusée n'empêche pas d'ouvrir sa fiche.
      try {
        if (banner) {
          await setPortrait(projectId, created.id, banner.data);
        }

        for (const image of gallery) {
          await api.addLocationGalleryImage(projectId, created.id, image.data);
        }
      } catch (e) {
        imageFailure = t("create.imagesFailed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }

      if (gallery.length > 0) {
        void useLocationStore.getState().fetchLocations(projectId);
      }

      clear();
      setError(imageFailure);
      onOpenFeature(locationTabId(created.id));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Point ● sur l'onglet tant qu'une fiche est commencée ; créer un lieu
  // reste un choix (pas d'enregistrement automatique).
  useUnsavedChanges({ dirty, save: create, autoSave: false });

  async function pickBanner(file: File) {
    setBannerBusy(true);
    setBannerError(null);

    try {
      const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
      setBanner({ data, url: `data:${mime};base64,${data}` });
    } catch (e) {
      setBannerError(
        t(`characters:portrait.errors.${e instanceof PortraitError ? e.code : "unreadable"}`),
      );
    } finally {
      setBannerBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void create();
  }

  const manageTypes = () => onOpenFeature(LOCATION_SETTINGS_TAB);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  if (!loaded) {
    return (
      <PageShell title={feature.label}>
        {loadError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button variant="outline" onClick={() => void reload()}>
              {t("list.retry")}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("list.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Type du lieu
  // ---------------------------------------------------------------------------

  if (!draft.type) {
    return (
      <PageShell title={feature.label}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold">{t("picker.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("picker.description")}</p>
        </div>

        {parent && (
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary">
            <MapPin className="size-4" aria-hidden="true" />
            {t("create.inside", { name: parent.name })}
          </p>
        )}

        <LocationTypePicker
          value=""
          customTypes={settings.customTypes}
          labels={labels}
          onManageTypes={manageTypes}
          onSelect={(type) => setDraft((current) => ({ ...current, type }))}
        />
      </PageShell>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Fiche
  // ---------------------------------------------------------------------------

  return (
    <PageShell title={feature.label}>
      <form onSubmit={onSubmit} noValidate>
        <LocationSheet
          projectId={projectId}
          draft={draft}
          onChange={setDraft}
          selfId={null}
          locations={locations}
          settings={settings}
          labels={labels}
          disabled={saving}
          nameError={
            showNameError && nameProblem
              ? t(`errors:location.${nameProblem}` as "errors:location.nameRequired", {
                  max: MAX_LOCATION_NAME_LENGTH,
                })
              : null
          }
          banner={{
            url: banner?.url ?? null,
            busy: bannerBusy,
            error: bannerError,
            onPick: (file) => void pickBanner(file),
            onRemove: () => setBanner(null),
          }}
          gallery={
            <PendingGallery
              label={t("sections.gallery.title")}
              images={gallery}
              onChange={setGallery}
              disabled={saving}
            />
          }
          onManageTypes={manageTypes}
          footer={
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <Button type="submit" disabled={saving || bannerBusy}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {saving ? t("create.saving") : t("create.save")}
              </Button>

              {dirty && (
                <Button type="button" variant="ghost" onClick={clear} disabled={saving}>
                  {t("create.reset")}
                </Button>
              )}

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          }
        />
      </form>
    </PageShell>
  );
}
