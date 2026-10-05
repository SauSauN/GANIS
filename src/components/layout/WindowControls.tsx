import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";

const base =
  "flex h-full w-[46px] items-center justify-center text-foreground transition-colors";

/** Boutons Réduire / Agrandir-Restaurer / Fermer, style Windows. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const sync = () => {
      win
        .isMaximized()
        .then((m) => !cancelled && setMaximized(m))
        .catch(() => {});
    };

    sync();
    win
      .onResized(sync)
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Empêche le clic de remonter vers la zone de drag et exécute l'action Tauri.
  const run =
    (action: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) =>
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isTauri()) action(getCurrentWindow()).catch(() => {});
    };

  // Bloque aussi le mousedown pour éviter tout début de drag
  const stopDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label="Réduire"
        title="Réduire"
        onMouseDown={stopDrag}
        onClick={run((w) => w.minimize())}
        className={cn(base, "hover:bg-secondary")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path d="M0 5.5h10" />
        </svg>
      </button>

      <button
        type="button"
        aria-label={maximized ? "Restaurer" : "Agrandir"}
        title={maximized ? "Restaurer" : "Agrandir"}
        onMouseDown={stopDrag}
        onClick={run((w) => w.toggleMaximize())}
        className={cn(base, "hover:bg-secondary")}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5V0.5h7v7h-2" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>

      <button
        type="button"
        aria-label="Fermer"
        title="Fermer"
        onMouseDown={stopDrag}
        onClick={run((w) => w.close())}
        className={cn(base, "hover:bg-[#E81123] hover:text-white")}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path d="M0 0l10 10M10 0L0 10" />
        </svg>
      </button>
    </div>
  );
}