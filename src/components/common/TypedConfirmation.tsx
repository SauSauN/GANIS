import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Saisie de confirmation (« Retapez le nom du projet… ») pour une action
 * lourde de conséquences : la confirmation n'est possible que lorsque le
 * texte attendu a été retapé.
 *
 * Même règle que Rust (`project_service::name_confirmed`) : espaces de
 * début et de fin et majuscules ignorés ; un texte attendu vide ne
 * confirme jamais rien.
 */
export function confirmationMatches(expected: string, typed: string): boolean {
  const wanted = expected.trim().toLocaleLowerCase();

  return wanted.length > 0 && typed.trim().toLocaleLowerCase() === wanted;
}

interface TypedConfirmationProps {
  /** Consigne affichée au-dessus du champ (elle cite le texte attendu). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TypedConfirmation({ label, value, onChange, disabled }: TypedConfirmationProps) {
  const id = useId();

  return (
    <div className="mt-4 space-y-2">
      <Label htmlFor={id} className="block leading-snug">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
