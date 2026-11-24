import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { IMAGE_ACTIONS_CLASS, IMAGE_DIALOG_WIDTH_CLASS, IMAGE_STAGE_CLASS } from "@/components/common/FrameEditor";
import { ImageDownloadButton } from "@/components/common/ImageDownloadButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MentionImageDialogProps {
  projectId: string;
  /** Image de la galerie citée avec « $i$ » (`null` : fenêtre fermée). */
  image: { id: string; label: string } | null;
  onClose: () => void;
  /** Ouvre la galerie du projet. */
  onOpenGallery?: () => void;
}

/** Image de la galerie citée dans une note : vue en grand, téléchargement. */
export function MentionImageDialog({ projectId, image, onClose, onOpenGallery }: MentionImageDialogProps) {
  const { t } = useTranslation(["notes", "common"]);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = image?.id ?? null;

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!id) return;
    let alive = true;
    api
      .getProjectGalleryImage(projectId, id)
      .then((data) => alive && setUrl(`data:${data.mime};base64,${data.data}`))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [projectId, id]);

  if (!image) return null;
  const name = image.label;

  return createPortal(
    <Dialog open onOpenChange={(next) => !next && onClose()} className={cn("relative", IMAGE_DIALOG_WIDTH_CLASS)}>
      <DialogHeader>
        <div className="flex min-h-6 items-center pr-10">
          <DialogTitle>{name}</DialogTitle>
        </div>
      </DialogHeader>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common:actions.close")}
        title={t("common:actions.close")}
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
      <div className="mt-4 space-y-4">
        <div className={cn("flex items-center justify-center rounded-lg bg-muted/40", IMAGE_STAGE_CLASS)}>
          {url ? (
            <img src={url} alt={name} className="block max-h-full max-w-full rounded-md object-contain" />
          ) : failed ? (
            <p className="text-sm text-muted-foreground">{t("notes:mentions.imageMissing")}</p>
          ) : (
            <LoadingDots aria-hidden className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className={cn(IMAGE_ACTIONS_CLASS, "justify-end gap-2")}>
          {onOpenGallery && (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => {
                onClose();
                onOpenGallery();
              }}
            >
              {t("notes:mentions.openGallery")}
            </Button>
          )}
          {url && <ImageDownloadButton url={url} name={name} className="h-8" />}
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}
