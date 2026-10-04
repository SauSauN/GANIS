import { BookOpen, ChevronRight, Clapperboard, FileText, MapPin, StickyNote, Users, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ActivityId } from "@/components/layout/ActivityBar";

const SECTIONS: { label: string; icon: LucideIcon }[] = [
  { label: "Synopsis", icon: FileText },
  { label: "Personnages", icon: Users },
  { label: "Lieux", icon: MapPin },
  { label: "Chapitres", icon: BookOpen },
  { label: "Scènes", icon: Clapperboard },
  { label: "Notes", icon: StickyNote },
];

export function SideBar({ view, projectName }: { view: ActivityId; projectName: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {view === "explorer" && (
        <>
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Explorateur</p>
            <p className="truncate text-sm font-semibold">{projectName}</p>
          </div>
          <ul className="px-2">
            {SECTIONS.map(({ label, icon: Icon }) => (
              <li key={label}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-left">{label}</span>
                  <span className="text-xs text-muted-foreground">0</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === "search" && (
        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">Recherche</p>
          <Input disabled placeholder="Rechercher dans le projet" />
          <p className="text-xs text-muted-foreground">La recherche sera disponible avec le contenu du projet.</p>
        </div>
      )}

      {view === "settings" && (
        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">Paramètres</p>
          <p className="text-sm text-muted-foreground">Les préférences seront disponibles prochainement.</p>
        </div>
      )}
    </aside>
  );
}
