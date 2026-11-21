import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "@/components/documents/ActionMenu";
import { cn } from "@/lib/utils";

/** Position d'un menu ouvert au clic droit (ou au clavier : sous l'élément). */
export function contextMenuPoint(event: ReactMouseEvent<HTMLElement>): { x: number; y: number } {
  // Touche Menu ou Maj + F10 : pas de position de souris.
  if (event.clientX === 0 && event.clientY === 0) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left + 16, y: rect.bottom };
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * Menu contextuel (clic droit), comme celui des onglets :
 * - s'affiche à l'endroit du clic, sans jamais déborder de la fenêtre ;
 * - se ferme au clic en dehors, avec Échap, au défilement, au
 *   redimensionnement ou quand la fenêtre perd le focus ;
 * - clavier : flèches haut / bas, Origine / Fin, Entrée pour choisir.
 */
export function ContextMenu({
  label,
  items,
  x,
  y,
  onDismiss,
}: {
  label: string;
  items: MenuItem[];
  x: number;
  y: number;
  /** `true` : rendre le focus à l'élément d'origine (Échap, Tab). */
  onDismiss: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const dismiss = () => dismissRef.current(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) dismiss();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Tab") {
      event.preventDefault();
      onDismiss(true);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      buttons[next].focus();
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className="fixed z-[60] min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {item.separated && <div role="separator" className="-mx-1 my-1 h-px bg-border" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onDismiss(false);
                item.run();
              }}
              className={cn(
                "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40",
                item.danger && "text-destructive",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <kbd className="shrink-0 text-[0.7rem] text-muted-foreground">{item.hint}</kbd>}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
