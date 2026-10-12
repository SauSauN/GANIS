import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";

/**
 * Retrait d'une image (photo, bannière, image de galerie) : une question
 * est posée d'abord, car une image retirée ne va pas dans la corbeille.
 *
 * `ask(id)` ouvre la question ; `dialog` est à placer dans le rendu.
 */
export function useConfirmImageRemoval<T = void>(remove: (target: T) => void | Promise<void>): {
  ask: (target: T) => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation("common");
  const [pending, setPending] = useState<{ target: T } | null>(null);

  return {
    ask: (target: T) => setPending({ target }),
    dialog: (
      <ConfirmDialog
        open={pending !== null}
        title={t("image.removeTitle")}
        description={t("image.removeBody")}
        confirmLabel={t("image.removeConfirm")}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await remove(pending.target);
          setPending(null);
        }}
      />
    ),
  };
}
