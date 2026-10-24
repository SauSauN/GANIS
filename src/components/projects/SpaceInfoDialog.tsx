import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectSpace } from "@/lib/projectSpace";

/*
 * Petite fenêtre qui explique un espace de projets (public ou privé).
 *
 * Rien n'est écrit en permanence dans l'écran : l'information s'affiche
 * dans cette fenêtre, que l'on ferme, et se rouvre en cliquant sur le
 * badge « Espace public / privé » du tableau de bord.
 *
 * - `mode="start"` : au clic sur « Commencer » (accueil), avant d'entrer
 *   dans l'espace public ; « Continuer sans compte » ou « Se connecter ».
 *   Une case permet de ne plus l'afficher à cet endroit (le badge, lui,
 *   la rouvre toujours).
 * - `mode="info"` : depuis le badge, simple rappel à fermer.
 */

const HIDE_ON_START_KEY = "ganis-public-space-info-hidden";

/** Vrai si la fenêtre doit s'ouvrir au clic sur « Commencer ». */
export function showPublicInfoOnStart(): boolean {
  try {
    return localStorage.getItem(HIDE_ON_START_KEY) !== "1";
  } catch {
    return true;
  }
}

function hidePublicInfoOnStart(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDE_ON_START_KEY, "1");
    else localStorage.removeItem(HIDE_ON_START_KEY);
  } catch {
    /* préférence non retenue : la fenêtre se rouvrira, rien de grave */
  }
}

interface SpaceInfoDialogProps {
  open: boolean;
  space: ProjectSpace;
  mode: "start" | "info";
  onClose: () => void;
  /** « Continuer sans compte » (mode `start`). */
  onContinue?: () => void;
  /** « Se connecter » (espace public uniquement). */
  onSignIn?: () => void;
}

export function SpaceInfoDialog({ open, space, mode, onClose, onContinue, onSignIn }: SpaceInfoDialogProps) {
  const { t } = useTranslation("dashboard");
  const [dontShow, setDontShow] = useState(!showPublicInfoOnStart());
  const Icon = space === "public" ? Globe : Lock;
  const points = t(`space.info.${space}.points`, { returnObjects: true }) as unknown;
  const pointList = Array.isArray(points) ? (points as string[]) : [];

  function close(then?: () => void) {
    if (mode === "start") hidePublicInfoOnStart(dontShow);
    onClose();
    then?.();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()} className="max-w-md" guardInput={false}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {t(`space.info.${space}.title`)}
        </DialogTitle>
        <DialogDescription>{t(`space.info.${space}.text`)}</DialogDescription>
      </DialogHeader>

      {pointList.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm leading-6">
          {pointList.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      {mode === "start" && (
        <label className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={dontShow}
            onChange={(event) => setDontShow(event.target.checked)}
          />
          {t("space.info.dontShowOnStart")}
        </label>
      )}

      <DialogFooter className="mt-6 gap-2">
        {space === "public" && onSignIn && (
          <Button variant="outline" onClick={() => close(onSignIn)}>
            <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("space.info.signIn")}
          </Button>
        )}
        {mode === "start" ? (
          <Button onClick={() => close(onContinue)}>{t("space.info.continue")}</Button>
        ) : (
          <Button onClick={() => close()}>{t("space.info.understood")}</Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
