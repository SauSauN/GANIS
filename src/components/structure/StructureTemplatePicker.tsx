import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { STRUCTURE_TEMPLATES, templateForProjectType } from "@/lib/structure";
import { cn } from "@/lib/utils";
import type { ProjectType, Structure, StructureTemplateId } from "@/types";

/** Valeur du sélecteur quand le modèle suit le type du projet. */
const AUTO = "auto";

interface StructureTemplatePickerProps {
  structure: Structure;
  projectType: ProjectType;
  disabled?: boolean;
  /** `null` : le modèle suit le type du projet. */
  onChange: (template: StructureTemplateId | null) => void;
  /** Explication sous le sélecteur (inutile si la carte l'affiche déjà). */
  showHint?: boolean;
  className?: string;
}

/**
 * Choix du modèle de découpage. Si les niveaux ont été personnalisés,
 * une confirmation est demandée : le modèle les remplace.
 */
export function StructureTemplatePicker({
  structure,
  projectType,
  disabled,
  onChange,
  showHint = true,
  className,
}: StructureTemplatePickerProps) {
  const { t } = useTranslation(["structure", "common"]);
  const [pending, setPending] = useState<string | null>(null);

  const autoTemplate = templateForProjectType(projectType);
  const current = structure.levelsCustom
    ? ""
    : structure.templateChosen
      ? structure.template
      : AUTO;

  function choose(value: string) {
    if (structure.levelsCustom) {
      setPending(value);
    } else {
      apply(value);
    }
  }

  function apply(value: string) {
    setPending(null);
    onChange(value === AUTO ? null : (value as StructureTemplateId));
  }

  const pendingName =
    pending === AUTO ? t(`templates.${autoTemplate}.name`) : pending ? t(`templates.${pending as StructureTemplateId}.name`) : "";

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="structure-template">{t("template.label")}</Label>

      <select
        id="structure-template"
        value={current}
        disabled={disabled}
        onChange={(e) => choose(e.target.value)}
        className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {structure.levelsCustom && (
          <option value="" disabled>
            {t("template.custom")}
          </option>
        )}
        <option value={AUTO}>{t("template.auto", { name: t(`templates.${autoTemplate}.name`) })}</option>
        {STRUCTURE_TEMPLATES.map((id) => (
          <option key={id} value={id}>
            {t(`templates.${id}.name`)}
          </option>
        ))}
      </select>

      {showHint && <p className="text-xs text-muted-foreground">{t("template.hint")}</p>}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogHeader>
          <DialogTitle>{t("template.replaceTitle")}</DialogTitle>
          <DialogDescription>{t("template.replaceDescription", { name: pendingName })}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => pending !== null && apply(pending)}>{t("template.replaceConfirm")}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
