import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { BetweenHorizontalEnd, BetweenHorizontalStart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ColorSwatches } from "@/components/structure/ColorSwatches";
import {
  countByLevel,
  defaultLevelColor,
  formatNumber,
  levelsExample,
  MAX_DIGITS,
  MAX_LEVEL_NAME,
  MAX_LEVELS,
  MAX_START,
  NUMBERINGS,
  type ResolvedLevel,
} from "@/lib/structure";
import { cn } from "@/lib/utils";
import type { Structure, StructureNumbering } from "@/types";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";


/** Niveau en cours de modification. */
interface DraftLevel {
  /** Clé d'affichage (stable pendant la modification). */
  key: string;
  /** Niveau existant ; absent pour un niveau ajouté. */
  id?: string;
  one: string;
  other: string;
  numbering: StructureNumbering;
  start: number;
  digits: number;
  /** Couleur choisie ; `null` : couleur par défaut selon la place du niveau. */
  color: string | null;
  /** Éléments rangés dans ce niveau (0 pour un niveau ajouté). */
  count: number;
}

let nextKey = 0;
const newKey = () => `level-${++nextKey}`;

function toDraft(levels: ResolvedLevel[], counts: number[]): DraftLevel[] {
  return levels.map((level, index) => ({
    key: newKey(),
    id: level.id,
    one: level.one,
    other: level.other,
    numbering: level.numbering,
    start: level.start,
    digits: level.digits,
    // Couleur par défaut de sa place : non figée (suit la place du niveau).
    color: level.color === defaultLevelColor(index) ? null : level.color,
    count: counts[index] ?? 0,
  }));
}

/** Les champs comparés pour savoir s'il y a des modifications. */
const signature = (levels: DraftLevel[]) =>
  JSON.stringify(
    levels.map(({ id, one, other, numbering, start, digits, color }) => [id, one, other, numbering, start, digits, color]),
  );

interface StructureLevelsEditorProps {
  projectId: string;
  structure: Structure;
  /** Niveaux avec leurs noms (traduits ou personnalisés). */
  levels: ResolvedLevel[];
  /** Appelé après l'enregistrement (rechargement du découpage). */
  onSaved: () => Promise<unknown> | void;
  /** Bouton « Annuler » (facultatif) : ferme l'éditeur. */
  onCancel?: () => void;
  /**
   * Couleurs des niveaux modifiables ici (paramètres du projet). Sinon, un
   * lien `onOpenColorSettings` mène aux paramètres.
   */
  showColors?: boolean;
  onOpenColorSettings?: () => void;
}

/**
 * Personnalisation des niveaux du découpage : noms (« Kkhkk » au lieu de
 * « Chapitre »), numérotation (continue, par parent, aucune), premier
 * numéro et format (1, 01, 001), ajout ou retrait de niveaux (1 à 5).
 *
 * Un niveau qui contient des éléments ne peut pas être retiré. Les
 * éléments suivent leur niveau : insérer « Arc » entre « Tome » et
 * « Chapitre » ne change rien aux chapitres existants.
 */
export function StructureLevelsEditor({
  projectId,
  structure,
  levels,
  onSaved,
  onCancel,
  showColors = false,
  onOpenColorSettings,
}: StructureLevelsEditorProps) {
  const { t } = useTranslation(["structure", "common"]);

  const counts = useMemo(() => countByLevel(structure.nodes, levels.length), [structure.nodes, levels.length]);
  const initial = useMemo(() => toDraft(levels, counts), [levels, counts]);

  const [draft, setDraft] = useState<DraftLevel[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Découpage rechargé (enregistrement, autre onglet) : on repart de lui.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const dirty = signature(draft) !== signature(initial);
  const valid = draft.every((level) => level.one.trim() !== "");

  function update(key: string, patch: Partial<DraftLevel>) {
    setSaved(false);
    setDraft((current) => current.map((level) => (level.key === key ? { ...level, ...patch } : level)));
  }

  function insert(index: number) {
    if (draft.length >= MAX_LEVELS) return;

    setSaved(false);
    setDraft((current) => {
      const next = [...current];
      next.splice(index, 0, {
        key: newKey(),
        one: t("levels.newName"),
        other: "",
        numbering: index === 0 ? "continuous" : "perParent",
        start: 1,
        digits: 1,
        color: null,
        count: 0,
      });
      return next;
    });
  }

  function remove(key: string) {
    setSaved(false);
    setDraft((current) => current.filter((level) => level.key !== key));
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      await api.setStructureLevels(
        projectId,
        draft.map(({ id, one, other, numbering, start, digits, color }) => ({
          id,
          one: one.trim(),
          other: other.trim() || one.trim(),
          numbering,
          start,
          digits,
          color,
        })),
      );
      await onSaved();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const example = levelsExample(
    draft.map((level) => ({ ...level, one: level.one.trim() || "…" })),
  );

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {draft.map((level, index) => {
          const parent = draft[index - 1];
          const prefix = `structure-level-${level.key}`;

          return (
            <li key={level.key} className="rounded-lg border bg-background p-3">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: level.color ?? defaultLevelColor(index) }}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {t("levels.position", { number: index + 1 })}
                </span>
                {level.count > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                    {t("levels.count", { count: level.count })}
                  </span>
                )}

                <span className="ml-auto flex items-center gap-0.5">
                  <IconAction
                    label={t("levels.insertAbove")}
                    disabled={saving || draft.length >= MAX_LEVELS}
                    onClick={() => insert(index)}
                  >
                    <BetweenHorizontalStart className="h-4 w-4" />
                  </IconAction>
                  <IconAction
                    label={t("levels.insertBelow")}
                    disabled={saving || draft.length >= MAX_LEVELS}
                    onClick={() => insert(index + 1)}
                  >
                    <BetweenHorizontalEnd className="h-4 w-4" />
                  </IconAction>
                  <IconAction
                    label={level.count > 0 ? t("levels.removeDisabled") : t("levels.remove")}
                    disabled={saving || level.count > 0 || draft.length <= 1}
                    onClick={() => remove(level.key)}
                    className="hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-one`}>{t("levels.one")}</Label>
                  <Input
                    id={`${prefix}-one`}
                    value={level.one}
                    maxLength={MAX_LEVEL_NAME}
                    disabled={saving}
                    aria-invalid={level.one.trim() === ""}
                    onChange={(e) => update(level.key, { one: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-other`}>{t("levels.other")}</Label>
                  <Input
                    id={`${prefix}-other`}
                    value={level.other}
                    placeholder={level.one}
                    maxLength={MAX_LEVEL_NAME}
                    disabled={saving}
                    onChange={(e) => update(level.key, { other: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-numbering`}>{t("levels.numbering")}</Label>
                  <select
                    id={`${prefix}-numbering`}
                    value={level.numbering}
                    disabled={saving}
                    onChange={(e) => update(level.key, { numbering: e.target.value as StructureNumbering })}
                    className={cn(fieldClass, "h-9")}
                  >
                    {NUMBERINGS.map((numbering) => (
                      <option key={numbering} value={numbering}>
                        {numbering === "perParent"
                          ? parent
                            ? t("levels.numberings.perParent", { parent: parent.one.trim() || "…" })
                            : t("levels.numberings.perParentRoot")
                          : t(`levels.numberings.${numbering}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-start`}>{t("levels.start")}</Label>
                  <Input
                    id={`${prefix}-start`}
                    type="number"
                    min={0}
                    max={MAX_START}
                    value={level.start}
                    disabled={saving || level.numbering === "none"}
                    onChange={(e) =>
                      update(level.key, {
                        start: Math.min(MAX_START, Math.max(0, Math.trunc(Number(e.target.value) || 0))),
                      })
                    }
                    className="w-24"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-digits`}>{t("levels.digits")}</Label>
                  <select
                    id={`${prefix}-digits`}
                    value={level.digits}
                    disabled={saving || level.numbering === "none"}
                    onChange={(e) => update(level.key, { digits: Number(e.target.value) })}
                    className={cn(fieldClass, "h-9 w-24")}
                  >
                    {Array.from({ length: MAX_DIGITS }, (_, i) => i + 1).map((digits) => (
                      <option key={digits} value={digits}>
                        {formatNumber(Math.max(level.start, 1), digits)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showColors && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">{t("colors.level")}</span>
                <ColorSwatches
                  label={`${t("colors.level")} : ${level.one || t("levels.position", { number: index + 1 })}`}
                  value={level.color}
                  fallback={defaultLevelColor(index)}
                  resetLabel={t("colors.useDefault")}
                  disabled={saving}
                  onChange={(color) => update(level.key, { color })}
                />
              </div>
              )}
            </li>
          );
        })}
      </ol>

      {!showColors && onOpenColorSettings && (
        <p className="text-xs text-muted-foreground">
          {t("colors.inSettings")}{" "}
          <button
            type="button"
            onClick={onOpenColorSettings}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("colors.openSettings")}
          </button>
        </p>
      )}

      {draft.length >= MAX_LEVELS && (
        <p className="text-xs text-muted-foreground">{t("levels.max", { max: MAX_LEVELS })}</p>
      )}

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t("levels.example")} :</span>
        {example.split(" › ").map((part, index) => (
          <span key={index} className="inline-flex items-center gap-1.5 font-medium">
            {index > 0 && <span className="text-muted-foreground">›</span>}
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: draft[index]?.color ?? defaultLevelColor(index) }}
            />
            {part}
          </span>
        ))}
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="text-sm text-success">
          {t("levels.saved")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!dirty || !valid || saving} onClick={() => void save()}>
          {saving ? t("levels.saving") : t("levels.save")}
        </Button>
        {dirty && (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(initial)}>
            {t("levels.cancel")}
          </Button>
        )}
        {onCancel && !dirty && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t("levels.close")}
          </Button>
        )}
      </div>
    </div>
  );
}

function IconAction({
  label,
  className,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...props}
    />
  );
}
