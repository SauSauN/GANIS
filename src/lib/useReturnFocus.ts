import { useEffect, useRef } from "react";

/**
 * Rend le focus à l'élément qui a ouvert une fenêtre, quand elle se ferme
 * (WCAG 2.4.3). Le déclencheur est relevé dès le rendu : dans un effet, un
 * champ `autoFocus` de la fenêtre l'aurait déjà remplacé. Si quelque chose a
 * déjà pris le focus à la fermeture, rien n'est touché ; si le déclencheur a
 * disparu (menu refermé…), le focus va à la zone principale.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    opener.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const previous = opener.current;
    return () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        if (previous?.isConnected && previous !== document.body) {
          previous.focus();
          return;
        }
        const main = document.querySelector<HTMLElement>("main, [role=main]");
        if (!main) return;
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus();
      }, 0);
    };
  }, [open]);
}
