import { Info, ListChecks, TriangleAlert, type LucideIcon } from "lucide-react";

/** Sections des paramètres d'un projet. */
export type ProjectSettingsId = "info" | "status" | "danger";

export interface ProjectSettingsSection {
  id: ProjectSettingsId;
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Liste affichée dans le panneau latéral de l'espace de travail.
 * Chaque entrée s'ouvre dans la zone centrale.
 */
export const PROJECT_SETTINGS_SECTIONS: ProjectSettingsSection[] = [
  {
    id: "info",
    label: "Informations",
    description: "Nom, description et type de création du projet.",
    icon: Info,
  },
  {
    id: "status",
    label: "Statut et organisation",
    description: "Avancement du projet, favori et archivage.",
    icon: ListChecks,
  },
  {
    id: "danger",
    label: "Duplication et suppression",
    description: "Dupliquer ou supprimer définitivement le projet.",
    icon: TriangleAlert,
  },
];