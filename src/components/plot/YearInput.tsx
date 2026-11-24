import { NumberStepper } from "@/components/common/NumberStepper";
import { MAX_YEAR, MIN_YEAR } from "@/lib/plot";

interface YearInputProps {
  id?: string;
  value: number | null;
  /** Appelé avec l'année entière choisie, ou `null` quand le champ est vidé. */
  onChange: (year: number | null) => void;
  placeholder?: string;
  /** Mise en page seulement (largeur…) : l'apparence est celle du choix « − valeur + ». */
  className?: string;
  "aria-label"?: string;
  title?: string;
}

/**
 * Année dans le calendrier de l'histoire (négative possible), en « − année + »
 * comme tous les choix de valeur. Le champ vidé efface l'année.
 */
export function YearInput({ id, value, onChange, placeholder, className, title, ...rest }: YearInputProps) {
  return (
    <NumberStepper
      id={id}
      value={value}
      min={MIN_YEAR}
      max={MAX_YEAR}
      allowEmpty
      placeholder={placeholder}
      title={title}
      aria-label={rest["aria-label"]}
      onChange={(year) => onChange(year === null ? null : Math.round(year))}
      size="sm"
      valueClassName="w-full min-w-[3.5rem]"
      className={className}
    />
  );
}
