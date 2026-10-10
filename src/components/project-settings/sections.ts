import { Info, ListChecks, TriangleAlert, Users, type LucideIcon } from "lucide-react";

import i18n from "@/i18n";

/** Sections des paramètres d'un projet. */
export type ProjectSettingsId = "info" | "status" | "characters" | "danger";

export interface ProjectSettingsSection {
  id: ProjectSettingsId;
  /** Libellé dans la langue courante (lu à chaque rendu). */
  readonly label: string;
  /** Description dans la langue courante (lue à chaque rendu). */
  readonly description: string;
  icon: LucideIcon;
}

/**
 * Crée une section dont le libellé et la description sont traduits
 * au moment où on les lit (`projectSettings.json`, `sections.<id>`) :
 * ils suivent donc la langue choisie, même après un changement.
 */
function section(id: ProjectSettingsId, icon: LucideIcon): ProjectSettingsSection {
  return {
    id,
    icon,
    get label() {
      return i18n.t(`projectSettings:sections.${id}.label`);
    },
    get description() {
      return i18n.t(`projectSettings:sections.${id}.description`);
    },
  };
}

/**
 * Liste affichée dans le panneau latéral de l'espace de travail.
 * Chaque entrée s'ouvre dans la zone centrale.
 */
export const PROJECT_SETTINGS_SECTIONS: ProjectSettingsSection[] = [
  section("info", Info),
  section("status", ListChecks),
  section("characters", Users),
  section("danger", TriangleAlert),
];