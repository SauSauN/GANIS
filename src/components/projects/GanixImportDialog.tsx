import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { CopyPlus, FileArchive, Lock, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GanixCounts, GanixImportMode, GanixPreview } from "@/types";
import { errorText } from "@/lib/errors";

const DATE_LOCALES = { fr, en: enUS } as const;

const COUNT_KEYS: (keyof GanixCounts)[] = [
  "characters",
  "locations",
  "structureNodes",
  "relations",
  "placeLinks",
];

/** Taille lisible (Ko, Mo, Go). */
export function formatBytes(bytes: number, language: string): string {
  const units = language === "en" ? ["B", "KB", "MB", "GB"] : ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toLocaleString(language, { maximumFractionDigits: digits })} ${units[unit]}`;
}

interface GanixImportDialogProps {
  /** Aperçu du fichier vérifié ; `null` ferme la fenêtre. */
  preview: GanixPreview | null;
  /** Confirme l'import (l'erreur éventuelle est affichée dans la fenêtre). */
  onConfirm: (mode: GanixImportMode) => Promise<void>;
  /** Abandon : la zone d'attente est supprimée. */
  onCancel: () => void;
}

/**
 * Aperçu d'un `.ganix` avant import (étape 5 du cahier des charges) :
 * nom, type, contenu, date d'export. Si l'utilisateur a déjà ce projet,
 * il choisit entre une copie (par défaut) et un remplacement, qu'il doit
 * confirmer explicitement.
 */
export function GanixImportDialog({ preview, onConfirm, onCancel }: GanixImportDialogProps) {
  const { t, i18n } = useTranslation(["projects", "common"]);
  const language = i18n.resolvedLanguage === "en" ? "en" : "fr";

  const [mode, setMode] = useState<GanixImportMode>("copy");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nouveau fichier : choix par défaut.
  useEffect(() => {
    setMode("copy");
    setReplaceConfirmed(false);
    setBusy(false);
    setError(null);
  }, [preview?.stagingId]);

  const replacing = preview?.alreadyOwned === true && mode === "replace";

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    try {
      await onConfirm(preview?.alreadyOwned ? mode : "copy");
    } catch (e) {
      setError(errorText(e, "projects:ganix.import.failed"));
      setBusy(false);
    }
  }

  const exportedAt = preview
    ? (() => {
        const date = new Date(preview.exportedAt);
        return Number.isNaN(date.getTime())
          ? preview.exportedAt
          : format(date, "d MMM yyyy, HH:mm", { locale: DATE_LOCALES[language] });
      })()
    : "";

  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("ganix.import.title")}</DialogTitle>
          <DialogDescription>{t("ganix.import.description")}</DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="mt-2 space-y-4">
            {/* Identité du projet */}
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileArchive className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{preview.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`types.${preview.type}`)} · {t(`statuses.${preview.status}`)}
                </p>
                {preview.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{preview.description}</p>
                )}
              </div>
            </div>

            {/* Contenu */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              {COUNT_KEYS.map((key) => (
                <div key={key} className="flex items-baseline justify-between gap-2 sm:block">
                  <dt className="text-xs text-muted-foreground">{t(`ganix.import.counts.${key}`)}</dt>
                  <dd className="font-medium tabular-nums">{preview.counts[key]}</dd>
                </div>
              ))}
            </dl>

            <p className="text-xs text-muted-foreground">
              {t("ganix.import.exportedAt", { date: exportedAt })} ·{" "}
              {t("ganix.import.createdWith", { app: preview.createdWith })} ·{" "}
              {t("ganix.import.size", { size: formatBytes(preview.sizeBytes, language) })}
            </p>

            {/* Conflit : le projet est déjà dans le compte */}
            {preview.alreadyOwned && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("ganix.import.conflictTitle")}</legend>
                <p className="text-xs text-muted-foreground">{t("ganix.import.conflictDescription")}</p>

                <div role="radiogroup" className="grid gap-2">
                  {(
                    [
                      { id: "copy", icon: CopyPlus },
                      { id: "replace", icon: RefreshCcw },
                    ] as const
                  ).map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={mode === id}
                      disabled={busy}
                      onClick={() => {
                        setMode(id);
                        setReplaceConfirmed(false);
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        mode === id && "border-primary bg-primary/5 ring-1 ring-primary",
                        id === "replace" && mode === id && "border-destructive bg-destructive/5 ring-destructive",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          id === "replace" && mode === id ? "text-destructive" : "text-primary",
                        )}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block text-sm font-medium">{t(`ganix.import.modes.${id}.label`)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t(`ganix.import.modes.${id}.description`, { name: preview.name })}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {replacing && (
                  <label className="flex items-start gap-2 pt-1 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-destructive"
                      checked={replaceConfirmed}
                      disabled={busy}
                      onChange={(e) => setReplaceConfirmed(e.target.checked)}
                    />
                    {t("ganix.import.replaceConfirm")}
                  </label>
                )}
              </fieldset>
            )}

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              {replacing ? t("ganix.import.encryptionNoteReplace") : t("ganix.import.encryptionNote")}
            </p>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            variant={replacing ? "destructive" : "default"}
            disabled={busy || (replacing && !replaceConfirmed)}
            onClick={() => void handleConfirm()}
          >
            {busy
              ? t("ganix.import.importing")
              : replacing
                ? t("ganix.import.confirmReplace")
                : t("ganix.import.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}