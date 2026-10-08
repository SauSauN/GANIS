import {
  BookOpen,
  Clapperboard,
  FileText,
  Info,
  List,
  MapPin,
  Network,
  PenLine,
  Plus,
  Search,
  Settings,
  StickyNote,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";

/**
 * Registre des modules de l'espace de travail.
 *
 * Un module est un bouton de la barre de gauche. Ses fonctionnalités
 * s'affichent dans le panneau du milieu ; chacune s'ouvre dans un onglet
 * de la zone centrale. La barre de gauche, le panneau latéral et les
 * onglets lisent tous ce registre : ajouter une fonctionnalité se fait ici.
 */

export type ModuleId =
  | "details"
  | "characters"
  | "locations"
  | "chapters"
  | "scenes"
  | "notes"
  | "search"
  | "settings";

export interface WorkspaceFeature {
  /** Identifiant unique, utilisé comme identifiant d'onglet. */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface WorkspaceModule {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  features: WorkspaceFeature[];
  /** Message affiché dans la liste lorsqu'elle est vide. */
  emptyMessage?: string;
}

/** Identifiant de l'onglet d'accueil du projet. */
export const HOME_TAB = "home";

/** Préfixe des onglets de paramètres du projet. */
export const SETTINGS_PREFIX = "settings:";

/** Modules affichés en haut de la barre de gauche. */
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: "details",
    label: "Détails",
    icon: FileText,
    features: [
      {
        id: HOME_TAB,
        label: "Accueil du projet",
        description:
          "Résumé, genres, ton et informations générales de votre histoire.",
        icon: Info,
      },
      {
        id: "synopsis.edit",
        label: "Synopsis du projet",
        description:
          "Résumé, genres, ton et informations générales de votre histoire.",
        icon: PenLine,
      },
    ],
  },
  {
    id: "characters",
    label: "Personnages",
    icon: Users,
    emptyMessage: "Aucun personnage pour l'instant.",
    features: [
      {
        id: "characters.create",
        label: "Créer un personnage",
        description: "Identité, description, parcours et motivations.",
        icon: UserPlus,
      },
      {
        id: "characters.list",
        label: "Liste des personnages",
        description: "Tous les personnages du projet.",
        icon: List,
      },
      {
        id: "characters.relations",
        label: "Relations entre personnages",
        description: "Liens familiaux, amicaux, rivalités et alliances.",
        icon: Network,
      },
    ],
  },
  {
    id: "locations",
    label: "Lieux",
    icon: MapPin,
    emptyMessage: "Aucun lieu pour l'instant.",
    features: [
      {
        id: "locations.create",
        label: "Créer un lieu",
        description: "Description, histoire et caractéristiques du lieu.",
        icon: Plus,
      },
      {
        id: "locations.list",
        label: "Liste des lieux",
        description: "Tous les lieux de votre univers.",
        icon: List,
      },
    ],
  },
  {
    id: "chapters",
    label: "Chapitres",
    icon: BookOpen,
    emptyMessage: "Aucun chapitre pour l'instant.",
    features: [
      {
        id: "chapters.create",
        label: "Créer un chapitre",
        description: "Titre, synopsis et place dans le récit.",
        icon: Plus,
      },
      {
        id: "chapters.list",
        label: "Plan des chapitres",
        description: "Les chapitres dans l'ordre du récit.",
        icon: List,
      },
    ],
  },
  {
    id: "scenes",
    label: "Scènes",
    icon: Clapperboard,
    emptyMessage: "Aucune scène pour l'instant.",
    features: [
      {
        id: "scenes.create",
        label: "Créer une scène",
        description: "Chapitre, lieu, personnages et contenu de la scène.",
        icon: Plus,
      },
      {
        id: "scenes.list",
        label: "Liste des scènes",
        description: "Toutes les scènes du projet.",
        icon: List,
      },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    icon: StickyNote,
    emptyMessage: "Aucune note pour l'instant.",
    features: [
      {
        id: "notes.create",
        label: "Créer une note",
        description: "Idées, références et documentation libre.",
        icon: Plus,
      },
      {
        id: "notes.list",
        label: "Liste des notes",
        description: "Toutes vos notes de projet.",
        icon: List,
      },
    ],
  },
  {
    id: "search",
    label: "Recherche",
    icon: Search,
    features: [],
  },
];

/** Paramètres du projet : module affiché en bas de la barre de gauche. */
export const SETTINGS_MODULE: WorkspaceModule = {
  id: "settings",
  label: "Paramètres du projet",
  icon: Settings,
  features: PROJECT_SETTINGS_SECTIONS.map((section) => ({
    id: `${SETTINGS_PREFIX}${section.id}`,
    label: section.label,
    description: section.description,
    icon: section.icon,
  })),
};

const ALL_MODULES: WorkspaceModule[] = [
  ...WORKSPACE_MODULES,
  SETTINGS_MODULE,
];

/** Retourne un module par son identifiant. */
export function getModule(id: ModuleId): WorkspaceModule {
  return ALL_MODULES.find((module) => module.id === id) ?? ALL_MODULES[0];
}

/** Retrouve une fonctionnalité (et son module) par son identifiant. */
export function findFeature(
  featureId: string,
): { module: WorkspaceModule; feature: WorkspaceFeature } | undefined {
  for (const module of ALL_MODULES) {
    const feature = module.features.find((item) => item.id === featureId);

    if (feature) {
      return { module, feature };
    }
  }

  return undefined;
}