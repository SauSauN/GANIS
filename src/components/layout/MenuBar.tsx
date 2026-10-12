import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGuardedNavigate } from "@/components/layout/UnsavedChangesGuard";
import { isTauri } from "@/lib/api";
import { runCommand, useCommand, useDashboardIntent, type CommandId } from "@/lib/commands";
import { runEditAction, type EditAction } from "@/lib/editCommands";
import { formatCombo, shortcutOf, useHelpStore, type AppAction } from "@/lib/shortcuts";
import { applyTheme, useResolvedTheme } from "@/lib/theme";
import { undoLastDeletion } from "@/lib/trash";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toastStore";

type MenuId = "file" | "edit" | "view" | "project" | "help";

type Entry =
  | { kind: "separator" }
  | { kind: "item"; id: string; label: string; shortcut?: string; disabled?: boolean; onSelect: () => void };

const SEPARATOR: Entry = { kind: "separator" };

/**
 * Barre de menus de la fenêtre (Fichier, Édition, Affichage, Projet, Aide),
 * comme dans les logiciels de bureau :
 * - un clic ouvre un menu ; une fois ouvert, le survol passe d'un menu à l'autre ;
 * - clavier : Alt seul (ou F10) donne le clavier à la barre, ← → changent
 *   de menu, ↑ ↓ parcourent les choix, Entrée valide, Échap ferme ;
 * - les actions sont celles des raccourcis (voir `commands.ts`) : une
 *   action indisponible ici est grisée.
 */
export function MenuBar() {
  const { t } = useTranslation("menus");
  const navigate = useGuardedNavigate();
  const theme = useResolvedTheme();
  const showHelp = useHelpStore((state) => state.show);
  const requestIntent = useDashboardIntent((state) => state.request);

  const [open, setOpen] = useState<MenuId | null>(null);
  const [active, setActive] = useState(-1);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** Le menu a été ouvert au clavier : le premier choix prend le clavier. */
  const openedByKeyboard = useRef(false);

  const shift = t("shift");
  const keys = (action: AppAction) => {
    const combo = shortcutOf(action);
    return combo ? formatCombo(combo, shift) : undefined;
  };

  // Commandes proposées par l'écran affiché.
  const commands: Record<CommandId, ReturnType<typeof useCommand>> = {
    new: useCommand("new"),
    save: useCommand("save"),
    saveAll: useCommand("saveAll"),
    closeTab: useCommand("closeTab"),
    exportProject: useCommand("exportProject"),
    importGanix: useCommand("importGanix"),
    togglePanel: useCommand("togglePanel"),
    toggleRail: useCommand("toggleRail"),
    nextTab: useCommand("nextTab"),
    previousTab: useCommand("previousTab"),
    openHome: useCommand("openHome"),
    openSynopsis: useCommand("openSynopsis"),
    openProjectSettings: useCommand("openProjectSettings"),
    openTrash: useCommand("openTrash"),
    openHistory: useCommand("openHistory"),
    palette: useCommand("palette"),
  };

  const command = (id: CommandId, fallbackLabel: string, shortcut?: AppAction): Entry => ({
    kind: "item",
    id,
    label: commands[id]?.label ?? fallbackLabel,
    shortcut: shortcut ? keys(shortcut) : undefined,
    disabled: !commands[id] || commands[id]?.disabled,
    onSelect: () => runCommand(id),
  });

  const edit = (action: EditAction, label: string, shortcut: string): Entry => ({
    kind: "item",
    id: action,
    label,
    shortcut,
    onSelect: () => {
      void runEditAction(action).then((done) => {
        if (done) return;
        if (action === "undo" && undoLastDeletion()) return;
        toast({ message: action === "paste" ? t("edit.pasteBlocked") : t("edit.nothing") });
      });
    },
  });

  const menus: Record<MenuId, Entry[]> = {
    file: [
      command("new", t("file.new"), "new"),
      SEPARATOR,
      command("save", t("file.save"), "save"),
      command("saveAll", t("file.saveAll"), "saveAll"),
      SEPARATOR,
      command("closeTab", t("file.closeTab"), "closeTab"),
      SEPARATOR,
      command("exportProject", t("file.export")),
      {
        kind: "item",
        id: "importGanix",
        label: t("file.import"),
        onSelect: () => {
          if (!runCommand("importGanix")) {
            requestIntent("importGanix");
            navigate("/dashboard");
          }
        },
      },
      SEPARATOR,
      { kind: "item", id: "dashboard", label: t("file.dashboard"), onSelect: () => navigate("/dashboard") },
      { kind: "item", id: "settings", label: t("file.settings"), onSelect: () => navigate("/settings") },
      SEPARATOR,
      {
        kind: "item",
        id: "quit",
        label: t("file.quit"),
        shortcut: "Alt+F4",
        disabled: !isTauri(),
        onSelect: () => void getCurrentWindow().close().catch(() => {}),
      },
    ],
    edit: [
      edit("undo", t("edit.undo"), "Ctrl+Z"),
      edit("redo", t("edit.redo"), "Ctrl+Y"),
      SEPARATOR,
      edit("cut", t("edit.cut"), "Ctrl+X"),
      edit("copy", t("edit.copy"), "Ctrl+C"),
      edit("paste", t("edit.paste"), "Ctrl+V"),
      SEPARATOR,
      edit("selectAll", t("edit.selectAll"), "Ctrl+A"),
      SEPARATOR,
      command("palette", t("edit.search"), "palette"),
      SEPARATOR,
      command("openHistory", t("edit.history")),
      command("openTrash", t("edit.trash")),
    ],
    view: [
      command("togglePanel", t("view.togglePanel")),
      command("toggleRail", t("view.toggleRail")),
      SEPARATOR,
      command("nextTab", t("view.nextTab"), "nextTab"),
      command("previousTab", t("view.previousTab"), "previousTab"),
      SEPARATOR,
      {
        kind: "item",
        id: "theme",
        label: theme === "dark" ? t("view.lightTheme") : t("view.darkTheme"),
        onSelect: () => applyTheme(theme === "dark" ? "light" : "dark"),
      },
    ],
    project: [
      command("openHome", t("project.home")),
      command("openSynopsis", t("project.synopsis")),
      command("openProjectSettings", t("project.settings")),
      SEPARATOR,
      command("openHistory", t("project.history")),
      command("openTrash", t("project.trash")),
      command("exportProject", t("project.export")),
    ],
    help: [
      { kind: "item", id: "center", label: t("help.center"), shortcut: keys("center"), onSelect: () => showHelp("center") },
      { kind: "item", id: "guide", label: t("help.guide"), onSelect: () => showHelp("guide") },
      {
        kind: "item",
        id: "shortcuts",
        label: t("help.shortcuts"),
        shortcut: keys("shortcuts"),
        onSelect: () => showHelp("shortcuts"),
      },
      SEPARATOR,
      { kind: "item", id: "about", label: t("help.about"), onSelect: () => showHelp("about") },
    ],
  };

  const order: MenuId[] = ["file", "edit", "view", "project", "help"];
  const entries = open ? menus[open] : [];
  const enabledIndexes = entries
    .map((entry, index) => (entry.kind === "item" && !entry.disabled ? index : -1))
    .filter((index) => index >= 0);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Alt seul ou F10 : le clavier va à la barre de menus.
  useEffect(() => {
    let altAlone = false;
    const onKeyDown = (event: KeyboardEvent) => {
      altAlone = event.key === "Alt" && !event.ctrlKey && !event.shiftKey && !event.metaKey;
      if (event.key === "F10" && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        buttonRefs.current.file?.focus();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt" && altAlone) {
        event.preventDefault();
        const bar = barRef.current;
        if (bar?.contains(document.activeElement)) {
          setOpen(null);
          (document.activeElement as HTMLElement).blur();
        } else {
          buttonRefs.current.file?.focus();
        }
      }
      altAlone = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Menu ouvert : les flèches, Entrée et Échap le pilotent, où que soit le
  // clavier (un menu ouvert à la souris laisse le clavier dans le champ).
  const keyHandler = useRef(onMenuKeyDown);
  keyHandler.current = onMenuKeyDown;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Escape", "Enter", " ", "Tab"].includes(event.key)) {
        // Entrée / Espace sur un bouton de la barre : laissés au bouton.
        if ((event.key === "Enter" || event.key === " ") && !barRef.current?.querySelector('[role="menu"]')?.contains(document.activeElement) && active < 0) return;
        event.stopPropagation();
        keyHandler.current(event);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, active]);

  // Une fenêtre s'ouvre (raccourci, guide…) : le menu se ferme.
  const helpOpen = useHelpStore((state) => state.open);
  useEffect(() => {
    if (helpOpen) setOpen(null);
  }, [helpOpen]);

  // Le choix actif prend le clavier quand le menu a été ouvert au clavier.
  useEffect(() => {
    if (open && openedByKeyboard.current && active >= 0) itemRefs.current[active]?.focus();
  }, [open, active]);

  function openMenu(id: MenuId, byKeyboard: boolean) {
    openedByKeyboard.current = byKeyboard;
    setOpen(id);
    const first = menus[id].findIndex((entry) => entry.kind === "item" && !entry.disabled);
    setActive(byKeyboard ? first : -1);
  }

  function close(returnFocus: boolean) {
    const current = open;
    setOpen(null);
    setActive(-1);
    if (returnFocus && current) buttonRefs.current[current]?.focus();
  }

  function select(entry: Entry) {
    if (entry.kind !== "item" || entry.disabled) return;
    close(false);
    // Le menu se ferme avant l'action (une fenêtre peut s'ouvrir ensuite).
    window.setTimeout(entry.onSelect, 0);
  }

  function moveMenu(delta: 1 | -1, byKeyboard: boolean) {
    const index = order.indexOf(open ?? "file");
    const next = order[(index + delta + order.length) % order.length];
    buttonRefs.current[next]?.focus();
    openMenu(next, byKeyboard);
  }

  function onButtonKeyDown(event: ReactKeyboardEvent, id: MenuId) {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu(id, true);
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const index = order.indexOf(id);
      const next = order[(index + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length];
      buttonRefs.current[next]?.focus();
      if (open) openMenu(next, true);
    } else if (event.key === "Escape") {
      close(false);
      (event.currentTarget as HTMLElement).blur();
    }
  }

  function onMenuKeyDown(event: Pick<KeyboardEvent, "key" | "preventDefault">) {
    const position = enabledIndexes.indexOf(active);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        openedByKeyboard.current = true;
        setActive(enabledIndexes[(position + 1) % enabledIndexes.length] ?? -1);
        break;
      case "ArrowUp":
        event.preventDefault();
        openedByKeyboard.current = true;
        setActive(enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length] ?? -1);
        break;
      case "Home":
        event.preventDefault();
        setActive(enabledIndexes[0] ?? -1);
        break;
      case "End":
        event.preventDefault();
        setActive(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveMenu(1, true);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveMenu(-1, true);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Enter":
      case " ": {
        const entry = entries[active];
        if (entry) {
          event.preventDefault();
          select(entry);
        }
        break;
      }
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={barRef} role="menubar" aria-label={t("label")} className="hidden items-center md:flex">
      {order.map((id) => (
        <div key={id} className="relative">
          <button
            ref={(element) => {
              buttonRefs.current[id] = element;
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === id}
            // Le champ en cours garde le clavier (menu Édition).
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (open === id ? close(false) : openMenu(id, false))}
            onMouseEnter={() => open && open !== id && openMenu(id, false)}
            onKeyDown={(event) => onButtonKeyDown(event, id)}
            className={cn(
              "h-7 rounded px-2.5 text-foreground/80 outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              open === id && "bg-secondary text-foreground",
            )}
          >
            {t(`menus.${id}`)}
          </button>

          {open === id && (
            <div
              role="menu"
              aria-label={t(`menus.${id}`)}
              className="absolute top-full left-0 z-[70] mt-1 min-w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
            >
              {entries.map((entry, index) =>
                entry.kind === "separator" ? (
                  <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-border" />
                ) : (
                  <button
                    key={entry.id}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    tabIndex={index === active ? 0 : -1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => !entry.disabled && setActive(index)}
                    onClick={() => select(entry)}
                    className={cn(
                      "flex h-8 w-full items-center gap-6 rounded px-2.5 text-left text-sm outline-none",
                      "disabled:cursor-default disabled:opacity-40",
                      index === active && !entry.disabled && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="flex-1 truncate">{entry.label}</span>
                    {entry.shortcut && (
                      <span className="shrink-0 text-xs text-muted-foreground">{entry.shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
