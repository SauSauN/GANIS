import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CircleHelp, Keyboard, Loader2, Search, type LucideIcon } from "lucide-react";
import { SearchResults } from "@/components/search/SearchResults";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { SETTINGS_MODULE, WORKSPACE_MODULES } from "@/components/workspace/modules";
import { runCommand, useCommandStore, type CommandId } from "@/lib/commands";
import { openSearchHit, SEARCH_ORDER, useProjectSearch } from "@/lib/search";
import { formatCombo, shortcutOf, useHelpStore, type AppAction } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onOpenFeature: (featureId: string) => void;
}

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
}

const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Palette de commandes (Ctrl+K) : ouvrir une page du projet, lancer une
 * action, ou trouver un élément en tapant son nom.
 */
export function CommandPalette({ open, onClose, projectId, onOpenFeature }: CommandPaletteProps) {
  const { t } = useTranslation(["search", "menus", "modules"]);
  const showHelp = useHelpStore((state) => state.show);
  const owners = useCommandStore((state) => state.owners);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { hits, loading } = useProjectSearch(projectId, query);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const shift = t("menus:shift");
  const keys = (action: AppAction) => {
    const combo = shortcutOf(action);
    return combo ? formatCombo(combo, shift) : undefined;
  };

  const actions = useMemo<PaletteAction[]>(() => {
    const pages: PaletteAction[] = [...WORKSPACE_MODULES, SETTINGS_MODULE].flatMap((module) =>
      module.features.map((feature) => ({
        id: `page:${feature.id}`,
        label: feature.label,
        group: module.label,
        icon: feature.icon,
        run: () => onOpenFeature(feature.id),
      })),
    );

    // Commandes proposées par l'écran (grisées : absentes).
    const available = (id: CommandId) => Object.values(owners).some((handlers) => handlers[id] && !handlers[id]?.disabled);
    const label = (id: CommandId, fallback: string) =>
      Object.values(owners).map((handlers) => handlers[id]?.label).find(Boolean) ?? fallback;
    const commands: PaletteAction[] = (
      [
        ["new", t("menus:file.new")],
        ["save", t("menus:file.save")],
        ["saveAll", t("menus:file.saveAll")],
        ["closeTab", t("menus:file.closeTab")],
        ["exportProject", t("menus:file.export")],
      ] as Array<[CommandId, string]>
    )
      .filter(([id]) => available(id))
      .map(([id, fallback]) => ({
        id: `command:${id}`,
        label: label(id, fallback),
        group: t("palette.commands"),
        icon: Keyboard,
        shortcut: keys(id),
        run: () => runCommand(id),
      }));

    const help: PaletteAction[] = [
      { id: "help:center", label: t("menus:help.center"), group: t("menus:menus.help"), icon: BookOpen, shortcut: "F1", run: () => showHelp("center") },
      { id: "help:guide", label: t("menus:help.guide"), group: t("menus:menus.help"), icon: CircleHelp, run: () => showHelp("guide") },
      { id: "help:shortcuts", label: t("menus:help.shortcuts"), group: t("menus:menus.help"), icon: Keyboard, shortcut: keys("shortcuts"), run: () => showHelp("shortcuts") },
    ];

    return [...commands, ...pages, ...help];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owners, onOpenFeature, showHelp, t]);

  const q = fold(query.trim());
  const shownActions = q
    ? actions.filter((action) => fold(`${action.label} ${action.group}`).includes(q)).slice(0, 6)
    : actions.slice(0, 12);
  const orderedHits: SearchHit[] = SEARCH_ORDER.flatMap((kind) => hits.filter((hit) => hit.kind === kind));
  const total = shownActions.length + orderedHits.length;

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [active, total]);

  function run(index: number) {
    if (index < shownActions.length) {
      const action = shownActions[index];
      onClose();
      window.setTimeout(action.run, 0);
      return;
    }
    const hit = orderedHits[index - shownActions.length];
    if (!hit) return;
    onClose();
    openSearchHit(hit, onOpenFeature);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (total ? (value + 1) % total : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (total ? (value - 1 + total) % total : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-2xl p-0">
      <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
      <div className="flex items-center gap-2 border-b px-4">
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("palette.placeholder")}
          aria-label={t("palette.placeholder")}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          className="h-12 flex-1 bg-transparent text-sm outline-none"
        />
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">{t("search:escapeKey")}</kbd>
      </div>

      <div id="command-palette-list" ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
        {shownActions.length > 0 && (
          <section className="mb-3">
            <h3 className="px-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {q ? t("palette.actions") : t("palette.suggestions")}
            </h3>
            <ul>
              {shownActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      data-active={index === active || undefined}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(index)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        index === active && "bg-accent",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{action.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{action.group}</span>
                      {action.shortcut && (
                        <kbd className="shrink-0 rounded border bg-muted px-1 font-mono text-[0.65rem] text-muted-foreground">
                          {action.shortcut}
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {q && (
          <SearchResults
            hits={orderedHits}
            query={query}
            compact
            activeIndex={active - shownActions.length}
            onOpen={(hit) => run(shownActions.length + orderedHits.indexOf(hit))}
          />
        )}

        {q && !loading && total === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("none")}</p>}
      </div>
    </Dialog>
  );
}
