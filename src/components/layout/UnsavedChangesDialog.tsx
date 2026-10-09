import { useTranslation } from "react-i18next";
import { Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UnsavedChangesDialogProps {
  open: boolean;
  /** Ce qui déclenche la question : fermer des onglets, quitter la page ou GANIS. */
  reason: "closeTabs" | "leave" | "quit";
  /** Noms des éléments non enregistrés. */
  items: string[];
  busy: boolean;
  /** Message d'échec d'un enregistrement, le cas échéant. */
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * « Voulez-vous enregistrer vos modifications ? »
 *
 * Trois choix, comme dans les éditeurs de texte :
 * - Enregistrer (puis continuer) ;
 * - Ne pas enregistrer (les modifications sont perdues) ;
 * - Annuler (rien ne se passe, on revient à l'écran).
 */
export function UnsavedChangesDialog({
  open,
  reason,
  items,
  busy,
  error,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation("unsaved");
  const single = items.length === 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogHeader>
        <DialogTitle>
          {single
            ? t("title.one", { name: items[0] })
            : t("title.many", { count: items.length })}
        </DialogTitle>
        <DialogDescription>{t(`description.${reason}`)}</DialogDescription>
      </DialogHeader>

      {!single && (
        <ul className="mt-4 space-y-1.5 rounded-lg border bg-muted/30 p-3">
          {items.map((name) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <Circle className="h-2 w-2 shrink-0 fill-current text-primary" aria-hidden />
              {name}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={busy}>
          {t(`discard.${reason}`)}
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? t("saving") : t(`save.${reason}`, { count: items.length })}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
