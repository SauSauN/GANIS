import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { ActivityBar, type ActivityId } from "@/components/layout/ActivityBar";
import { SideBar } from "@/components/layout/SideBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { useProjectStore } from "@/stores/projectStore";

export default function Workspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const [view, setView] = useState<ActivityId>("explorer");
  const [panelOpen, setPanelOpen] = useState(true);

  if (!project) return <Navigate to="/dashboard" replace />;

  // Cliquer sur l'icône déjà active masque le panneau latéral (comme VS Code)
  function select(id: ActivityId) {
    if (id === view && panelOpen) setPanelOpen(false);
    else {
      setView(id);
      setPanelOpen(true);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <ActivityBar active={view} panelOpen={panelOpen} onSelect={select} />
        {panelOpen && <SideBar view={view} projectName={project.name} />}

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Barre d'onglets (un seul onglet factice pour l'instant) */}
          <div className="flex h-9 shrink-0 items-end border-b border-border bg-card">
            <div className="flex items-center gap-2 border-t-2 border-primary bg-background px-4 py-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Accueil du projet
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-8 text-center">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Choisissez un élément dans l'explorateur pour l'ouvrir. L'éditeur et les fiches arrivent
              dans les prochaines phases.
            </p>
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
