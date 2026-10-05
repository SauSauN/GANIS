import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/api";

export function WelcomeTitleBar() {
  const stopDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const run =
    (action: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) =>
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isTauri()) action(getCurrentWindow()).catch(() => {});
    };

  return (
    <header className="flex h-9 w-full shrink-0 select-none items-center border-b border-border bg-background">
      {/* Zone draggable */}
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-4"
      >
        <span className="pointer-events-none text-sm font-semibold tracking-tight">
          GANIS
        </span>
      </div>

      {/* Contrôles Windows */}
      <div className="flex h-full items-center" onMouseDown={stopDrag}>
        <button
          type="button"
          aria-label="Réduire"
          onClick={run((w) => w.minimize())}
          className="window-control flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus size={15} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          aria-label="Agrandir"
          onClick={run((w) => w.toggleMaximize())}
          className="window-control flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Square size={13} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          aria-label="Fermer"
          onClick={run((w) => w.close())}
          className="window-control flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}