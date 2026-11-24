import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, LockKeyhole } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { DeviceLockIssue } from "@/types";

/**
 * Données verrouillées au démarrage.
 *
 * La base de l'application est chiffrée avec une clé liée à cet ordinateur
 * et à ce compte Windows (DPAPI). Après une réinstallation de Windows ou une
 * copie du dossier de données sur un autre ordinateur, cette clé ne
 * s'ouvre plus : seul le fichier de clé de secours, enregistré depuis les
 * paramètres, permet de retrouver les données. GANIS redémarre ensuite.
 */
export function DeviceLocked({ issue }: { issue: DeviceLockIssue }) {
  const { t } = useTranslation("recovery");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      // En cas de succès, l'application redémarre d'elle-même.
      await api.restoreDeviceKey(t("device.locked.dialogTitle"));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-10">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <LockKeyhole className="size-6 shrink-0 text-primary" />
          <h1 className="text-lg font-semibold">{t("device.locked.title")}</h1>
        </div>

        <p className="text-sm text-muted-foreground">{t(`device.locked.reason.${issue}`)}</p>
        <p className="text-sm text-muted-foreground">{t("device.locked.explanation")}</p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button onClick={() => void restore()} disabled={busy} className="self-start">
          {busy ? <LoadingDots className="" /> : <KeyRound />}
          {t("device.locked.restore")}
        </Button>

        <p className="text-xs text-muted-foreground">{t("device.locked.noBackup")}</p>
      </div>
    </main>
  );
}
