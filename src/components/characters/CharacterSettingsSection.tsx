import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, RotateCcw, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LevelPicker } from "@/components/characters/LevelPicker";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import { LIST_KEYS, listValues } from "@/lib/characters";
import { useCharacterStore, useProjectCharacters } from "@/stores/characterStore";
import type { CharacterDetailLevel, CharacterListKey } from "@/types";
import { errorText } from "@/lib/errors";
import { notifyError, notifySaved } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * Paramètres du projet › Personnages : niveau de détail de toutes les
 * fiches, carte « Pouvoirs », et listes personnalisables (rôles, statuts,
 * genres, corpulences).
 * Chaque changement est enregistré tout de suite.
 */
export function CharacterSettingsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation("projectSettings");
  const { detailLevel, loaded } = useProjectCharacters(projectId);
  const setDetailLevel = useCharacterStore((state) => state.setDetailLevel);

  const [busy, setBusy] = useState(false);
  /** Choix en cours d'enregistrement (affiché tout de suite). */
  const [pending, setPending] = useState<CharacterDetailLevel | null>(null);

  async function choose(level: CharacterDetailLevel) {
    setBusy(true);
    setPending(level);

    try {
      await setDetailLevel(projectId, level);
      notifySaved(t("characters.saved"), "settings:characters");
    } catch {
      notifyError(t("characters.failed"), "settings:characters");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("characters.title")}</CardTitle>
          <CardDescription>{t("characters.description")}</CardDescription>
        </CardHeader>

        <CardContent className={`${cardContentClass} space-y-4`}>
          <LevelPicker
            value={pending ?? detailLevel}
            onChange={(level) => void choose(level)}
            disabled={!loaded || busy}
          />
        </CardContent>
      </Card>

      <PowersCard projectId={projectId} />

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("characters.lists.title")}</CardTitle>
          <CardDescription>{t("characters.lists.description")}</CardDescription>
        </CardHeader>

        <CardContent className={`${cardContentClass} grid gap-x-8 gap-y-6 md:grid-cols-2`}>
          {LIST_KEYS.map((key) => (
            <ListEditor key={key} projectId={projectId} list={key} disabled={!loaded} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Une liste : ses valeurs (retirables), un champ pour en ajouter. */
function ListEditor({
  projectId,
  list,
  disabled,
}: {
  projectId: string;
  list: CharacterListKey;
  disabled: boolean;
}) {
  const { t } = useTranslation(["projectSettings", "characters"]);
  const label = useListLabel();
  const lists = useCharacterStore((state) => state.lists);
  const setList = useCharacterStore((state) => state.setList);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "settings:characters");
  };

  const values = listValues(lists, list);
  const customized = lists[list] !== undefined;

  async function save(next: string[] | null) {
    setBusy(true);
    setError(null);

    try {
      await setList(projectId, list, next);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = draft.trim();
    if (!value) return;

    if (values.some((item) => label(list, item).toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }

    if (await save([...values, value])) setDraft("");
  }

  const locked = disabled || busy;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t(`characters:lists.names.${list}`)}</p>
        {customized && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={locked}
            onClick={() => void save(null)}
          >
            <RotateCcw />
            {t("characters.lists.reset")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium"
          >
            {label(list, value)}
            <button
              type="button"
              disabled={locked || values.length <= 1}
              onClick={() => void save(values.filter((item) => item !== value))}
              aria-label={t("characters.lists.remove", { value: label(list, value) })}
              className="rounded hover:text-destructive disabled:opacity-40"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={60}
          placeholder={t("characters.lists.placeholder")}
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={locked || !draft.trim()} onClick={() => void add()}>
          <Plus />
          {t("characters.lists.add")}
        </Button>
      </div>

    </div>
  );
}

/** Carte « Pouvoirs » des fiches : à activer pour les histoires où les personnages en ont. */
function PowersCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation("projectSettings");
  const labelId = useId();
  const { powersEnabled, loaded } = useProjectCharacters(projectId);
  const setPowersEnabled = useCharacterStore((state) => state.setPowersEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await setPowersEnabled(projectId, !powersEnabled);
      notifySaved(t("characters.saved"), "settings:characters");
    } catch (e) {
      notifyError(errorText(e, "projectSettings:characters.failed"), "settings:characters");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("characters.powers.title")}</CardTitle>
        <CardDescription>{t("characters.powers.description")}</CardDescription>
      </CardHeader>
      <CardContent className={cardContentClass}>
        <div className="flex items-start gap-4 rounded-lg border p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <WandSparkles className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p id={labelId} className="text-sm font-medium">
              {t("characters.powers.enable")}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {powersEnabled ? t("characters.powers.enabledHint") : t("characters.powers.disabledHint")}
            </p>
          </div>
          {busy && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
          <button
            type="button"
            role="switch"
            aria-checked={powersEnabled}
            aria-labelledby={labelId}
            disabled={!loaded || busy}
            onClick={() => void toggle()}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
              powersEnabled ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                powersEnabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
