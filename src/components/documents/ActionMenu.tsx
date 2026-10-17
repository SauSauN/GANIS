import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Raccourci affiché (« Alt+↑ »). */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Trait de séparation avant l'élément. */
  separated?: boolean;
  run: () => void;
}

interface ActionMenuProps {
  label: string;
  items: MenuItem[];
  /** Bouton d'ouverture (par défaut : « … »). */
  trigger?: ReactNode;
  className?: string;
}

/**
 * Menu « … » d'une ligne : s'ouvre au clic, se parcourt au clavier
 * (flèches, Début, Fin, Échap), se place là où il y a de la place.
 */
export function ActionMenu({ label, items, trigger, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const below = button.bottom + 4 + menu.height <= window.innerHeight - 8;
    const top = below ? button.bottom + 4 : Math.max(8, button.top - 4 - menu.height);
    const left = Math.min(Math.max(8, button.right - menu.width), window.innerWidth - menu.width - 8);
    setPosition({ top, left });
    menuRef.current.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function dismiss(focusButton: boolean) {
    setOpen(false);
    setPosition(null);
    if (focusButton) buttonRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
      return;
    } else if (event.key === "Tab") {
      event.preventDefault();
      dismiss(true);
      return;
    }
    if (next !== null && buttons[next]) {
      event.preventDefault();
      buttons[next].focus();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? dismiss(false) : setOpen(true))}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          open && "bg-accent text-foreground",
          className,
        )}
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className="fixed z-[60] min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {item.separated && <div role="separator" className="my-1 h-px bg-border" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      dismiss(false);
                      item.run();
                    }}
                    className={cn(
                      "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                      item.danger && "text-destructive",
                    )}
                  >
                    {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4" />}
                    <span className="flex-1">{item.label}</span>
                    {item.hint && <kbd className="font-mono text-[0.7rem] text-muted-foreground">{item.hint}</kbd>}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
