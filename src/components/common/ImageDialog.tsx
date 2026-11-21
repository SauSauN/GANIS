import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Crop, ImagePlus, Trash2, X } from "lucide-react";
import { FrameEditor, IMAGE_ACTIONS_CLASS, IMAGE_DIALOG_WIDTH_CLASS, IMAGE_STAGE_CLASS } from "@/components/common/FrameEditor";
import { ImageDownloadButton } from "@/components/common/ImageDownloadButton";
import { InfoTip } from "@/components/common/InfoTip";
import { cn } from "@/lib/utils";
import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { PORTRAIT_ACCEPT } from "@/lib/portraitImage";
import { useImageFrame, useImageFrameStore } from "@/stores/imageFrameStore";

interface ImageDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Clé du cadrage (voir `portraitFrameKey`) ; absente : image affichée entière (logo), sans cadrage. */
  frameKey?: string;
  url: string;
  /** Nom de la fiche (titre de la fenêtre). */
  name: string;
  onReplace: (file: File) => void;
  onRemove: () => void | Promise<void>;
}

/**
 * Image principale d'une fiche (personnage, lieu, objet, faune et flore…) :
 * vue en grand, cadrage de la zone affichée, remplacement et retrait.
 * S'ouvre d'un clic sur l'image.
 */
export function ImageDialog({ open, onClose, projectId, frameKey, url, name, onReplace, onRemove }: ImageDialogProps) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState<"view" | "frame">("view");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const frame = useImageFrame(projectId, frameKey ?? null);
  const setFrame = useImageFrameStore((s) => s.setFrame);
  const removal = useConfirmImageRemoval(async () => {
    await onRemove();
    if (frameKey) void setFrame(projectId, frameKey, null).catch(() => {});
    onClose();
  });

  useEffect(() => {
    if (open) setMode("view");
  }, [open]);

  async function save(next: Parameters<typeof setFrame>[2]) {
    if (!frameKey) return;
    setBusy(true);
    try {
      await setFrame(projectId, frameKey, next);
      setMode("view");
    } catch (e) {
      notifyError(errorText(e), "image:frame");
    } finally {
      setBusy(false);
    }
  }

  function replace(file: File) {
    // Nouvelle image : l'ancien cadrage ne lui correspond pas.
    if (frameKey) void setFrame(projectId, frameKey, null).catch(() => {});
    onReplace(file);
    onClose();
  }

  // Rendue hors de la fiche (portail) : la carte de la fiche est un
  // conteneur CSS qui enfermerait la fenêtre et laisserait d'autres éléments
  // de la fiche passer devant (et capter les clics).
  return createPortal(
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()} className={cn("relative", IMAGE_DIALOG_WIDTH_CLASS)}>
        <DialogHeader>
          {/* Le « i » du cadrage à côté du titre (hors du titre : il ne fait pas partie du nom de la fenêtre). */}
          <div className="flex min-h-6 items-center gap-1.5 pr-10">
            <DialogTitle>{mode === "frame" ? t("image.frameTitle") : t("image.view", { name })}</DialogTitle>
            {mode === "frame" && <InfoTip>{t("image.frameHint")}</InfoTip>}
          </div>
        </DialogHeader>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("actions.close")}
          title={t("actions.close")}
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>

        <div className="mt-4">
          {mode === "frame" ? (
            <FrameEditor url={url} frame={frame} busy={busy} onCancel={() => setMode("view")} onSave={(next) => void save(next)} />
          ) : (
            <div className="space-y-4">
              {/* Même zone que le cadrage : l'image entière y tient, sans déformation. */}
              <div className={cn("flex items-center justify-center rounded-lg bg-muted/40", IMAGE_STAGE_CLASS)}>
                <img src={url} alt={t("image.view", { name })} className="block max-h-full max-w-full rounded-md object-contain" data-testid="image-dialog-full" />
              </div>
              <div className={cn(IMAGE_ACTIONS_CLASS, "justify-end gap-2")}>
                <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => removal.ask()}>
                  <Trash2 />
                  {t("image.remove")}
                </Button>
                <ImageDownloadButton url={url} name={name} className="h-8" />
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  <ImagePlus />
                  {t("image.replace")}
                </Button>
                {frameKey && (
                  <Button type="button" onClick={() => setMode("frame")}>
                    <Crop />
                    {t("image.frame")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={PORTRAIT_ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) replace(file);
          }}
        />
      </Dialog>
      {removal.dialog}
    </>,
    document.body,
  );
}
