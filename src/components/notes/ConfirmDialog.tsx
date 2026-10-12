import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  /** Action confirmée ; une erreur est affichée dans la fenêtre. */
  onConfirm: () => Promise<void>;
}

/** Question avant une suppression (dossier, note). */
export function ConfirmDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) {
          setError(null);
          onCancel();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
