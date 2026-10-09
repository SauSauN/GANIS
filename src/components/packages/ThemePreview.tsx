import { useTranslation } from "react-i18next";
import { BookOpen, FileText, MapPin, Users } from "lucide-react";
import { themeStyle } from "@/components/packages/ThemeSwatch";
import type { ThemePalette } from "@/types";

/**
 * Aperçu en direct d'un thème : une petite fenêtre GANIS (rail, panneau,
 * zone centrale, carte de formulaire, boutons et badges d'état).
 *
 * Les couleurs sont posées sur le conteneur : l'aperçu ne modifie jamais
 * le reste de l'interface. Les éléments sont décrits avec des classes
 * simples (sans variantes `dark:`), pour que l'aperçu du mode sombre soit
 * fidèle même quand l'interface est en mode clair, et inversement.
 */
export function ThemePreview({
  palette,
  radius,
  modeLabel,
}: {
  palette: ThemePalette;
  radius: number;
  modeLabel: string;
}) {
  const { t } = useTranslation("packages");

  const nav = [
    { key: "details", icon: FileText },
    { key: "characters", icon: Users },
    { key: "locations", icon: MapPin },
    { key: "chapters", icon: BookOpen },
  ] as const;

  return (
    <div
      role="img"
      aria-label={t("editor.preview.label", { mode: modeLabel })}
      style={themeStyle(palette, radius)}
      className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm"
    >
      {/* Barre de titre */}
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-card px-2.5">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        <span className="h-2 w-2 rounded-full bg-warning" />
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="ml-2 truncate text-[0.7rem] text-muted-foreground">
          {t("editor.preview.project")}
        </span>
      </div>

      <div className="flex h-72">
        {/* Panneau latéral */}
        <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-sidebar-border bg-sidebar p-1.5 text-sidebar-foreground">
          {nav.map(({ key, icon: Icon }, index) => (
            <span
              key={key}
              className={
                index === 3
                  ? "flex items-center gap-1.5 rounded-md bg-sidebar-accent px-1.5 py-1 text-[0.7rem] font-medium"
                  : "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.7rem]"
              }
            >
              <Icon className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{t(`editor.preview.nav.${key}`)}</span>
            </span>
          ))}
        </div>

        {/* Zone centrale */}
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          <div>
            <p className="truncate text-sm font-semibold">{t("editor.preview.heading")}</p>
            <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-4 text-muted-foreground">
              {t("editor.preview.text")}
            </p>
          </div>

          <div className="flex gap-1.5">
            <span className="rounded-full border border-success/40 bg-success/15 px-1.5 py-0.5 text-[0.6rem] font-medium">
              {t("editor.preview.saved")}
            </span>
            <span className="rounded-full border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[0.6rem] font-medium">
              {t("editor.preview.draft")}
            </span>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-card p-2.5 text-card-foreground">
            <p className="text-[0.65rem] font-medium">{t("editor.preview.field")}</p>
            <div className="flex h-6 items-center rounded-md border border-input bg-background px-2 text-[0.7rem] ring-2 ring-ring/40">
              {t("editor.preview.fieldValue")}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="rounded-md bg-primary px-2 py-1 text-[0.65rem] font-medium text-primary-foreground">
                {t("editor.preview.primary")}
              </span>
              <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[0.65rem] font-medium text-secondary-foreground">
                {t("editor.preview.secondary")}
              </span>
              <span className="rounded-md bg-destructive/15 px-2 py-1 text-[0.65rem] font-medium text-destructive">
                {t("editor.preview.danger")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
