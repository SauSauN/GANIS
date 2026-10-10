import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CharacterSheet } from "@/components/characters/CharacterForm";
import { PendingGallery, type PendingImage } from "@/components/characters/fields/GalleryField";
import { LevelPicker } from "@/components/characters/LevelPicker";
import {
  PageShell,
  cardClass,
  cardContentClass,
  cardFooterClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import {
  CHARACTER_SETTINGS_TAB,
  MAX_NAME_LENGTH,
  characterTabId,
  emptyDraft,
  isBlankDraft,
  nameError,
  toInput,
  type CharacterDraft,
} from "@/lib/characters";
import { PortraitError, preparePortrait } from "@/lib/portraitImage";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { api } from "@/lib/api";
import { useCharacterStore, useProjectCharacters } from "@/stores/characterStore";
import type { CharacterDetailLevel } from "@/types";

interface CharacterCreateViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Photo choisie avant la création : envoyée juste après. */
interface PendingPortrait {
  data: string;
  url: string;
}

/** Couleur provisoire des initiales, avant que le personnage ait un identifiant. */
const DRAFT_COLOR_KEY = "draft";

/**
 * Création d'un personnage.
 *
 * La toute première fois, on choisit le niveau de détail des fiches du
 * projet (il se change ensuite dans les paramètres du projet). Une fois
 * créé, le personnage s'ouvre dans son onglet et le formulaire est vidé.
 */
export function CharacterCreateView({ projectId, feature, onOpenFeature }: CharacterCreateViewProps) {
  const { t } = useTranslation(["characters", "common"]);
  const { detailLevel, loaded, error: loadError, reload } = useProjectCharacters(projectId);
  const setDetailLevel = useCharacterStore((state) => state.setDetailLevel);
  const createCharacter = useCharacterStore((state) => state.createCharacter);
  const setPortrait = useCharacterStore((state) => state.setPortrait);

  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft);
  const [showNameError, setShowNameError] = useState(false);
  const [portrait, setPortraitDraft] = useState<PendingPortrait | null>(null);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Premier personnage : niveau à choisir.
  const [pickedLevel, setPickedLevel] = useState<CharacterDetailLevel>("basic");
  const [levelSaving, setLevelSaving] = useState(false);

  const nameProblem = nameError(draft.firstName, draft.lastName);
  const dirty = !isBlankDraft(draft) || portrait !== null || gallery.length > 0;

  function clear() {
    setDraft(emptyDraft());
    setPortraitDraft(null);
    setPortraitError(null);
    setGallery([]);
    setShowNameError(false);
    setError(null);
  }

  async function create(): Promise<boolean> {
    if (nameProblem) {
      setShowNameError(true);
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const created = await createCharacter(projectId, toInput(draft));

      let imageFailure: string | null = null;

      // Le personnage existe : une image refusée n'empêche pas d'ouvrir sa fiche.
      try {
        if (portrait) {
          await setPortrait(projectId, created.id, portrait.data);
        }

        for (const image of gallery) {
          await api.addCharacterGalleryImage(projectId, created.id, image.data);
        }
      } catch (e) {
        imageFailure = t("create.imagesFailed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }

      if (gallery.length > 0) {
        // Nombre d'images à jour dans la liste (la galerie est relue à l'ouverture).
        void useCharacterStore.getState().fetchCharacters(projectId);
      }

      clear();
      setError(imageFailure);
      onOpenFeature(characterTabId(created.id));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Point ● sur l'onglet tant qu'une fiche est commencée. Pas
  // d'enregistrement automatique : créer un personnage reste un choix.
  useUnsavedChanges({ dirty, save: create, autoSave: false });

  async function pickPortrait(file: File) {
    setPortraitBusy(true);
    setPortraitError(null);

    try {
      const { data, mime } = await preparePortrait(file);
      setPortraitDraft({ data, url: `data:${mime};base64,${data}` });
    } catch (e) {
      setPortraitError(
        t(`portrait.errors.${e instanceof PortraitError ? e.code : "unreadable"}`),
      );
    } finally {
      setPortraitBusy(false);
    }
  }

  async function confirmLevel() {
    setLevelSaving(true);
    setError(null);

    try {
      await setDetailLevel(projectId, pickedLevel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLevelSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void create();
  }

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
  // Premier personnage : choix du niveau de détail
  // ---------------------------------------------------------------------------

  if (!detailLevel) {
    return (
      <PageShell title={feature.label}>
        <Card className={cardClass}>
          <CardHeader className={cardHeaderClass}>
            <CardTitle>{t("levels.title")}</CardTitle>
            <CardDescription>{t("levels.firstTime")}</CardDescription>
          </CardHeader>

          <CardContent className={cardContentClass}>
            <LevelPicker value={pickedLevel} onChange={setPickedLevel} disabled={levelSaving} />
          </CardContent>

          <CardFooter className={`${cardFooterClass} gap-4`}>
            <Button onClick={() => void confirmLevel()} disabled={levelSaving}>
              {levelSaving && <Loader2 className="animate-spin" />}
              {t("levels.continue")}
            </Button>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardFooter>
        </Card>
      </PageShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Fiche
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title={feature.label}
      description={
        <>
          {t("levels.current", { level: t(`levels.${detailLevel}.label`) })}{" "}
          <button
            type="button"
            onClick={() => onOpenFeature(CHARACTER_SETTINGS_TAB)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("levels.change")}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <CharacterSheet
          projectId={projectId}
          draft={draft}
          onChange={setDraft}
          level={detailLevel}
          disabled={saving}
          nameError={
            showNameError && nameProblem ? t(`errors.${nameProblem}`, { max: MAX_NAME_LENGTH }) : null
          }
          portrait={{
            colorKey: DRAFT_COLOR_KEY,
            url: portrait?.url ?? null,
            busy: portraitBusy,
            error: portraitError,
            onPick: (file) => void pickPortrait(file),
            onRemove: () => setPortraitDraft(null),
          }}
          gallery={
            <PendingGallery
              label={t("fields.gallery")}
              images={gallery}
              onChange={setGallery}
              disabled={saving}
            />
          }
          galleryCount={gallery.length}
          footer={
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <Button type="submit" disabled={saving || portraitBusy}>
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
