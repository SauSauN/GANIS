import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, isTauri } from "@/lib/api";
import {
  normalizeRecoveryGroup,
  RECOVERY_KEY_GROUPS,
  splitRecoveryKey,
} from "@/lib/recoveryKey";

/**
 * Raison de l'affichage de la clé :
 * - `created` : nouveau compte ;
 * - `migrated` : compte créé avant le chiffrement, chiffré à cette connexion ;
 * - `regenerated` : nouvelle clé demandée depuis les paramètres.
 */
export type RecoveryKeyContext = "created" | "migrated" | "regenerated";

interface RecoveryKeyPanelProps {
  recoveryKey: string;
  username: string;
  context: RecoveryKeyContext;
  /** Appelé une fois que l'utilisateur a confirmé avoir noté la clé. */
  onConfirmed: () => void;
}

type ActionStatus = "copied" | "saved" | "copyFailed" | "saveFailed" | null;

/**
 * Affiche une clé de récupération, une seule fois.
 *
 * L'utilisateur peut la copier ou l'enregistrer dans un fichier, puis doit
 * ressaisir l'un des six groupes (tiré au hasard) pour continuer : c'est la
 * preuve qu'il l'a bien notée quelque part.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  username,
  context,
  onConfirmed,
}: RecoveryKeyPanelProps) {
  const { t, i18n } = useTranslation("recovery");

  const groups = splitRecoveryKey(recoveryKey);

  // Groupe à ressaisir, tiré une fois pour toutes à l'affichage.
  const [checkIndex] = useState(() =>
    Math.floor(Math.random() * RECOVERY_KEY_GROUPS),
  );
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<ActionStatus>(null);
  const [saving, setSaving] = useState(false);

  const confirmed =
    normalizeRecoveryGroup(typed) === groups[checkIndex];

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setStatus("copied");
    } catch {
      setStatus("copyFailed");
    }
  }

  async function saveToFile() {
    setSaving(true);

    try {
      const saved = await api.saveRecoveryKeyFile({
        recoveryKey,
        username,
        language: i18n.resolvedLanguage ?? "fr",
        dialogTitle: t("panel.saveDialogTitle"),
      });

      if (saved) {
        setStatus("saved");
      }
    } catch {
      setStatus("saveFailed");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (confirmed) {
      onConfirmed();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>

        <h2 className="text-lg font-semibold">{t(`panel.title.${context}`)}</h2>

        <p className="text-sm text-muted-foreground">
          {t(`panel.intro.${context}`)}
        </p>
      </div>

      {/* Clé : six groupes, en police à chasse fixe pour éviter les confusions */}
      <div
        aria-label={t("panel.keyLabel")}
        className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-base tracking-widest select-all sm:grid-cols-6"
      >
        {groups.map((group, index) => (
          <span key={index} className="text-center">
            {group}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {status === "copied" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {status === "copied" ? t("panel.copied") : t("panel.copy")}
        </Button>

        {isTauri() && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void saveToFile()}
          >
            {status === "saved" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {status === "saved" ? t("panel.saved") : t("panel.save")}
          </Button>
        )}
      </div>

      {(status === "copyFailed" || status === "saveFailed") && (
        <p role="alert" className="text-sm text-destructive">
          {t(`panel.${status}`)}
        </p>
      )}

      <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />

        <div className="space-y-1">
          <p className="font-medium">{t("panel.warningTitle")}</p>
          <p className="text-muted-foreground">{t("panel.warning")}</p>
          {context === "regenerated" && (
            <p className="text-muted-foreground">{t("panel.oldKeyRevoked")}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recovery-check">
          {t("panel.check", { number: checkIndex + 1 })}
        </Label>

        <Input
          id="recovery-check"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="max-w-40 font-mono uppercase tracking-widest"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={!confirmed}>
        {t("panel.continue")}
      </Button>
    </form>
  );
}
