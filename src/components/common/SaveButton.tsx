import { Save } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
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
  /** Apparence (par défaut, bouton principal). */
  variant?: "default" | "ghost" | "outline";
}

/**
 * Bouton « Enregistrer » de largeur stable : pendant l'enregistrement, le
 * libellé ne change pas (seule l'icône devient trois points qui rebondissent), pour que rien ne bouge
 * autour. Le résultat est annoncé par une notification (`notify.ts`).
 */
export function SaveButton({ saving, disabled, onClick, type = "button", size = "sm", className, label, variant }: SaveButtonProps) {
  const { t } = useTranslation("common");
  const Icon = saving ? LoadingDots : Save;

  return (
    <Button
      type={type}
      size={size}
      variant={variant}
      className={className}
      onClick={onClick}
      disabled={saving || disabled}
      aria-busy={saving || undefined}
    >
      <Icon className="mr-1.5 size-4" aria-hidden="true" />
      {label ?? t("actions.save")}
    </Button>
  );
}
