import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ListTree, Loader2, Waypoints, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import { notifyError, notifySaved } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useSheetDisplay, useSheetDisplayStore } from "@/stores/sheetDisplayStore";
import type { SheetModule } from "@/types";
import { TitleWithInfo } from "@/components/common/TitleWithInfo";

/**
 * Paramètres du projet › Personnages / Lieux : afficher ou non les sections
 * « Trame » et « Récit » sur les fiches du module. Seul l'affichage change.
 */
export function SheetDisplayCard({ projectId, module }: { projectId: string; module: SheetModule }) {
  const { t } = useTranslation("projectSettings");
  const { showStory, showPlot, panelTree, loaded } = useSheetDisplay(projectId, module);
  const save = useSheetDisplayStore((s) => s.save);
  const savePanelTree = useSheetDisplayStore((s) => s.savePanelTree);
  const [busy, setBusy] = useState<"story" | "plot" | "tree" | null>(null);
  // Les personnages n'ont pas d'arborescence (une fiche n'en contient pas d'autres).
  const hasTree = module !== "character";

  async function toggleTree() {
    setBusy("tree");
    try {
      await savePanelTree(projectId, module, !panelTree);
      notifySaved(t("sheetDisplay.saved"), `settings:sheets.${module}`);
    } catch (e) {
      notifyError(errorText(e, "projectSettings:sheetDisplay.failed"), `settings:sheets.${module}`);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(which: "story" | "plot") {
    setBusy(which);
    try {
      await save(projectId, module, which === "story" ? !showStory : showStory, which === "plot" ? !showPlot : showPlot);
      notifySaved(t("sheetDisplay.saved"), `settings:sheets.${module}`);
    } catch (e) {
      notifyError(errorText(e, "projectSettings:sheetDisplay.failed"), `settings:sheets.${module}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo
          info={
            <>
              <span className="block">{t(`sheetDisplay.description.${module}`)}</span>
              <span className="mt-1 block">{t("sheetDisplay.note")}</span>
            </>
          }
        >
          {t("sheetDisplay.title")}
        </TitleWithInfo>
      </CardHeader>
      <CardContent className={`${cardContentClass} space-y-3`}>
        {hasTree && (
          <SwitchRow
            icon={ListTree}
            label={t("sheetDisplay.panelTree")}
            hint={panelTree ? t("sheetDisplay.panelTreeOn") : t("sheetDisplay.panelTreeOff")}
            checked={panelTree}
            busy={busy === "tree"}
            disabled={!loaded || busy !== null}
            onToggle={() => void toggleTree()}
          />
        )}
        <SwitchRow
          icon={Waypoints}
          label={t("sheetDisplay.plot")}
          hint={showPlot ? t("sheetDisplay.shown") : t("sheetDisplay.hidden")}
          checked={showPlot}
          busy={busy === "plot"}
          disabled={!loaded || busy !== null}
          onToggle={() => void toggle("plot")}
        />
        <SwitchRow
          icon={BookOpen}
          label={t("sheetDisplay.story")}
          hint={showStory ? t("sheetDisplay.shown") : t("sheetDisplay.hidden")}
          checked={showStory}
          busy={busy === "story"}
          disabled={!loaded || busy !== null}
          onToggle={() => void toggle("story")}
        />
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  icon: Icon,
  label,
  hint,
  checked,
  busy,
  disabled,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const labelId = useId();
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-sm font-medium">
          {label}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      {busy && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
      </button>
    </div>
  );
}
