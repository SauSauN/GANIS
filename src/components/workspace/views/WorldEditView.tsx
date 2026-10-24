import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FolderTree, Loader2, PackageX, Plus, Save, Trash2 } from "lucide-react";
import { VersionsButton } from "@/components/history/VersionsDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { PageShell, cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { WorldDisabledNotice } from "@/components/workspace/views/WorldListView";
import { SpeciesCharacterCard } from "@/components/world/AnimalCharacterCards";
import { WorldGallery } from "@/components/world/WorldGallery";
import { WorldLinksCard } from "@/components/world/WorldLinksCard";
import { WorldSheet } from "@/components/world/WorldSheet";
import { WorldThumb, WorldTypeBadge } from "@/components/world/WorldVisuals";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { errorText } from "@/lib/errors";
import { notifyError, notifySaved } from "@/lib/notify";
import { GALLERY_MAX_SIDE, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import {
  MAX_WORLD_NAME_LENGTH,
  childrenOf,
  createFeatureOf,
  draftFromEntry,
  hasNature,
  sameWorldDraft,
  toWorldInput,
  worldNameError,
  worldSettingsTab,
  worldTabId,
  type WorldDraft,
} from "@/lib/world";
import { useWorldEntries, useWorldEntry, useWorldImageUrl, useWorldStore } from "@/stores/worldStore";
import type { WorldModule } from "@/types";

/**
 * Fiche d'un objet ou d'une espèce, dans son propre onglet. Les
 * modifications passent par « Enregistrer » (ou l'enregistrement
 * automatique) ; l'image principale et la galerie sont enregistrées dès
 * qu'on les change.
 */
export function WorldEditView({
  projectId,
  module,
  entryId,
  onClose,
  onOpenFeature,
}: {
  projectId: string;
  module: WorldModule;
  entryId: string;
  onClose: () => void;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation(["world", "common", "characters"]);
  const { entries, settings, loaded, error: loadError, reload } = useWorldEntries(projectId, module);
  const entry = useWorldEntry(projectId, module, entryId);
  const imageUrl = useWorldImageUrl(projectId, module, entry);
  const labels = useWorldLabels(module, settings.customTypes);

  const updateEntry = useWorldStore((state) => state.updateEntry);
  const deleteEntry = useWorldStore((state) => state.deleteEntry);
  const setPortrait = useWorldStore((state) => state.setPortrait);
  const removePortrait = useWorldStore((state) => state.removePortrait);
  const setCreatePreset = useWorldStore((state) => state.setCreatePreset);

  const [childrenOpen, setChildrenOpen] = useCollapsible(`ganis.worldSheet.${module}.children.collapsed`);
  const base = useMemo(() => (entry ? draftFromEntry(entry) : null), [entry]);

  const [draft, setDraft] = useState<WorldDraft | null>(null);
  const [showNameError, setShowNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = draft !== null && base !== null && !sameWorldDraft(module, draft, base);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (base && draftRef.current === null) setDraft(base);
  }, [base]);

  const nameProblem = draft ? worldNameError(draft.name) : null;

  async function save(): Promise<boolean> {
    if (!draft) return true;
    if (nameProblem) {
      setShowNameError(true);
      return false;
    }

    setSaving(true);
    try {
      await updateEntry(projectId, module, entryId, toWorldInput(module, draft));
      setShowNameError(false);
      notifySaved(t("edit.saved"), `world:${entryId}`);
      return true;
    } catch (e) {
      notifyError(errorText(e), `world:${entryId}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({ dirty, save, revision: draft ? JSON.stringify(draft) : null });

  async function pickBanner(file: File) {
    setBannerBusy(true);
    setBannerError(null);
    try {
      const { data } = await preparePortrait(file, GALLERY_MAX_SIDE);
      await setPortrait(projectId, module, entryId, data);
    } catch (e) {
      setBannerError(e instanceof PortraitError ? t(`characters:portrait.errors.${e.code}`) : errorText(e));
    } finally {
      setBannerBusy(false);
    }
  }

  async function dropBanner() {
    setBannerBusy(true);
    setBannerError(null);
    try {
      await removePortrait(projectId, module, entryId);
    } catch (e) {
      setBannerError(errorText(e));
    } finally {
      setBannerBusy(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEntry(projectId, module, entryId);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      setDeleteError(errorText(e));
    } finally {
      setDeleting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  if (!entry || !draft) {
    const missing = loaded && !entry;
    return (
      <PageShell title={t("tab.fallback")}>
        {missing ? (
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle className="flex items-center gap-2">
                <PackageX className="size-5 text-muted-foreground" aria-hidden="true" />
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

  if (!settings.enabled) {
    return <WorldDisabledNotice module={module} title={entry.name} onOpenFeature={onOpenFeature} />;
  }

  const children = childrenOf(entries, entry.id);
  const parent = entry.parentId ? entries.find((item) => item.id === entry.parentId) : undefined;
  // Seule une espèce (ou un objet) regroupe d'autres fiches.
  const canContain = !hasNature(module) || entry.nature === "species";

  function addInside() {
    setCreatePreset(module, { parentId: entryId, nature: "individual" });
    onOpenFeature(createFeatureOf(module));
  }

  const childrenCard = (canContain || children.length > 0) && (
    <CollapsibleCard
      open={childrenOpen}
      onOpenChange={setChildrenOpen}
      icon={FolderTree}
      title={labels.text("children.title")}
      description={labels.text("children.description", { name: entry.name })}
      count={children.length}
      actions={
        canContain ? (
          <Button type="button" size="sm" variant="outline" onClick={addInside} disabled={deleting}>
            <Plus />
            <span className="hidden sm:inline">{labels.text("children.add")}</span>
          </Button>
        ) : undefined
      }
    >
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.text("children.empty")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                onClick={() => onOpenFeature(worldTabId(module, child.id))}
                className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <WorldThumb projectId={projectId} module={module} entry={child} customTypes={settings.customTypes} size="md" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-medium">{child.name}</span>
                  <WorldTypeBadge module={module} type={child.type} customTypes={settings.customTypes} labels={labels} />
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
        <WorldSheet
          projectId={projectId}
          module={module}
          draft={draft}
          onChange={setDraft}
          selfId={entry.id}
          entries={entries}
          settings={settings}
          labels={labels}
          disabled={deleting}
          nameError={showNameError && nameProblem ? t(`world:errors.${nameProblem}`, { max: MAX_WORLD_NAME_LENGTH }) : null}
          banner={{
            url: imageUrl,
            busy: bannerBusy,
            error: bannerError,
            onPick: (file) => void pickBanner(file),
            onRemove: () => void dropBanner(),
          }}
          gallery={
            <WorldGallery
              label={t("sections.gallery.title")}
              projectId={projectId}
              module={module}
              entryId={entry.id}
              disabled={deleting}
            />
          }
          extra={
            <>
              {module === "species" && entry.nature === "individual" && (
                <SpeciesCharacterCard projectId={projectId} entry={entry} onOpenFeature={onOpenFeature} disabled={deleting} />
              )}
              <WorldLinksCard projectId={projectId} self={{ kind: module, id: entry.id }} onOpenFeature={onOpenFeature} />
              {childrenCard}
            </>
          }
          onOpenEntry={(id) => onOpenFeature(worldTabId(module, id))}
          onManage={() => onOpenFeature(worldSettingsTab(module))}
          footer={
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {t("common:actions.save")}
              </Button>

              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setDraft(base);
                    setShowNameError(false);
                  }}
                >
                  {t("common:actions.cancel")}
                </Button>
              )}

              <VersionsButton className="ml-auto" projectId={projectId} kind={module} itemId={entryId} name={entry.name} />

              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
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
          <DialogTitle>{t("edit.deleteTitle", { name: entry.name })}</DialogTitle>
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
            {entry.characterId && <> {t("edit.deleteKeepsCharacter")}</>}
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
