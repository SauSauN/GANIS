import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface FilterResultsProps {
  /** Nombre d'éléments trouvés avec la recherche et les filtres en cours. */
  count: number;
  /** Vide la recherche et remet tous les filtres à zéro. */
  onClear: () => void;
}

/**
 * « N résultat(s) · Effacer les filtres », sous la barre d'outils d'une
 * liste, tant qu'une recherche ou un filtre est actif. Même affichage dans
 * toutes les listes (personnages, lieux, monde, notes, glossaire).
 */
export function FilterResults({ count, onClear }: FilterResultsProps) {
  const { t } = useTranslation("common");

  return (
    <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
      <span aria-live="polite">{t("filters.results", { count })}</span>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X />
        {t("filters.clear")}
      </Button>
    </div>
  );
}
