import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FolderOpen, Plus, Star } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/types";

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { projects, query, setQuery, openProject } = useProjectStore();

  // Le chargement depuis Rust (fetchProjects) sera branché à la Phase 4.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => !p.isArchived && p.name.toLowerCase().includes(q));
  }, [projects, query]);

  function open(id: string) {
    openProject(id);
    navigate(`/workspace/${id}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mes projets</h1>
            <p className="text-sm text-muted-foreground">Bonjour {user?.username}, reprenez où vous en étiez.</p>
          </div>
          <Button disabled title="Disponible à la Phase 4">
            <Plus className="h-4 w-4" /> Nouveau projet
          </Button>
        </div>

        <Input
          className="mt-6 max-w-sm"
          placeholder="Rechercher un projet"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un projet"
        />

        {visible.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10" />
            <p className="text-sm">
              {projects.length === 0
                ? "Aucun projet pour le moment. Créez-en un pour commencer votre histoire."
                : "Aucun projet ne correspond à cette recherche."}
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p.id)} className="w-full text-left">
                  <Card className="h-full transition-colors hover:border-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        {p.isFavorite && <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />}
                      </CardTitle>
                      <CardDescription>
                        {PROJECT_TYPE_LABELS[p.type]} · {PROJECT_STATUS_LABELS[p.status]}
                      </CardDescription>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                      <p className="pt-2 text-xs text-muted-foreground">
                        Modifié le {format(new Date(p.updatedAt), "d MMMM yyyy", { locale: fr })}
                      </p>
                    </CardHeader>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <StatusBar />
    </div>
  );
}
