import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save, Trash2, UserX } from "lucide-react";
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
import { CharacterSheet } from "@/components/characters/CharacterForm";
import { CharacterGallery } from "@/components/characters/fields/GalleryField";
import { CharacterRelationsCard } from "@/components/relations/CharacterRelationsCard";
import {
  PageShell,
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import {
  MAX_NAME_LENGTH,
  draftFromCharacter,
  fullName,
  nameError,
  sameDraft,
  toInput,
  type CharacterDraft,
} from "@/lib/characters";
import { PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import {
  useCharacterStore,
  usePortraitUrl,
  useProjectCharacter,
  useProjectCharacters,
} from "@/stores/characterStore";

interface CharacterEditViewProps {
  projectId: string;
  characterId: string;
  /** Ferme l'onglet de la fiche (après suppression). */
  onClose: () => void;
  /** Ouvre un autre onglet (graphe des relations…). */
  onOpenFeature: (featureId: string) => void;
}

/**
 * Fiche d'un personnage, dans son propre onglet.
 *
 * Les modifications passent par « Enregistrer » (ou par l'enregistrement
 * automatique, s'il est activé), avec le point ● sur l'onglet tant
 * qu'elles sont en cours. La photo est enregistrée dès qu'elle est choisie
 * ou retirée.
 */
export function CharacterEditView({
  projectId,
  characterId,
  onClose,
  onOpenFeature,
}: CharacterEditViewProps) {
  const { t } = useTranslation(["characters", "common"]);

  const { detailLevel, loaded, error: loadError, reload } = useProjectCharacters(projectId);
  const character = useProjectCharacter(projectId, characterId);
  const portraitUrl = usePortraitUrl(projectId, character);

  const updateCharacter = useCharacterStore((state) => state.updateCharacter);
  const deleteCharacter = useCharacterStore((state) => state.deleteCharacter);
  const setPortrait = useCharacterStore((state) => state.setPortrait);
  const removePortrait = useCharacterStore((state) => state.removePortrait);

  /** Fiche telle qu'enregistrée. */
  const base = useMemo(() => (character ? draftFromCharacter(character) : null), [character]);

  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [showNameError, setShowNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = draft !== null && base !== null && !sameDraft(draft, base);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Fiche remplie au premier chargement du personnage.
  useEffect(() => {
    if (base && draftRef.current === null) {
      setDraft(base);
    }
  }, [base]);

  // « Enregistré » disparaît dès la modification suivante.
  useEffect(() => {
    if (dirty) setSaveStatus(null);
  }, [dirty]);

  const nameProblem = draft ? nameError(draft.firstName, draft.lastName) : null;

  async function save(): Promise<boolean> {
    if (!draft) return true;

    if (nameProblem) {
      setShowNameError(true);
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      // Le brouillon n'est pas remplacé par la version enregistrée (espaces
      // retirés par Rust) : en plein milieu d'une phrase, un espace final
      // disparaîtrait sous le curseur. Les deux sont égaux pour `sameDraft`.
      await updateCharacter(projectId, characterId, toInput(draft));
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

  async function pickPortrait(file: File) {
    setPortraitBusy(true);
    setPortraitError(null);

    try {
      const { data } = await preparePortrait(file);
      await setPortrait(projectId, characterId, data);
    } catch (e) {
      setPortraitError(
        e instanceof PortraitError
          ? t(`portrait.errors.${e.code}`)
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setPortraitBusy(false);
    }
  }

  async function dropPortrait() {
    setPortraitBusy(true);
    setPortraitError(null);

    try {
      await removePortrait(projectId, characterId);
    } catch (e) {
      setPortraitError(e instanceof Error ? e.message : String(e));
    } finally {
      setPortraitBusy(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteCharacter(projectId, characterId);
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

  // ---------------------------------------------------------------------------
  // Chargement, personnage introuvable
  // ---------------------------------------------------------------------------

  if (!character || !draft) {
    const missing = loaded && !character;

    return (
      <PageShell title={t("tab.fallback")}>
        {missing ? (
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle className="flex items-center gap-2">
                <UserX className="size-5 text-muted-foreground" aria-hidden="true" />
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

  const name = fullName(character);

  // Pas de grand titre ni de date de modification : le nom est déjà dans
  // l'onglet et en tête de la fiche.
  return (
    <PageShell>
      <form onSubmit={onSubmit} noValidate>
        <CharacterSheet
          projectId={projectId}
          draft={draft}
          onChange={setDraft}
          level={detailLevel ?? "basic"}
          // Pas désactivée pendant un enregistrement (automatique) : le
          // champ en cours de saisie perdrait le focus.
          disabled={deleting}
          nameError={
            showNameError && nameProblem ? t(`errors.${nameProblem}`, { max: MAX_NAME_LENGTH }) : null
          }
          portrait={{
            colorKey: character.id,
            url: portraitUrl,
            busy: portraitBusy,
            error: portraitError,
            onPick: (file) => void pickPortrait(file),
            onRemove: () => void dropPortrait(),
          }}
          gallery={
            <CharacterGallery
              label={t("fields.gallery")}
              projectId={projectId}
              characterId={character.id}
              disabled={deleting}
            />
          }
          galleryCount={character.galleryCount}
          footer={
            <>
            <CharacterRelationsCard
              projectId={projectId}
              characterId={character.id}
              onOpenGraph={() => onOpenFeature("characters.relations")}
            />
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
            </>
          }
        />
      </form>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && !deleting && setConfirmDelete(false)}>
        <DialogHeader>
          <DialogTitle>{t("edit.deleteTitle", { name })}</DialogTitle>
          <DialogDescription>{t("edit.deleteDescription")}</DialogDescription>
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
