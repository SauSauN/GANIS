import { useTranslation } from "react-i18next";
import { Check, Circle, Info } from "lucide-react";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AUTO_SAVE_DELAYS,
  setAutoSave,
  useAutoSave,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

const tileClass = (selected: boolean) =>
  cn(
    "flex items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    selected
      ? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
      : "border-input enabled:hover:bg-accent/50",
  );

/**
 * Section « Enregistrement » : enregistrement automatique ou manuel.
 *
 * - Désactivé (par défaut) : l'utilisateur enregistre lui-même ; un point ●
 *   sur l'onglet signale ce qui ne l'est pas encore, et GANIS demande quoi
 *   faire avant de fermer un onglet, de quitter la page ou de se fermer.
 * - Activé : les modifications sont enregistrées seules, après le délai
 *   choisi sans nouvelle frappe.
 *
 * Réglage propre à l'appareil, comme l'apparence.
 */
export function SavingSection() {
  const { t } = useTranslation("settings");
  const { enabled, delay } = useAutoSave();

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("saving.autoSave.title")}</CardTitle>
          <CardDescription>{t("saving.autoSave.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          {/* Interrupteur */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="auto-save-label" className="text-sm font-medium">
                {t("saving.autoSave.toggle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {enabled
                  ? t("saving.autoSave.on", { count: delay })
                  : t("saving.autoSave.off")}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="auto-save-label"
              onClick={() => setAutoSave({ enabled: !enabled })}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                enabled ? "bg-primary" : "bg-input",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Délai */}
          <div className="space-y-3 border-t pt-6">
            <div>
              <p className="text-sm font-medium">{t("saving.delay.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("saving.delay.description")}
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label={t("saving.delay.title")}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {AUTO_SAVE_DELAYS.map((value) => {
                const selected = delay === value;

                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!enabled}
                    onClick={() => setAutoSave({ delay: value })}
                    className={tileClass(selected && enabled)}
                  >
                    {t("saving.delay.option", { count: value })}
                    {selected && enabled && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comment repérer ce qui n'est pas enregistré */}
      <section className="rounded-xl border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-2 text-sm leading-6">
            <h2 className="font-semibold">{t("saving.note.title")}</h2>
            <p className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex h-5 items-center gap-1.5 rounded border bg-background px-1.5 text-xs text-foreground">
                {t("saving.note.tabExample")}
                <Circle className="h-2 w-2 fill-current" aria-hidden />
              </span>
              {t("saving.note.dot")}
            </p>
            <p className="text-muted-foreground">{t("saving.note.ask")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
