import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, PawPrint, UserPlus, UserRound, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardContentClass, fieldClass } from "@/components/workspace/views/PageShell";
import { WorldThumb, WorldTypeBadge } from "@/components/world/WorldVisuals";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { characterTabId, fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { worldTabId } from "@/lib/world";
import { useProjectCharacters } from "@/stores/characterStore";
import { useWorldEntries, useWorldStore } from "@/stores/worldStore";
import type { WorldEntry } from "@/types";

/**
 * Fiche d'un animal (ou d'une plante) précis : est-il aussi un personnage ?
 *
 * - oui : sa fiche de personnage (relations, scènes, psychologie…) est
 *   reliée ; on peut l'ouvrir, ou retirer le lien (la fiche reste) ;
 * - non : c'est un animal tout court. On peut lui créer une fiche de
 *   personnage (même nom, même description) ou l'associer à un personnage
 *   qui existe déjà.
 */
export function SpeciesCharacterCard({
  projectId,
  entry,
  onOpenFeature,
  disabled,
}: {
  projectId: string;
  entry: WorldEntry;
  onOpenFeature: (featureId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("world");
  const selectId = useId();
  const { characters, loaded } = useProjectCharacters(projectId);
  const { entries } = useWorldEntries(projectId, "species");
  const setCharacter = useWorldStore((state) => state.setCharacter);
  const createCharacter = useWorldStore((state) => state.createCharacter);
  const [open, setOpen] = useCollapsible("ganis.worldSheet.species.character.collapsed");

  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "world:characters");
  };

  const character = entry.characterId ? characters.find((item) => item.id === entry.characterId) : undefined;
  // Personnages qui ne sont pas déjà un autre animal.
  const taken = new Set(entries.filter((item) => item.id !== entry.id && item.characterId).map((item) => item.characterId));
  const free = characters.filter((item) => !taken.has(item.id));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPicked("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={UserRound}
      title={t("animalCharacter.title")}
      description={t("animalCharacter.description")}
      contentClassName={`${cardContentClass} space-y-4`}
    >
      {entry.characterId ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          {character && <CharacterAvatar projectId={projectId} character={character} size="md" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{character ? fullName(character) : t("form.deleted")}</p>
            <p className="text-xs text-muted-foreground">{t("animalCharacter.linked")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenFeature(characterTabId(entry.characterId!))}>
            <UserRound />
            {t("animalCharacter.open")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={locked}
            onClick={() => void run(() => setCharacter(projectId, entry.id, null))}
            title={t("animalCharacter.unlinkHint")}
          >
            <Unlink />
            {t("animalCharacter.unlink")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("animalCharacter.notLinked")}</p>

          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  const created = await createCharacter(projectId, entry.id);
                  onOpenFeature(characterTabId(created.id));
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {t("animalCharacter.create")}
            </Button>

            <div className="flex min-w-64 flex-1 items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={selectId} className="text-xs text-muted-foreground">
                  {t("animalCharacter.pickLabel")}
                </Label>
                <select
                  id={selectId}
                  value={picked}
                  disabled={locked || !loaded || free.length === 0}
                  onChange={(e) => setPicked(e.target.value)}
                  className={cn(fieldClass, "h-9")}
                >
                  <option value="">{free.length === 0 ? t("animalCharacter.noFree") : t("links.dialog.choose")}</option>
                  {free.map((item) => (
                    <option key={item.id} value={item.id}>
                      {fullName(item)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={locked || !picked}
                onClick={() => void run(() => setCharacter(projectId, entry.id, picked))}
              >
                <Link2 />
                {t("animalCharacter.link")}
              </Button>
            </div>
          </div>
        </>
      )}

    </CollapsibleCard>
  );
}

/**
 * Fiche d'un personnage : s'il est aussi un animal (ou une plante) de la
 * faune et flore, on le montre ici et on ouvre sa fiche d'un clic. Sinon,
 * on peut l'associer à un animal précis existant.
 */
export function CharacterAnimalCard({
  projectId,
  characterId,
  onOpenFeature,
}: {
  projectId: string;
  characterId: string;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation("world");
  const selectId = useId();
  const { entries, settings, loaded } = useWorldEntries(projectId, "species");
  const labels = useWorldLabels("species", settings.customTypes);
  const setCharacter = useWorldStore((state) => state.setCharacter);
  const [open, setOpen] = useCollapsible("ganis.characterSheet.animal.collapsed");

  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "world:characters");
  };

  if (!loaded || !settings.enabled) return null;

  const animal = entries.find((item) => item.characterId === characterId);
  const species = animal?.parentId ? entries.find((item) => item.id === animal.parentId) : undefined;
  const free = entries.filter((item) => item.nature === "individual" && !item.characterId);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      await setCharacter(projectId, picked, characterId);
      setPicked("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={PawPrint}
      title={t("characterAnimal.title")}
      description={t("characterAnimal.description")}
      contentClassName={`${cardContentClass} space-y-3`}
    >
      {animal ? (
        <button
          type="button"
          onClick={() => onOpenFeature(worldTabId("species", animal.id))}
          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <WorldThumb projectId={projectId} module="species" entry={animal} customTypes={settings.customTypes} size="md" />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block truncate text-sm font-medium">{animal.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <WorldTypeBadge module="species" type={animal.type} customTypes={settings.customTypes} labels={labels} />
              {species && <span className="text-xs text-muted-foreground">{species.name}</span>}
            </span>
          </span>
        </button>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("characterAnimal.none")}</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={selectId} className="text-xs text-muted-foreground">
                {t("characterAnimal.pickLabel")}
              </Label>
              <select
                id={selectId}
                value={picked}
                disabled={busy || free.length === 0}
                onChange={(e) => setPicked(e.target.value)}
                className={cn(fieldClass, "h-9")}
              >
                <option value="">{free.length === 0 ? t("characterAnimal.noFree") : t("links.dialog.choose")}</option>
                {free.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" variant="outline" disabled={busy || !picked} onClick={() => void link()}>
              {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
              {t("animalCharacter.link")}
            </Button>
          </div>
        </>
      )}

    </CollapsibleCard>
  );
}
