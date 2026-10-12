import { useState } from "react";
import { useTranslation } from "react-i18next";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "@/components/locations/LocationFields";
import { useProjectLocations } from "@/stores/locationStore";

const FREE_TEXT = "\u0000free";

interface PlaceFieldProps {
  id: string;
  projectId: string;
  /** Identifiant d'un lieu du projet, ou texte libre. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Lieu d'un champ de fiche (« Origine ») : un lieu du projet, choisi dans
 * la liste, ou un texte libre pour un lieu qui n'existe pas encore.
 */
export function PlaceField({ id, projectId, value, onChange, placeholder, maxLength, disabled }: PlaceFieldProps) {
  const { t } = useTranslation("locations");
  const { locations, loaded } = useProjectLocations(projectId);

  const isPlace = locations.some((location) => location.id === value);
  const [textMode, setTextMode] = useState(false);

  // Texte déjà saisi qui ne désigne pas un lieu : affiché en texte libre.
  const showText = textMode || (loaded && value !== "" && !isPlace);

  if (showText) {
    return (
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            id={id}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder ?? t("links.place.freeTextPlaceholder")}
            disabled={disabled}
            autoFocus={textMode}
            onChange={(e) => onChange(e.target.value)}
          />
          {locations.length > 0 && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={disabled}
              title={t("links.place.backToList")}
              aria-label={t("links.place.backToList")}
              onClick={() => {
                setTextMode(false);
                // Le texte correspond à un lieu : on le rattache.
                const match = locations.find(
                  (location) => location.name.toLowerCase() === value.trim().toLowerCase(),
                );
                onChange(match ? match.id : "");
              }}
            >
              <List />
            </Button>
          )}
        </div>
        {value.trim() && <p className="text-xs text-muted-foreground">{t("links.place.notInProject")}</p>}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <LocationSelect
          id={id}
          value={isPlace ? value : ""}
          onChange={(next) => {
            if (next === FREE_TEXT) {
              setTextMode(true);
              onChange("");
            } else {
              onChange(next);
            }
          }}
          locations={locations}
          emptyLabel={t("links.place.choose")}
          extraOptions={[{ value: FREE_TEXT, label: t("links.place.freeText") }]}
          disabled={disabled || !loaded}
        />
      </div>
    </div>
  );
}
