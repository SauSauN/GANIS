import { Files, Search, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityId = "explorer" | "search" | "settings";

const TOP: { id: ActivityId; label: string; icon: LucideIcon }[] = [
  { id: "explorer", label: "Explorateur", icon: Files },
  { id: "search", label: "Recherche", icon: Search },
];

interface Props {
  active: ActivityId;
  panelOpen: boolean;
  onSelect: (id: ActivityId) => void;
}

export function ActivityBar({ active, panelOpen, onSelect }: Props) {
  const item = (id: ActivityId, label: string, Icon: LucideIcon) => {
    const selected = panelOpen && active === id;
    return (
      <button
        key={id}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={selected}
        onClick={() => onSelect(id)}
        className={cn(
          "flex h-11 w-full items-center justify-center border-l-2 transition-colors",
          selected
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </button>
    );
  };

  return (
    <aside className="flex w-12 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar">
      <div>{TOP.map((t) => item(t.id, t.label, t.icon))}</div>
      <div>{item("settings", "Paramètres du projet", Settings)}</div>
    </aside>
  );
}