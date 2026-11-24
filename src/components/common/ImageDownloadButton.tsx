import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { Button } from "@/components/ui/button";
import { downloadImage } from "@/lib/downloadImage";
import { errorText } from "@/lib/errors";
import { notifyError, notifyInfo } from "@/lib/notify";

/**
 * « Télécharger » : enregistre l'image affichée sur l'ordinateur (fenêtre
 * « Enregistrer sous » du système), avec `name` comme nom de fichier
 * proposé. Utilisé dans toutes les fenêtres qui montrent une image en grand.
 */
export function ImageDownloadButton({ url, name, className }: { url: string; name: string; className?: string }) {
  const { t } = useTranslation("common");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const file = await downloadImage(url, name, t("image.downloadTitle"));
      if (file) notifyInfo(t("image.downloaded", { file }), "image:download");
    } catch (e) {
      notifyError(`${t("image.downloadFailed")} ${errorText(e)}`, "image:download");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={busy} className={className}>
      {busy ? <LoadingDots /> : <Download />}
      {t("image.download")}
    </Button>
  );
}
