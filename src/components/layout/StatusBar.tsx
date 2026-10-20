import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, CircleDot, HardDrive, Info, Loader2, Save, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { resolveSaveState, useSaveStatusStore } from "@/lib/saveStatus";
import { saveEntries, useUnsavedStore } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import { WritingTodayStatus } from "@/components/novel/WritingToday";
import type { AppInfo } from "@/types";

/** Heure courte (« 14:32 ») dans la langue de l'interface. */
function timeOf(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Barre d'état : mode hors ligne, projet local, et état réel des
 * enregistrements :
 * - « Enregistrement… » pendant une écriture ;
 * - « Échec de l'enregistrement » (message complet au survol) ;
 * - « N modification(s) non enregistrée(s) », avec « Tout enregistrer » ;
 * - « Enregistré à 14:32 » ;
 * - « Prêt » tant que rien n'a été modifié.
 */
export function StatusBar() {
  const { t, i18n } = useTranslation("statusbar");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  /** Fenêtre du détail de l'échec d'enregistrement. */
  const [detailsOpen, setDetailsOpen] = useState(false);

  const pending = useSaveStatusStore((state) => state.pending);
  const lastSavedAt = useSaveStatusStore((state) => state.lastSavedAt);
  const lastError = useSaveStatusStore((state) => state.lastError);
  const dismissError = useSaveStatusStore((state) => state.dismissError);
  const unsaved = useUnsavedStore((state) => Object.keys(state.entries).length);

  useEffect(() => {
    // Teste le pont Rust. En simple navigateur (sans Tauri), l'appel échoue : on l'ignore.
    api.appInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const state = resolveSaveState(pending, lastError, unsaved, lastSavedAt);

  async function saveAll() {
    setSavingAll(true);
    try {
      await saveEntries(Object.keys(useUnsavedStore.getState().entries));
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <WifiOff className="h-3 w-3" /> {t("offline")}
        </span>
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" /> {t("localProject")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <WritingTodayStatus />
        <span
          role="status"
          aria-live="polite"
          title={state === "error" ? (lastError ?? undefined) : undefined}
          className={cn(
            "flex items-center gap-1",
            state === "error" && "font-medium text-destructive",
            state === "unsaved" && "text-foreground",
          )}
        >
          {state === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
          {state === "error" && <CircleAlert className="h-3 w-3" />}
          {state === "unsaved" && <CircleDot className="h-3 w-3 text-warning" />}
          {(state === "saved" || state === "idle") && <Check className="h-3 w-3 text-success" />}
          {state === "saved" && lastSavedAt
            ? t("save.savedAt", { time: timeOf(lastSavedAt, i18n.language) })
            : state === "unsaved"
              ? t("save.unsaved", { count: unsaved })
              : t(state === "saving" ? "save.saving" : state === "error" ? "save.error" : "save.idle")}
        </span>

        {/* Détail de l'échec : au clic (et au clavier), pas seulement au survol. */}
        {state === "error" && lastError && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="-my-1 flex h-6 items-center gap-1 rounded px-2 font-medium text-foreground hover:bg-secondary"
          >
            <Info className="h-3 w-3" />
            {t("save.details")}
          </button>
        )}

        {state === "error" && (
          <button
            type="button"
            onClick={dismissError}
            title={t("save.dismiss")}
            aria-label={t("save.dismiss")}
            className="-my-1 flex size-6 items-center justify-center rounded hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {unsaved > 0 && state !== "saving" && (
          <button
            type="button"
            disabled={savingAll}
            onClick={() => void saveAll()}
            title={t("save.saveAllHint")}
            className="-my-1 flex h-6 items-center gap-1 rounded px-2 font-medium text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {t("save.saveAll")}
          </button>
        )}

        {info && <span>v{info.version}</span>}
      </div>

      <Dialog open={detailsOpen && lastError !== null} onOpenChange={setDetailsOpen}>
        <DialogHeader>
          <DialogTitle>{t("save.detailsTitle")}</DialogTitle>
          <DialogDescription>{t("save.detailsDescription")}</DialogDescription>
        </DialogHeader>
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-line text-destructive">
          {lastError}
        </p>
        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              dismissError();
              setDetailsOpen(false);
            }}
          >
            {t("save.dismiss")}
          </Button>
          <Button onClick={() => setDetailsOpen(false)}>{t("save.close")}</Button>
        </DialogFooter>
      </Dialog>
    </footer>
  );
}