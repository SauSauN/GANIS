import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_TEXT_CONTRAST, isHexColor } from "@/lib/colorTheme";
import { cn } from "@/lib/utils";

/** Éléments du formulaire de l'éditeur de thème. */
/** Parties de l'éditeur qu'on peut fermer (« Informations » reste ouverte). */
export type SectionId = "colors" | "relations" | "shape";

export function ColorField({
  id,
  label,
  value,
  showError,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  showError: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("packages");
  const valid = isHexColor(value);
  const error = showError && !valid;

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        {/* Sélecteur natif : décoratif pour les lecteurs d'écran, le champ texte suffit. */}
        <input
          type="color"
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          tabIndex={-1}
          aria-hidden="true"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw.startsWith("#") || raw === "" ? raw : `#${raw}`);
          }}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="font-mono uppercase"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {t("editor.colors.invalid")}
        </p>
      )}
    </div>
  );
}

/**
 * Carte dont l'en-tête ouvre ou ferme le contenu, avec la même animation
 * que les niveaux de la fiche personnage. `footer` reste toujours visible.
 */
export function CollapsibleCard({
  id,
  title,
  description,
  open,
  onOpenChange,
  alert = false,
  footer,
  children,
}: {
  id: SectionId;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Point rouge sur l'en-tête : la partie contient une erreur. */
  alert?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("packages");
  const contentId = `theme-section-${id}`;

  return (
    <Card className={cardClass}>
      <CardHeader className={cn(cardHeaderClass, "block p-0", !open && "border-b-0")}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          title={open ? t("editor.section.collapse") : t("editor.section.expand")}
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center gap-4 rounded-t-xl px-6 py-5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              {title}
              {alert && <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />}
            </CardTitle>
            <CardDescription className="mt-1.5">{description}</CardDescription>
          </span>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
      </CardHeader>
      {/* Repli animé : la hauteur passe de 0 à « auto » (grille 0fr → 1fr). */}
      <div
        id={contentId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
      {footer}
    </Card>
  );
}

export function ContrastRow({ label, ratio }: { label: string; ratio: number | null }) {
  const { t, i18n } = useTranslation("packages");
  if (ratio === null) {
    return null;
  }

  const good = ratio >= MIN_TEXT_CONTRAST;
  const value = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 1,
  }).format(ratio);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0">{label}</span>
      <span
        className={cn("flex shrink-0 items-center gap-1 tabular-nums", good ? "" : "text-destructive")}
        title={t(good ? "editor.contrast.good" : "editor.contrast.low")}
      >
        {good ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {t("editor.contrast.ratio", { ratio: value })}
        <span className="sr-only">
          {" "}— {t(good ? "editor.contrast.good" : "editor.contrast.low")}
        </span>
      </span>
    </div>
  );
}
