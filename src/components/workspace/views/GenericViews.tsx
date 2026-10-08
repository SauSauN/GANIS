import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ViewShell } from "@/components/workspace/views/ViewShell";
import type {
  WorkspaceFeature,
  WorkspaceModule,
} from "@/components/workspace/modules";

interface EmptyListViewProps {
  module: WorkspaceModule;
  feature: WorkspaceFeature;
  /** Fonctionnalité de création du même module, proposée en raccourci. */
  createFeature?: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Liste d'un module. Pour l'instant sans contenu : elle propose
 * de créer le premier élément.
 */
export function EmptyListView({
  module,
  feature,
  createFeature,
  onOpenFeature,
}: EmptyListViewProps) {
  return (
    <ViewShell title={feature.label} description={feature.description}>
      <Card>
        <CardHeader>
          <CardTitle>
            {module.emptyMessage ?? "Aucun élément pour l'instant."}
          </CardTitle>
          <CardDescription>
            Les éléments créés apparaîtront ici.
          </CardDescription>
        </CardHeader>

        {createFeature && (
          <CardContent>
            <Button onClick={() => onOpenFeature(createFeature.id)}>
              <Plus className="mr-2 h-4 w-4" />
              {createFeature.label}
            </Button>
          </CardContent>
        )}
      </Card>
    </ViewShell>
  );
}

/** Vue d'une fonctionnalité dont l'interface n'est pas encore disponible. */
export function ComingSoonView({ feature }: { feature: WorkspaceFeature }) {
  return (
    <ViewShell title={feature.label} description={feature.description}>
      <Card>
        <CardHeader>
          <CardTitle>Bientôt disponible</CardTitle>
          <CardDescription>
            Cette fonctionnalité sera ajoutée dans une prochaine étape.
          </CardDescription>
        </CardHeader>
      </Card>
    </ViewShell>
  );
}