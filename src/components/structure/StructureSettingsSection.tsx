import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StructureLevelsEditor } from "@/components/structure/StructureLevelsEditor";
import { StructureTemplatePicker } from "@/components/structure/StructureTemplatePicker";
import { useStructureLabels } from "@/components/structure/useProjectStructure";
import { cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjectStructureData } from "@/stores/structureStore";
import type { Project, StructureTemplateId } from "@/types";
import { errorText } from "@/lib/errors";

/**
 * Paramètres du projet › Découpage : modèle de départ, puis noms et
 * numérotation de chaque niveau (mêmes réglages que « Personnaliser »
 * dans le plan).
 */
export function StructureSettingsSection({ project }: { project: Project }) {
  const { t } = useTranslation(["structure", "common"]);
  // Découpage partagé : le plan et l'arborescence voient chaque réglage.
  const { structure, error: loadError, reload: load } = useProjectStructureData(project.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  const { levels } = useStructureLabels(structure);

  async function changeAutoNumbering(enabled: boolean) {
    setBusy(true);
    setError(null);
    setAutoSaved(false);

    try {
      await api.setStructureAutoNumbering(project.id, enabled);
      await load();
      setAutoSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeTemplate(template: StructureTemplateId | null) {
    setBusy(true);
    setError(null);

    try {
      await api.setStructureTemplate(project.id, template);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!structure) {
    return loadError ? (
      <div className="space-y-3 text-sm">
        <p role="alert" className="text-destructive">
          {loadError}
        </p>
        <Button variant="outline" onClick={() => void load()}>
          {t("plan.retry")}
        </Button>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("plan.loading")}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("template.label")}</CardTitle>
          <CardDescription>{t("template.hint")}</CardDescription>
        </CardHeader>
        <CardContent className={cardContentClass}>
          <StructureTemplatePicker
            structure={structure}
            projectType={project.type}
            disabled={busy}
            showHint={false}
            onChange={(template) => void changeTemplate(template)}
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("numbering.title")}</CardTitle>
          <CardDescription>{t("numbering.description")}</CardDescription>
        </CardHeader>
        <CardContent className={cardContentClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="structure-auto-numbering" className="text-sm font-medium">
                {t("numbering.toggle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {structure.autoNumbering ? t("numbering.statusOn") : t("numbering.statusOff")}
              </p>
            </div>
            <Switch
              checked={structure.autoNumbering}
              disabled={busy}
              onChange={(checked) => void changeAutoNumbering(checked)}
              labelledBy="structure-auto-numbering"
            />
          </div>
          {autoSaved && (
            <p role="status" className="mt-3 text-sm text-success">
              {t("numbering.saved")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("levels.title")}</CardTitle>
          <CardDescription>{t("levels.description")}</CardDescription>
        </CardHeader>
        <CardContent className={cardContentClass}>
          <StructureLevelsEditor
            projectId={project.id}
            structure={structure}
            levels={levels}
            onSaved={load}
            showColors
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Interrupteur, comme celui de l'enregistrement automatique. */
function Switch({
  checked,
  disabled,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
