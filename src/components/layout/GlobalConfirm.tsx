import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmStore } from "@/stores/confirmStore";

/** Fenêtre des questions posées par `askConfirm` (voir `confirmStore`). */
export function GlobalConfirm() {
  const { t } = useTranslation("common");
  const pending = useConfirmStore((state) => state.pending);
  const answer = useConfirmStore((state) => state.answer);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => setDontAskAgain(false), [pending]);

  if (!pending) return null;

  return (
    <Dialog role="alertdialog" open onOpenChange={(open) => !open && answer(false)}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {pending.tone === "danger" && <ShieldAlert className="size-5 shrink-0 text-destructive" />}
          {pending.title}
        </DialogTitle>
        <DialogDescription className="whitespace-pre-line">{pending.description}</DialogDescription>
      </DialogHeader>

      {pending.dontAskAgainKey && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={dontAskAgain}
            onChange={(event) => setDontAskAgain(event.target.checked)}
          />
          {t("confirm.dontAskAgain")}
        </label>
      )}

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={() => answer(false)}>
          {t("actions.cancel")}
        </Button>
        <Button
          variant={pending.tone === "danger" ? "destructive" : "default"}
          onClick={() => answer(true, dontAskAgain)}
        >
          {pending.confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
