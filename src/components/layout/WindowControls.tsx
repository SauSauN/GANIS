import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Survol du bouton « Agrandir » avant les Snap Layouts (comme Windows 11). */
const SNAP_DELAY_MS = 600;

/** Windows : les Snap Layouts existent (Windows 11 ; sans effet sur Windows 10). */
const onWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

const base =
  "flex h-full w-[2.875rem] items-center justify-center text-foreground transition-colors";

/** Boutons Réduire / Agrandir-Restaurer / Fermer, style Windows. */
export function WindowControls() {
  const { t } = useTranslation("titlebar");
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

  const maximizeLabel = maximized ? t("window.restore") : t("window.maximize");

  // Snap Layouts : un survol prolongé du bouton « Agrandir » ouvre les
  // dispositions d'ancrage de Windows, comme sur une fenêtre native (voir
  // `show_snap_layouts` côté Rust). Un clic agrandit ou restaure toujours.
  const snapTimer = useRef<number | null>(null);
  const cancelSnap = () => {
    if (snapTimer.current !== null) window.clearTimeout(snapTimer.current);
    snapTimer.current = null;
  };
  const scheduleSnap = () => {
    if (!isTauri() || !onWindows) return;
    cancelSnap();
    snapTimer.current = window.setTimeout(() => {
      snapTimer.current = null;
      invoke("show_snap_layouts").catch(() => {});
    }, SNAP_DELAY_MS);
  };
  useEffect(() => cancelSnap, []);

  return (
    <div className="flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label={t("window.minimize")}
        title={t("window.minimize")}
        onMouseDown={stopDrag}
        onClick={run((w) => w.minimize())}
        className={cn(base, "hover:bg-secondary")}
      >
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" className="size-[0.625rem]">
          <path d="M0 5.5h10" />
        </svg>
      </button>

      <button
        type="button"
        aria-label={maximizeLabel}
        // Sous Windows, pas d'infobulle : elle masquerait les Snap Layouts.
        title={onWindows && isTauri() ? undefined : maximizeLabel}
        onMouseEnter={scheduleSnap}
        onMouseLeave={cancelSnap}
        onMouseDown={(e) => {
          cancelSnap();
          stopDrag(e);
        }}
        onClick={run((w) => w.toggleMaximize())}
        className={cn(base, "hover:bg-secondary")}
      >
        {maximized ? (
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" className="size-[0.625rem]">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5V0.5h7v7h-2" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" className="size-[0.625rem]">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>

      <button
        type="button"
        aria-label={t("window.close")}
        title={t("window.close")}
        onMouseDown={stopDrag}
        onClick={run((w) => w.close())}
        className={cn(base, "hover:bg-[#E81123] hover:text-white")}
      >
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true" className="size-[0.625rem]">
          <path d="M0 0l10 10M10 0L0 10" />
        </svg>
      </button>
    </div>
  );
}