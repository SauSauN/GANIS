import { useTranslation } from "react-i18next";
import { Check, Info, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TEXT_SIZES,
  setTextSize,
  useTextSize,
  type TextSize,
} from "@/lib/preferences";
import {
  setThemeMode,
  useThemeMode,
  type ThemeMode,
} from "@/lib/theme";

/** Thèmes proposés (libellés dans `settings.json`). */
const THEME_OPTIONS: { id: ThemeMode; icon: LucideIcon }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

/** Taille de l'aperçu « Aa » de chaque choix. */
const TEXT_SIZE_SAMPLE: Record<TextSize, string> = {
  small: "text-sm",
  normal: "text-base",
  large: "text-xl",
};

/** Style commun des choix : une tuile qui se met en évidence quand elle est choisie. */
const tileClass = (selected: boolean) =>
  cn(
    "flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary bg-primary/5 ring-1 ring-primary"
      : "border-input hover:bg-accent/50",
  );

/**
 * Section « Apparence » : thème et taille du texte.
 *
 * Les changements sont appliqués immédiatement et enregistrés sur
 * cet appareil. Ils n'affectent jamais les données des projets.
 */
export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const themeMode = useThemeMode();
  const textSize = useTextSize();

  return (
    <div className="space-y-8">
      {/* ==================================================================
          THÈME
          ================================================================== */}

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("appearance.theme.title")}</CardTitle>

          <CardDescription>{t("appearance.theme.description")}</CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <div
            role="radiogroup"
            aria-label={t("appearance.theme.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map(({ id, icon: Icon }) => {
              const selected = themeMode === id;
              const label = t(`appearance.theme.options.${id}.label`);
              const description = t(`appearance.theme.options.${id}.description`);

              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  aria-describedby={`theme-${id}-description`}
                  onClick={() => setThemeMode(id)}
                  className={tileClass(selected)}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                      <Icon className="h-4 w-4" />
                    </span>

                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>

                  <span>
                    <span className="block text-sm font-medium">{label}</span>

                    <span
                      id={`theme-${id}-description`}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          TAILLE DU TEXTE
          ================================================================== */}

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("appearance.textSize.title")}</CardTitle>

          <CardDescription>{t("appearance.textSize.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div
            role="radiogroup"
            aria-label={t("appearance.textSize.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {TEXT_SIZES.map((size) => {
              const selected = textSize === size;
              const label = t(`appearance.textSize.options.${size}.label`);

              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  aria-describedby={`text-size-${size}-description`}
                  onClick={() => setTextSize(size)}
                  className={tileClass(selected)}
                >
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "flex h-9 min-w-9 items-center justify-center rounded-lg border bg-background px-2 font-semibold",
                        TEXT_SIZE_SAMPLE[size],
                      )}
                    >
                      Aa
                    </span>

                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>

                  <span>
                    <span className="block text-sm font-medium">{label}</span>

                    <span
                      id={`text-size-${size}-description`}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {t(`appearance.textSize.options.${size}.description`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("appearance.preview.title")}
            </p>

            <p className="text-sm leading-7">
              {t("appearance.preview.text")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          NOTE
          ================================================================== */}

      <section className="rounded-xl border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>

          <div>
            <h2 className="text-sm font-semibold">
              {t("appearance.note.title")}
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("appearance.note.text")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
