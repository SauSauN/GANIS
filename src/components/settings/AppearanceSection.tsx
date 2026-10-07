import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
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
} from "@/lib/preferences";
import {
  setThemeMode,
  useThemeMode,
  type ThemeMode,
} from "@/lib/theme";

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "light", label: "Clair", icon: Sun },
  { id: "dark", label: "Sombre", icon: Moon },
  { id: "system", label: "Système", icon: Monitor },
];

const optionClass = (selected: boolean) =>
  cn(
    "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
    selected
      ? "border-primary bg-primary/10 text-foreground"
      : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Thème</CardTitle>
          <CardDescription>
            « Système » suit automatiquement le thème de votre
            ordinateur.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div
            role="radiogroup"
            aria-label="Thème"
            className="flex flex-wrap gap-2"
          >
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={themeMode === id}
                onClick={() => setThemeMode(id)}
                className={optionClass(themeMode === id)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Taille du texte</CardTitle>
          <CardDescription>
            Agrandit ou réduit toute l'interface.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Taille du texte"
            className="flex flex-wrap gap-2"
          >
            {TEXT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={textSize === size}
                onClick={() => setTextSize(size)}
                className={optionClass(textSize === size)}
              >
                {TEXT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>

          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            Aperçu : l'inspiration vient en écrivant.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}