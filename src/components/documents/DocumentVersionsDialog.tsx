import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { errorText, formatSize, useDocumentStore } from "@/lib/documents";
import { toast } from "@/stores/toastStore";
import type { DocumentVersion, StructureDocument } from "@/types";

interface DocumentVersionsDialogProps {
  projectId: string;
  document: StructureDocument | null;
  onClose: () => void;
}

/**
 * Versions précédentes d'un document : chaque remplacement, modification
 * dans une autre application ou texte enregistré dans GANIS garde l'ancien
 * contenu (20 versions au plus). Restaurer garde d'abord le contenu actuel.
 */
export function DocumentVersionsDialog({ projectId, document, onClose }: DocumentVersionsDialogProps) {
  const { t, i18n } = useTranslation("documents");
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Version dont la suppression (définitive) attend une confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const upsert = useDocumentStore((state) => state.upsert);

  useEffect(() => {
    if (!document) return;
    setVersions(null);
    setError(null);
    api
      .listDocumentVersions(projectId, document.id)
      .then(setVersions)
      .catch((cause) => setError(errorText(cause)));
  }, [projectId, document]);

  if (!document) return null;

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  const restore = (version: DocumentVersion) =>
    run(version.id, async () => {
      const updated = await api.restoreDocumentVersion(projectId, document.id, version.id);
      upsert(projectId, updated);
      toast({ message: t("versions.restored", { date: date(version.createdAt) }), tone: "success" });
      onClose();
    });

  const remove = (version: DocumentVersion) =>
    run(version.id, async () => {
      await api.deleteDocumentVersion(projectId, version.id);
      setVersions((list) => list?.filter((item) => item.id !== version.id) ?? null);
      upsert(projectId, { ...document, versions: Math.max(0, document.versions - 1) });
    });

  const saveAs = (version: DocumentVersion) =>
    run(version.id, async () => {
      const name = await api.saveStructureDocumentAs(projectId, document.id, version.id, t("dialogs.saveAs"));
      if (name) toast({ message: t("saved", { name }), tone: "success" });
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{t("versions.title", { name: document.name })}</DialogTitle>
        <DialogDescription>{t("versions.description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4">
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="flex-1">
            <span className="font-medium">{t("versions.current")}</span>
            <span className="text-muted-foreground"> · {date(document.updatedAt)} · {formatSize(document.size)}</span>
          </span>
        </div>
        {versions === null && !error ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t("viewer.loading")}
          </p>
        ) : versions && versions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("versions.empty")}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {(versions ?? []).map((version) => (
              <li key={version.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block">{date(version.createdAt)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {version.name !== document.name ? `${version.name} · ` : ""}
                    {formatSize(version.size)}
                  </span>
                </span>
                {busy === version.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void restore(version)}>
                  <RotateCcw />
                  {t("versions.restore")}
                </Button>
                <Button size="icon-sm" variant="ghost" disabled={busy !== null} onClick={() => void saveAs(version)} aria-label={t("actions.saveAs")} title={t("actions.saveAs")}>
                  <Download />
                </Button>
                {confirming === version.id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={() => {
                      setConfirming(null);
                      void remove(version);
                    }}
                    onBlur={() => setConfirming(null)}
                    autoFocus
                  >
                    {t("versions.confirmDelete")}
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => setConfirming(version.id)}
                    aria-label={t("versions.delete")}
                    title={t("versions.delete")}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="ghost" onClick={onClose}>
          {t("viewer.close")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
