import { Check, Info, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TEXT_SIZE_LABELS,
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

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "light",
    label: "Clair",
    description: "Fond clair, agréable en pleine journée.",
    icon: Sun,
  },
  {
    id: "dark",
    label: "Sombre",
    description: "Fond sombre, reposant le soir.",
    icon: Moon,
  },
  {
    id: "system",
    label: "Système",
    description: "Suit automatiquement le thème de votre ordinateur.",
    icon: Monitor,
  },
];

const TEXT_SIZE_DETAILS: Record<
  TextSize,
  { description: string; sample: string }
> = {
  small: { description: "Plus de contenu à l'écran.", sample: "text-sm" },
  normal: { description: "Le réglage recommandé.", sample: "text-base" },
  large: { description: "Plus confortable à lire.", sample: "text-xl" },
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
  const themeMode = useThemeMode();
  const textSize = useTextSize();

  return (
    <div className="space-y-8">
      {/* ==================================================================
          THÈME
          ================================================================== */}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 px-6 py-5">
          <CardTitle>Thème</CardTitle>

          <CardDescription>
            Choisissez l'ambiance de l'interface.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <div
            role="radiogroup"
            aria-label="Thème"
            className="grid gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map(({ id, label, description, icon: Icon }) => {
              const selected = themeMode === id;

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

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 px-6 py-5">
          <CardTitle>Taille du texte</CardTitle>

          <CardDescription>
            Agrandit ou réduit toute l'interface.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div
            role="radiogroup"
            aria-label="Taille du texte"
            className="grid gap-3 sm:grid-cols-3"
          >
            {TEXT_SIZES.map((size) => {
              const selected = textSize === size;
              const details = TEXT_SIZE_DETAILS[size];

              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={TEXT_SIZE_LABELS[size]}
                  aria-describedby={`text-size-${size}-description`}
                  onClick={() => setTextSize(size)}
                  className={tileClass(selected)}
                >
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "flex h-9 min-w-9 items-center justify-center rounded-lg border bg-background px-2 font-semibold",
                        details.sample,
                      )}
                    >
                      Aa
                    </span>

                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>

                  <span>
                    <span className="block text-sm font-medium">
                      {TEXT_SIZE_LABELS[size]}
                    </span>

                    <span
                      id={`text-size-${size}-description`}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {details.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aperçu
            </p>

            <p className="text-sm leading-7">
              L'inspiration vient en écrivant : chaque projet commence par une
              première phrase.
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
              Enregistré sur cet appareil
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Ces préférences ne modifient jamais le contenu de vos projets.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}