import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, FileType, Loader2 } from "lucide-react";
import { ActionMenu } from "@/components/documents/ActionMenu";
import { api } from "@/lib/api";
import { exportFileName } from "@/lib/novel";
import { renderDocument, type ExportDocument, type ExportFormat } from "@/lib/novelExport";
import { toast } from "@/stores/toastStore";

interface ExportMenuProps {
  /** Libellé du bouton (« Exporter »). */
  label: string;
  /** Titre de la fenêtre d'enregistrement. */
  dialogTitle: string;
  /** Nom du fichier, sans extension. */
  fileBase: string;
  /** Document à exporter, construit au moment du clic. */
  build: () => ExportDocument;
  disabled?: boolean;
}

/**
 * Bouton « Exporter » : Word, PDF ou texte brut. Le fichier est créé dans
 * GANIS, puis enregistré à l'emplacement choisi dans la fenêtre du système.
 */
export function ExportMenu({ label, dialogTitle, fileBase, build, disabled }: ExportMenuProps) {
  const { t } = useTranslation("novel");
  const [busy, setBusy] = useState(false);

  async function run(format: ExportFormat) {
    setBusy(true);
    try {
      const bytes = await renderDocument(build(), format);
      const file = await api.saveExportFile(exportFileName(fileBase, format), dialogTitle, bytes);
      if (file) toast({ tone: "success", message: t("manuscript.exported", { file }) });
    } catch (e) {
      toast({ tone: "error", message: e instanceof Error && e.message ? e.message : t("manuscript.exportFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (disabled || busy) {
    return (
      <span className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground opacity-70">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {busy ? t("manuscript.exporting") : label}
      </span>
    );
  }

  return (
    <ActionMenu
      label={label}
      className="h-8 w-auto gap-2 border px-3 text-sm text-foreground"
      trigger={
        <>
          <Download className="size-4" />
          {label}
        </>
      }
      items={[
        { id: "docx", label: t("manuscript.exportWord"), icon: FileText, run: () => void run("docx") },
        { id: "pdf", label: t("manuscript.exportPdf"), icon: FileType, run: () => void run("pdf") },
        { id: "txt", label: t("manuscript.exportText"), icon: FileText, separated: true, run: () => void run("txt") },
      ]}
    />
  );
}
