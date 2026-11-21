import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Pencil, ScrollText, type LucideIcon } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fullName, parseList } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";

/** Une ligne de l'aperçu : un intitulé et sa valeur (texte, ou pastilles). */
export interface SummaryRow {
  key: string;
  label: string;
  value: string;
  /** « tags » : la valeur est une liste (JSON), affichée en pastilles. */
  kind?: "text" | "tags";
  /** Teinte des pastilles (classes), pour les listes. */
  tone?: string;
}

/** Un thème de l'aperçu (identité, apparence, catégorie…), avec son icône. */
export interface SummaryGroup {
  id: string;
  icon: LucideIcon;
  title: string;
  rows: SummaryRow[];
}

/**
 * Noms lisibles des éléments liés depuis une fiche (élément du découpage,
 * lieu, personnage). Un lien vers un élément supprimé garde son texte.
 */
export function useLinkedNames(projectId: string) {
  const { t } = useTranslation("characters");
  const { structure, labelOf } = useProjectStructure(projectId);
  const { locations } = useProjectLocations(projectId);
  const { characters } = useProjectCharacters(projectId);

  return {
    node: (id: string) => {
      const node = structure?.nodes.find((item) => item.id === id);
      return node ? labelOf(node) : t("reference.deleted");
    },
    location: (id: string) => locations.find((item) => item.id === id)?.name ?? id,
    character: (id: string) => {
      const character = characters.find((item) => item.id === id);
      return character ? fullName(character) : id;
    },
  };
}

/** Une valeur est remplie (une liste vide compte comme vide). */
export function isFilled(value: string | undefined, list = false): value is string {
  const text = value?.trim();
  if (!text) return false;
  return list ? parseList(text).length > 0 : true;
}

/**
 * Aperçu d'une fiche (personnage, lieu, monde) : à la place des panneaux du
 * formulaire, l'essentiel en lecture. La description sert d'introduction,
 * puis chaque thème avec son icône, en liste « intitulé → valeur ». Le bloc
 * prend la hauteur de la carte de profil à sa gauche ; s'il y a plus à
 * lire, il défile à l'intérieur (jamais de côté : un texte long passe à la
 * ligne). « Modifier la fiche » ramène le formulaire.
 */
export function SheetSummary({
  description,
  groups,
  onEdit,
}: {
  description: string | null;
  groups: SummaryGroup[];
  /** Revenir au formulaire (même effet que le bouton de la barre d'onglets). */
  onEdit?: () => void;
}) {
  const { t } = useTranslation("tabs");
  const shown = groups.filter((group) => group.rows.length > 0);
  const empty = !description && shown.length === 0;

  let body: ReactNode;
  if (empty) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ScrollText className="size-7" aria-hidden="true" />
        </span>
        <p className="font-medium">{t("tab.previewEmptyTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("tab.previewEmpty")}</p>
        {onEdit && (
          <Button className="mt-2" onClick={onEdit}>
            <Pencil />
            {t("tab.fillSheet")}
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <div className="space-y-7 px-6 pb-6">
        {description && <p className="text-[0.95rem] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground/90">{description}</p>}

        {shown.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.id} aria-labelledby={`summary-${group.id}`}>
              <h3 id={`summary-${group.id}`} className="mb-1 flex items-center gap-2 border-b pb-1.5 text-sm font-semibold">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {group.title}
              </h3>
              {/* Une liste sobre : l'intitulé à gauche, la valeur à droite, un fin trait entre les lignes. */}
              <dl className="divide-y divide-border/60">
                {group.rows.map((row) => (
                  <div key={row.key} className="grid gap-x-6 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                    <dt className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">{row.label}</dt>
                    {row.kind === "tags" ? (
                      <dd className="flex min-w-0 flex-wrap gap-1.5">
                        {parseList(row.value).map((tag) => (
                          <span key={tag} className={cn("max-w-full rounded-full border px-2.5 py-0.5 text-xs [overflow-wrap:anywhere]", row.tone ?? "bg-muted/40")}>
                            {tag}
                          </span>
                        ))}
                      </dd>
                    ) : (
                      <dd className="min-w-0 text-sm whitespace-pre-line [overflow-wrap:anywhere]">{row.value}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    // Dans la grille de la fiche : la hauteur de la ligne est celle du profil ;
    // le contenu (en absolu) défile si besoin sans agrandir le bloc.
    <Card className="relative min-h-80 overflow-hidden rounded-xl p-0" data-testid="sheet-summary">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex shrink-0 items-center gap-1.5 px-6 pt-4 pb-3">
          <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("tab.previewTitle")}</h2>
          {!empty && onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="-mr-2 ml-auto text-muted-foreground">
              <Pencil />
              {t("tab.editSheet")}
            </Button>
          )}
        </div>
        {/* Jamais de défilement de côté : un texte trop long passe à la ligne. */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{body}</div>
      </div>
    </Card>
  );
}
