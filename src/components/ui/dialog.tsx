import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useReturnFocus } from "@/lib/useReturnFocus";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Classes du panneau (ex. largeur plus grande que `max-w-lg`). */
  className?: string;
  /**
   * Vrai (par défaut) : si quelque chose a été saisi dans la fenêtre, un
   * clic à côté ou Échap demandent d'abord confirmation au lieu de tout
   * perdre. Les boutons de la fenêtre (« Annuler »…) ferment sans question.
   */
  guardInput?: boolean;
}

/** Identifiants du titre et de la description, pour `aria-labelledby`. */
const DialogIdsContext = React.createContext<{
  titleId: string;
  descriptionId: string;
} | null>(null);

/** Champ où l'on tape du texte (zone, champ texte, éditeur). */
function isTextEntry(target: EventTarget): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return ["text", "search", "email", "url", "tel", "password", "number", ""].includes(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Fenêtre modale accessible (§31) :
 * - `role="dialog"` + `aria-modal`, nommée par son `DialogTitle` ;
 * - le focus entre dans la fenêtre à l'ouverture, y reste (Tab / Maj+Tab)
 *   et revient à l'élément d'origine à la fermeture ;
 * - Échap ou un clic sur le fond ferment la fenêtre ; si une saisie a été
 *   faite, une confirmation est demandée d'abord (`guardInput`).
 */
function Dialog({ open, onOpenChange, children, className, guardInput = true }: DialogProps) {
  const { t } = useTranslation("common");
  const panelRef = React.useRef<HTMLDivElement>(null);
  /** Une saisie a eu lieu depuis l'ouverture. */
  const typed = React.useRef(false);
  /** Question « Abandonner la saisie ? » affichée. */
  const [confirming, setConfirming] = React.useState(false);
  const keepRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  useReturnFocus(open);

  // Nouvelle ouverture : rien n'a encore été saisi.
  React.useEffect(() => {
    if (open) {
      typed.current = false;
      setConfirming(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  /**
   * Fermeture « implicite » (fond, Échap) : protégée si l'on a saisi.
   * Échap pendant la question revient simplement à la saisie.
   */
  const requestCloseRef = React.useRef(() => {});
  requestCloseRef.current = () => {
    if (confirming) {
      setConfirming(false);
      return;
    }

    if (guardInput && typed.current) {
      setConfirming(true);
      return;
    }

    onOpenChange(false);
  };

  React.useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];

    // Premier champ ou bouton (sauf si un champ a déjà le focus), sinon la
    // fenêtre elle-même.
    if (!panel?.contains(document.activeElement)) (focusables()[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Une seule fenêtre (la plus récente) traite Échap.
        e.stopImmediatePropagation();
        requestCloseRef.current();
        return;
      }

      if (e.key !== "Tab" || !panel) return;

      const items = focusables();

      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={() => requestCloseRef.current()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          "max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-6 shadow-lg outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onInput={(e) => {
          // Seule une saisie de texte compte (pas une case cochée).
          if (isTextEntry(e.target)) typed.current = true;
        }}
      >
        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby={`${titleId}-discard`}
            className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            <span id={`${titleId}-discard`} className="flex-1 font-medium">
              {t("dialog.discardQuestion")}
            </span>
            <button
              ref={keepRef}
              type="button"
              onClick={() => setConfirming(false)}
              className="h-7 rounded-md border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              {t("dialog.keepEditing")}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onOpenChange(false);
              }}
              className="h-7 rounded-md bg-destructive/10 px-2.5 text-sm font-medium text-destructive hover:bg-destructive/20"
            >
              {t("dialog.discard")}
            </button>
          </div>
        )}
        <DialogIdsContext.Provider value={{ titleId, descriptionId }}>
          {children}
        </DialogIdsContext.Provider>
      </div>
    </div>
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  const ids = React.useContext(DialogIdsContext);

  return (
    <h2
      id={ids?.titleId}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const ids = React.useContext(DialogIdsContext);

  return (
    <p
      id={ids?.descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};