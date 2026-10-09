import { useTranslation } from "react-i18next";
import { Check, Pencil, Trash2 } from "lucide-react";
import { ThemeSwatch } from "@/components/packages/ThemeSwatch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ThemeData } from "@/types";

export interface ThemeCardProps {
  name: string;
  description: string;
  theme: ThemeData;
  origin: "system" | "mine";
  author: string;
  version: string;
  active: boolean;
  onUse: () => void;
  /** Absent : pas de bouton « Modifier » (thème système, ou non-développeur). */
  onEdit?: () => void;
  /** Absent : pas de bouton « Supprimer » (thème système). */
  onDelete?: () => void;
}

const badgeClass =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium leading-4";

/**
 * Carte d'un thème dans la page Packages : aperçu clair et sombre,
 * informations, et actions (utiliser, modifier, supprimer).
 */
export function ThemeCard({
  name,
  description,
  theme,
  origin,
  author,
  version,
  active,
  onUse,
  onEdit,
  onDelete,
}: ThemeCardProps) {
  const { t } = useTranslation("packages");

  return (
    <article
      aria-label={name}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      {/* Aperçus clair et sombre */}
      <div
        role="img"
        aria-label={t("card.previewLabel", { name })}
        className="grid grid-cols-2 gap-2 border-b bg-muted/40 p-3"
      >
        <figure className="space-y-1">
          <ThemeSwatch palette={theme.light} />
          <figcaption className="text-[0.7rem] text-muted-foreground">
            {t("card.light")}
          </figcaption>
        </figure>

        <figure className="space-y-1">
          <ThemeSwatch palette={theme.dark} />
          <figcaption className="text-[0.7rem] text-muted-foreground">
            {t("card.dark")}
          </figcaption>
        </figure>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="mr-1 truncate text-sm font-semibold">{name}</h3>

            <span
              className={cn(
                badgeClass,
                origin === "system"
                  ? "border-border bg-secondary text-secondary-foreground"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {t(origin === "system" ? "badges.system" : "badges.mine")}
            </span>

            {active && (
              <span className={cn(badgeClass, "border-success/40 bg-success/10 text-foreground")}>
                <Check className="mr-1 h-3 w-3 text-success" />
                {t("badges.active")}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {t("card.by", { author })} · {t("badges.version", { version })} ·{" "}
            {t("categories.theme")}
          </p>

          {description && (
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={active ? "secondary" : "default"}
            disabled={active}
            onClick={onUse}
            aria-pressed={active}
          >
            {active && <Check />}
            {t(active ? "card.inUse" : "card.use")}
          </Button>

          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil />
              {t("card.edit")}
            </Button>
          )}

          {onDelete && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onDelete}
              aria-label={`${t("card.delete")} — ${name}`}
              title={t("card.delete")}
              className="ml-auto text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
