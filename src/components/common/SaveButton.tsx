import { Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface SaveButtonProps {
  saving: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Libellé (par défaut « Enregistrer »). */
  label?: string;
}

/**
 * Bouton « Enregistrer » de largeur stable : pendant l'enregistrement, le
 * libellé ne change pas (seule l'icône tourne), pour que rien ne bouge
 * autour. Le résultat est annoncé par une notification (`notify.ts`).
 */
export function SaveButton({ saving, disabled, onClick, type = "button", size = "sm", className, label }: SaveButtonProps) {
  const { t } = useTranslation("common");
  const Icon = saving ? Loader2 : Save;

  return (
    <Button
      type={type}
      size={size}
      className={className}
      onClick={onClick}
      disabled={saving || disabled}
      aria-busy={saving || undefined}
    >
      <Icon className={saving ? "mr-1.5 size-4 animate-spin" : "mr-1.5 size-4"} aria-hidden="true" />
      {label ?? t("actions.save")}
    </Button>
  );
}
