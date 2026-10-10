import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MapPinOff, Network, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocationGallery } from "@/components/locations/LocationGallery";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { PlaceLinksCard } from "@/components/locations/PlaceLinksCard";
import { LocationSheet } from "@/components/locations/LocationSheet";
import { LocationThumb, TypeBadge } from "@/components/locations/LocationVisuals";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import {
  PageShell,
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import {
  LOCATION_SETTINGS_TAB,
  MAX_LOCATION_NAME_LENGTH,
  childrenOf,
  draftFromLocation,
  locationNameError,
  locationTabId,
  sameLocationDraft,
  toLocationInput,
  type LocationDraft,
} from "@/lib/locations";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import {
  useLocationImageUrl,
  useLocationStore,
  useProjectLocation,
  useProjectLocations,
} from "@/stores/locationStore";

interface LocationEditViewProps {
  projectId: string;
  locationId: string;
  /** Ferme l'onglet de la fiche (après suppression). */
  onClose: () => void;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Fiche d'un lieu, dans son propre onglet. Les modifications passent par
 * « Enregistrer » (ou l'enregistrement automatique s'il est activé) ;
 * l'image principale et la galerie sont enregistrées dès qu'on les change.
 */
export function LocationEditView({ projectId, locationId, onClose, onOpenFeature }: LocationEditViewProps) {
  const { t } = useTranslation(["locations", "common", "characters", "errors"]);

  const { locations, settings, loaded, error: loadError, reload } = useProjectLocations(projectId);
  const location = useProjectLocation(projectId, locationId);
  const imageUrl = useLocationImageUrl(projectId, location);
  const labels = useLocationLabels(settings.customTypes);

  const updateLocation = useLocationStore((state) => state.updateLocation);
  const deleteLocation = useLocationStore((state) => state.deleteLocation);
  const setPortrait = useLocationStore((state) => state.setPortrait);
  const removePortrait = useLocationStore((state) => state.removePortrait);
  const setCreatePreset = useLocationStore((state) => state.setCreatePreset);

  const [childrenOpen, setChildrenOpen] = useCollapsible("ganis.locationSheet.children.collapsed");

  const base = useMemo(() => (location ? draftFromLocation(location) : null), [location]);

  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [showNameError, setShowNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = draft !== null && base !== null && !sameLocationDraft(draft, base);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (base && draftRef.current === null) {
      setDraft(base);
    }
  }, [base]);

  useEffect(() => {
    if (dirty) setSaveStatus(null);
  }, [dirty]);

  const nameProblem = draft ? locationNameError(draft.name) : null;

  async function save(): Promise<boolean> {
    if (!draft) return true;

    if (nameProblem) {
      setShowNameError(true);
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      await updateLocation(projectId, locationId, toLocationInput(draft));
      setShowNameError(false);
      setSaveStatus("saved");
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({
    dirty,
    save,
    revision: draft ? JSON.stringify(draft) : null,
  });

  async function pickBanner(file: File) {
    setBannerBusy(true);
    setBannerError(null);

    try {
      const { data } = await preparePortrait(file, GALLERY_MAX_SIDE);
      await setPortrait(projectId, locationId, data);
    } catch (e) {
      setBannerError(
        e instanceof PortraitError
          ? t(`characters:portrait.errors.${e.code}`)
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBannerBusy(false);
    }
  }

  async function dropBanner() {
    setBannerBusy(true);
    setBannerError(null);

    try {
      await removePortrait(projectId, locationId);
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : String(e));
    } finally {
      setBannerBusy(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteLocation(projectId, locationId);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  function addInside() {
    setCreatePreset({ parentId: locationId });
    onOpenFeature("locations.create");
  }

  // ---------------------------------------------------------------------------
  // Chargement, lieu introuvable
  // ---------------------------------------------------------------------------

  if (!location || !draft) {
    const missing = loaded && !location;

    return (
      <PageShell title={t("tab.fallback")}>
        {missing ? (
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle className="flex items-center gap-2">
                <MapPinOff className="size-5 text-muted-foreground" aria-hidden="true" />
                {t("edit.notFound.title")}
              </CardTitle>
              <CardDescription>{t("edit.notFound.description")}</CardDescription>
            </CardHeader>
            <CardContent className={cardContentClass}>
              <Button variant="outline" onClick={onClose}>
                {t("edit.notFound.close")}
              </Button>
            </CardContent>
          </Card>
        ) : loadError ? (
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
            {t("edit.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  const children = childrenOf(locations, location.id);
  const parent = location.parentId ? locations.find((item) => item.id === location.parentId) : undefined;

  const childrenCard = (
    <CollapsibleCard
      open={childrenOpen}
      onOpenChange={setChildrenOpen}
      icon={Network}
      title={t("sections.children.title")}
      description={t("sections.children.description", { name: location.name })}
      count={children.length}
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addInside}
          disabled={deleting}
        >
          <Plus />
          <span className="hidden sm:inline">{t("sections.children.add")}</span>
        </Button>
      }
    >
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sections.children.empty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onOpenFeature(locationTabId(child.id))}
                  className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LocationThumb
                    projectId={projectId}
                    location={child}
                    customTypes={settings.customTypes}
                    size="md"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-medium">{child.name}</span>
                    <TypeBadge type={child.type} customTypes={settings.customTypes} labels={labels} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </CollapsibleCard>
  );

  return (
    <PageShell>
      <form onSubmit={onSubmit} noValidate>
        <LocationSheet
          projectId={projectId}
          draft={draft}
          onChange={setDraft}
          selfId={location.id}
          locations={locations}
          settings={settings}
          labels={labels}
          // Pas désactivée pendant un enregistrement automatique : le champ
          // en cours de saisie perdrait le focus.
          disabled={deleting}
          nameError={
            showNameError && nameProblem
              ? t(`errors:location.${nameProblem}` as "errors:location.nameRequired", {
                  max: MAX_LOCATION_NAME_LENGTH,
                })
              : null
          }
          banner={{
            url: imageUrl,
            busy: bannerBusy,
            error: bannerError,
            onPick: (file) => void pickBanner(file),
            onRemove: () => void dropBanner(),
          }}
          gallery={
            <LocationGallery
              label={t("sections.gallery.title")}
              projectId={projectId}
              locationId={location.id}
              disabled={deleting}
            />
          }
          extra={
            <>
              <PlaceLinksCard
                projectId={projectId}
                side="location"
                id={location.id}
                onOpenFeature={onOpenFeature}
              />
              {childrenCard}
            </>
          }
          onOpenLocation={(id) => onOpenFeature(locationTabId(id))}
          onManageTypes={() => onOpenFeature(LOCATION_SETTINGS_TAB)}
          footer={
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? t("common:actions.saving") : t("common:actions.save")}
              </Button>

              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setDraft(base);
                    setShowNameError(false);
                    setSaveError(null);
                  }}
                >
                  {t("common:actions.cancel")}
                </Button>
              )}

              {saveStatus === "saved" && !dirty && (
                <p role="status" className="text-sm text-success">
                  {t("edit.saved")}
                </p>
              )}

              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}

              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                disabled={saving || deleting}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 />
                {t("edit.delete")}
              </Button>
            </div>
          }
        />
      </form>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && !deleting && setConfirmDelete(false)}>
        <DialogHeader>
          <DialogTitle>{t("edit.deleteTitle", { name: location.name })}</DialogTitle>
          <DialogDescription>
            {t("edit.deleteDescription")}
            {children.length > 0 && (
              <>
                {" "}
                {parent
                  ? t("edit.deleteChildrenUp", { count: children.length, parent: parent.name })
                  : t("edit.deleteChildrenTop", { count: children.length })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {deleteError}
          </p>
        )}

        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void onDelete()}>
            {deleting && <Loader2 className="animate-spin" />}
            {t("edit.deleteConfirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </PageShell>
  );
}

