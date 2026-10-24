import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FolderTree, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LevelPicker } from "@/components/characters/LevelPicker";
import { PendingGallery, type PendingImage } from "@/components/characters/fields/GalleryField";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell, cardClass, cardContentClass, cardFooterClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { WorldDisabledNotice } from "@/components/workspace/views/WorldListView";
import { WorldSheet } from "@/components/world/WorldSheet";
import { WorldTypePicker } from "@/components/world/WorldTypePicker";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import {
  MAX_WORLD_NAME_LENGTH,
  emptyWorldDraft,
  isBlankWorldDraft,
  toWorldInput,
  worldNameError,
  worldSettingsTab,
  worldTabId,
  type WorldDraft,
} from "@/lib/world";
import { useWorldEntries, useWorldStore } from "@/stores/worldStore";
import type { CharacterDetailLevel, WorldModule } from "@/types";

interface PendingBanner {
  data: string;
  url: string;
}

/**
 * Création d'un objet ou d'une espèce, en deux temps : le type (la fiche
 * en dépend), puis la fiche. Une fois créé, il s'ouvre dans son onglet.
 * « Ajouter ici » (depuis une fiche ou la liste) prérègle le parent.
 */
export function WorldCreateView({
  projectId,
  module,
  feature,
  onOpenFeature,
}: {
  projectId: string;
  module: WorldModule;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation(["world", "characters"]);
  const { entries, settings, loaded, error: loadError, reload } = useWorldEntries(projectId, module);
  const labels = useWorldLabels(module, settings.customTypes);

  const createEntry = useWorldStore((state) => state.createEntry);
  const setPortrait = useWorldStore((state) => state.setPortrait);
  const setDetailLevel = useWorldStore((state) => state.setDetailLevel);
  const createPreset = useWorldStore((state) => state[module].createPreset);
  const setCreatePreset = useWorldStore((state) => state.setCreatePreset);

  const [draft, setDraft] = useState<WorldDraft>(() => emptyWorldDraft(module));
  const [showNameError, setShowNameError] = useState(false);
  const [banner, setBanner] = useState<PendingBanner | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "world:create");
  };
  const [pickedLevel, setPickedLevel] = useState<CharacterDetailLevel>("basic");
  const [levelSaving, setLevelSaving] = useState(false);

  // Préréglage demandé (« Ajouter ici ») : appliqué puis oublié.
  useEffect(() => {
    if (!createPreset) return;
    setDraft((current) => ({
      ...emptyWorldDraft(module, createPreset.type ?? current.type, createPreset.parentId, createPreset.nature ?? null),
      name: current.name,
      fields: current.fields,
    }));
    setCreatePreset(module, null);
  }, [createPreset, setCreatePreset, module]);

  const nameProblem = worldNameError(draft.name);
  const dirty = !isBlankWorldDraft(module, draft) || banner !== null || gallery.length > 0;
  const parent = draft.parentId ? entries.find((item) => item.id === draft.parentId) : undefined;

  function clear() {
    // Le parent et la nature sont gardés : on crée souvent plusieurs fiches à la suite.
    setDraft(emptyWorldDraft(module, "", draft.parentId, draft.nature));
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
      const created = await createEntry(projectId, module, toWorldInput(module, draft));
      let imageFailure: string | null = null;

      try {
        if (banner) await setPortrait(projectId, module, created.id, banner.data);
        for (const image of gallery) await api.addWorldEntryGalleryImage(projectId, module, created.id, image.data);
      } catch (e) {
        imageFailure = t("create.imagesFailed", { message: errorText(e) });
      }

      if (gallery.length > 0) void useWorldStore.getState().fetchEntries(projectId, module);

      clear();
      setError(imageFailure);
      onOpenFeature(worldTabId(module, created.id));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({ dirty, save: create, autoSave: false });

  async function pickBanner(file: File) {
    setBannerBusy(true);
    setBannerError(null);
    try {
      const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
      setBanner({ data, url: `data:${mime};base64,${data}` });
    } catch (e) {
      setBannerError(t(`characters:portrait.errors.${e instanceof PortraitError ? e.code : "unreadable"}`));
    } finally {
      setBannerBusy(false);
    }
  }

  async function confirmLevel() {
    setLevelSaving(true);
    setError(null);
    try {
      await setDetailLevel(projectId, module, pickedLevel);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLevelSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void create();
  }

  const manage = () => onOpenFeature(worldSettingsTab(module));

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

  if (!settings.enabled) {
    return <WorldDisabledNotice module={module} title={feature.label} onOpenFeature={onOpenFeature} />;
  }

  // 0. Première fiche : niveau de détail (comme les personnages et les lieux).
  if (!settings.detailLevel) {
    return (
      <PageShell title={feature.label}>
        <Card className={cardClass}>
          <CardHeader className={cardHeaderClass}>
            <CardTitle>{labels.text("levels.title")}</CardTitle>
            <CardDescription>{labels.text("levels.firstTime")}</CardDescription>
          </CardHeader>
          <CardContent className={cardContentClass}>
            <LevelPicker namespace="world" prefix={`${module}.`} value={pickedLevel} onChange={setPickedLevel} disabled={levelSaving} />
          </CardContent>
          <CardFooter className={`${cardFooterClass} gap-4`}>
            <Button onClick={() => void confirmLevel()} disabled={levelSaving}>
              {levelSaving && <Loader2 className="animate-spin" />}
              {t("levels.continue")}
            </Button>
          </CardFooter>
        </Card>
      </PageShell>
    );
  }

  // 1. Type
  if (!draft.type) {
    return (
      <PageShell title={feature.label}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold">{labels.text("picker.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.text("picker.description")}</p>
        </div>

        {parent && (
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm text-primary">
            <FolderTree className="size-4" aria-hidden="true" />
            {labels.text("create.inside", { name: parent.name })}
          </p>
        )}

        <WorldTypePicker
          module={module}
          value=""
          settings={settings}
          labels={labels}
          onManage={manage}
          onSelect={(type) => setDraft((current) => ({ ...current, type }))}
        />
      </PageShell>
    );
  }

  // 2. Fiche
  return (
    <PageShell title={feature.label}>
      <form onSubmit={onSubmit} noValidate>
        <WorldSheet
          projectId={projectId}
          module={module}
          draft={draft}
          onChange={setDraft}
          selfId={null}
          entries={entries}
          settings={settings}
          labels={labels}
          disabled={saving}
          nameError={
            showNameError && nameProblem
              ? t(`world:errors.${nameProblem}`, { max: MAX_WORLD_NAME_LENGTH })
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
            <PendingGallery label={t("sections.gallery.title")} images={gallery} onChange={setGallery} disabled={saving} />
          }
          onManage={manage}
          footer={
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <Button type="submit" disabled={saving || bannerBusy}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                {saving ? t("create.saving") : labels.text("create.save")}
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={clear} disabled={saving}>
                  {t("create.reset")}
                </Button>
              )}
            </div>
          }
        />
      </form>
    </PageShell>
  );
}
