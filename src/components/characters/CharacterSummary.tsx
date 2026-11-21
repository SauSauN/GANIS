import { useTranslation } from "react-i18next";
import { Brain, Eye, Fingerprint, type LucideIcon } from "lucide-react";
import { isFilled, SheetSummary, useLinkedNames, type SummaryGroup } from "@/components/common/SheetSummary";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import { CHARACTER_FIELDS, type CharacterDraft, type CharacterField } from "@/lib/characters";
import type { CharacterDetailLevel } from "@/types";

/**
 * L'essentiel d'une fiche personnage, par thème. Seuls les champs remplis
 * s'affichent ; la description sert d'introduction.
 */
export const ESSENTIAL_GROUPS: Array<{ level: CharacterDetailLevel; keys: string[] }> = [
  { level: "basic", keys: ["age", "gender", "occupation", "origin", "firstAppearance", "mainGoal", "distinctiveTrait"] },
  { level: "intermediate", keys: ["height", "build", "eyes", "hair"] },
  { level: "advanced", keys: ["traits", "strengths", "flaws", "deepDesire", "fears"] },
];

/** Icône de chaque thème (les mêmes que les panneaux du formulaire). */
const LEVEL_ICONS: Record<CharacterDetailLevel, LucideIcon> = {
  basic: Fingerprint,
  intermediate: Eye,
  advanced: Brain,
};

/** Teinte douce des pastilles : neutre (traits), forces, défauts. */
const TAG_TONES: Record<string, string> = {
  traits: "border-primary/20 bg-primary/10 text-primary",
  strengths: "border-success/25 bg-success/10 text-success",
  flaws: "border-destructive/20 bg-destructive/10 text-destructive",
};

const FIELD_BY_KEY = new Map(CHARACTER_FIELDS.map((field) => [field.key, field]));

/**
 * Aperçu d'une fiche personnage (voir `SheetSummary`) : l'essentiel, à la
 * place des panneaux du formulaire.
 */
export function CharacterSummary({
  projectId,
  draft,
  levels,
  onEdit,
}: {
  projectId: string;
  draft: CharacterDraft;
  levels: CharacterDetailLevel[];
  onEdit?: () => void;
}) {
  const { t, i18n } = useTranslation("characters");
  const listLabel = useListLabel();
  const names = useLinkedNames(projectId);

  /** Valeur lisible d'un champ rempli, selon son genre. */
  function text(field: CharacterField, value: string): string {
    switch (field.kind) {
      case "choice":
        return field.list ? listLabel(field.list, value) : value;
      case "reference":
        return names.node(value);
      case "place":
        return names.location(value);
      case "date": {
        const date = new Date(`${value}T00:00:00`);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(i18n.resolvedLanguage, { day: "numeric", month: "long", year: "numeric" });
      }
      default:
        return value;
    }
  }

  const groups: SummaryGroup[] = ESSENTIAL_GROUPS.filter((group) => levels.includes(group.level)).map((group) => ({
    id: group.level,
    icon: LEVEL_ICONS[group.level],
    title: t(`levels.${group.level}.theme`),
    rows: group.keys
      .map((key) => FIELD_BY_KEY.get(key))
      .filter((field): field is CharacterField => !!field && isFilled(draft.fields[field.key], field.kind === "tags"))
      .map((field) => {
        const value = draft.fields[field.key].trim();
        return field.kind === "tags"
          ? { key: field.key, label: t(`fields.${field.key}` as "fields.age"), value, kind: "tags" as const, tone: TAG_TONES[field.key] }
          : { key: field.key, label: t(`fields.${field.key}` as "fields.age"), value: text(field, value) };
      }),
  }));

  const description = isFilled(draft.fields.description) ? draft.fields.description.trim() : null;

  return <SheetSummary description={description} groups={groups} onEdit={onEdit} />;
}
