import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UnsavedQueueQuestion } from "@/components/layout/useUnsavedQueue";

interface UnsavedChangesDialogProps {
  /** Ce qui déclenche la question : fermer des onglets, quitter la page ou GANIS. */
  reason: "closeTabs" | "leave" | "quit";
  /** Élément demandé (`null` : fenêtre fermée). */
  question: UnsavedQueueQuestion | null;
  busy: boolean;
  /** Vrai si l'enregistrement de cet élément vient d'échouer. */
  failed: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * « Voulez-vous enregistrer les modifications de … ? »
 *
 * Toujours pour **un seul** élément à la fois (voir `useUnsavedQueue`) :
 * le choix ne vaut que pour lui. S'il en reste d'autres, la question est
 * reposée pour chacun.
 *
 * - Enregistrer (puis élément suivant) ;
 * - Ne pas enregistrer (ses modifications sont perdues, puis élément suivant) ;
 * - Annuler (on s'arrête là : les éléments suivants ne sont pas touchés).
 */
export function UnsavedChangesDialog({
  reason,
  question,
  busy,
  failed,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation("unsaved");

  if (!question) {
    return null;
  }

  const remaining = question.total - question.current;

  // Libellés de fin (« Enregistrer et quitter ») seulement pour le dernier
  // élément : avant, on passe simplement au suivant.
  const step = question.hasNext ? "closeTabs" : reason;

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogHeader>
        {question.total > 1 && (
          <p className="text-xs font-medium text-muted-foreground">
            {t("progress", { current: question.current, total: question.total })}
          </p>
        )}

        <DialogTitle>{t("title.one", { name: question.label })}</DialogTitle>

        <DialogDescription>{t(`description.${reason}`)}</DialogDescription>
      </DialogHeader>

      {remaining > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("remaining", { count: remaining })}
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t("saveFailed", { name: question.label })}
        </p>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={busy}>
          {t(`discard.${step}`)}
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? t("saving") : t(`save.${step}`)}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
