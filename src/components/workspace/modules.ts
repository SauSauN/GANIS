import {
  BookOpen,
  BookOpenText,
  BookText,
  Columns3,
  FileText,
  History,
  Info,
  LayoutGrid,
  List,
  ListTree,
  Megaphone,
  MapPin,
  MapPinned,
  Network,
  NotebookText,
  PenLine,
  Plus,
  Search,
  Settings,
  StickyNote,
  Target,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  Waypoints,
  type LucideIcon,
  Replace,
  FileUp,
} from "lucide-react";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";
import i18n from "@/i18n";
import { characterIdOfTab, fullName } from "@/lib/characters";
import { locationIdOfTab } from "@/lib/locations";
import { noteIdOfTab } from "@/lib/notes";
import { nodeHeading, numberNodes, resolveLevels, structureNodeIdOfTab } from "@/lib/structure";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { useStructureStore } from "@/stores/structureStore";

/**
 * Registre des modules de l'espace de travail.
 *
 * Un module est un bouton de la barre de gauche. Ses fonctionnalités
 * s'affichent dans le panneau du milieu ; chacune s'ouvre dans un onglet
 * de la zone centrale. La barre de gauche, le panneau latéral et les
 * onglets lisent tous ce registre : ajouter une fonctionnalité se fait ici.
 *
 * Les textes sont dans `modules.json` (fr / en). Ils sont exposés par des
 * accesseurs (`get label()`…) : relus à chaque rendu, ils suivent la langue
 * choisie, même après un changement. Pour ajouter une fonctionnalité :
 * son identifiant dans `FeatureId`, ses textes dans les deux `modules.json`,
 * puis son entrée ci-dessous.
 */

export type ModuleId =
  | "details"
  | "characters"
  | "locations"
  | "structure"
  | "plot"
  | "notes"
  | "manuscript"
  | "search"
  | "settings";

export interface WorkspaceFeature {
  /** Identifiant unique, utilisé comme identifiant d'onglet. */
  id: string;
  readonly label: string;
  readonly description: string;
  icon: LucideIcon;
}

export interface WorkspaceModule {
  id: ModuleId;
  readonly label: string;
  icon: LucideIcon;
  features: WorkspaceFeature[];
  /** Message affiché dans la liste lorsqu'elle est vide. */
  readonly emptyMessage?: string;
}

/** Identifiant de l'onglet d'accueil du projet. */
export const HOME_TAB = "home";

/** Préfixe des onglets de paramètres du projet. */
export const SETTINGS_PREFIX = "settings:";

// ----------------------------------------------------------------------------
// Textes traduits
// ----------------------------------------------------------------------------

/** Fonctionnalités dont les textes sont dans `modules.json` (`features.*`). */
type FeatureId =
  | typeof HOME_TAB
  | "synopsis.edit"
  | "trash"
  | "history"
  | "characters.create"
  | "characters.list"
  | "characters.relations"
  | "locations.create"
  | "locations.list"
  | "structure.plan"
  | "plot.board"
  | "plot.reading"
  | "notes.create"
  | "notes.list"
  | "notes.wall"
  | "manuscript.read"
  | "manuscript.progress"
  | "manuscript.replace"
  | "manuscript.import"
  | "manuscript.editorial";

/** Modules qui ont une liste (et donc un message de liste vide). */
type ListModuleId = "characters" | "locations" | "notes";

/** Fonctionnalité dont le libellé et la description suivent la langue. */
function defineFeature(id: FeatureId, icon: LucideIcon): WorkspaceFeature {
  return {
    id,
    icon,
    get label() {
      return i18n.t(`modules:features.${id}.label`);
    },
    get description() {
      return i18n.t(`modules:features.${id}.description`);
    },
  };
}

/** Module dont le libellé suit la langue. */
function defineModule(
  id: Exclude<ModuleId, "settings">,
  icon: LucideIcon,
  features: WorkspaceFeature[],
): WorkspaceModule {
  return {
    id,
    icon,
    features,
    get label() {
      return i18n.t(`modules:modules.${id}.label`);
    },
  };
}

/** Module avec une liste : ajoute le message affiché quand elle est vide. */
function defineListModule(
  id: ListModuleId,
  icon: LucideIcon,
  features: WorkspaceFeature[],
): WorkspaceModule {
  return Object.defineProperty(defineModule(id, icon, features), "emptyMessage", {
    enumerable: true,
    get: () => i18n.t(`modules:modules.${id}.empty`),
  });
}

// ----------------------------------------------------------------------------
// Registre
// ----------------------------------------------------------------------------

/** Modules affichés en haut de la barre de gauche. */
export const WORKSPACE_MODULES: WorkspaceModule[] = [
  defineModule("details", FileText, [
    defineFeature(HOME_TAB, Info),
    defineFeature("synopsis.edit", PenLine),
    defineFeature("history", History),
    defineFeature("trash", Trash2),
  ]),
  defineListModule("characters", Users, [
    defineFeature("characters.create", UserPlus),
    defineFeature("characters.list", List),
    defineFeature("characters.relations", Network),
  ]),
  defineListModule("locations", MapPin, [
    defineFeature("locations.create", Plus),
    defineFeature("locations.list", List),
  ]),
  // Découpage du récit : ses niveaux (parties, chapitres, scènes ; actes,
  // séquences… ) dépendent du type de projet. Voir `lib/structure.ts`.
  defineModule("structure", ListTree, [
    defineFeature("structure.plan", ListTree),
  ]),
  // Trame : plateau vertical des intrigues parallèles, lecture de
  // l'histoire et analyse. Voir `lib/plot.ts`.
  defineModule("plot", Waypoints, [
    defineFeature("plot.board", Columns3),
    defineFeature("plot.reading", BookOpen),
  ]),
  defineListModule("notes", StickyNote, [
    defineFeature("notes.create", Plus),
    defineFeature("notes.list", List),
    defineFeature("notes.wall", LayoutGrid),
  ]),
  defineModule("search", Search, []),
];

/**
 * Manuscrit : outils du romancier (manuscrit continu, suivi de rédaction,
 * dossier éditorial). Proposé seulement aux projets de roman (voir
 * `modulesFor`) ; ses onglets restent reconnus partout pour que la
 * disposition des onglets reste cohérente.
 */
export const NOVEL_MODULE: WorkspaceModule = defineModule("manuscript", BookText, [
  defineFeature("manuscript.read", BookOpenText),
  defineFeature("manuscript.progress", Target),
  defineFeature("manuscript.replace", Replace),
  defineFeature("manuscript.import", FileUp),
  defineFeature("manuscript.editorial", Megaphone),
]);

/** Fonctionnalités réservées aux romans. */
export const NOVEL_FEATURES = new Set(NOVEL_MODULE.features.map((feature) => feature.id));

/**
 * Modules de la barre de gauche pour un type de projet : le module
 * Manuscrit s'ajoute, après la Trame, pour un roman.
 */
export function modulesFor(projectType: string | null | undefined): WorkspaceModule[] {
  if (projectType !== "novel") return WORKSPACE_MODULES;
  const index = WORKSPACE_MODULES.findIndex((module) => module.id === "plot");
  return [...WORKSPACE_MODULES.slice(0, index + 1), NOVEL_MODULE, ...WORKSPACE_MODULES.slice(index + 1)];
}

/** Paramètres du projet : module affiché en bas de la barre de gauche. */
export const SETTINGS_MODULE: WorkspaceModule = {
  id: "settings",
  icon: Settings,
  get label() {
    return i18n.t("modules:modules.settings.label");
  },
  // Accesseurs (get) : le libellé est relu à chaque rendu et suit la langue.
  features: PROJECT_SETTINGS_SECTIONS.map((section) => ({
    id: `${SETTINGS_PREFIX}${section.id}`,
    get label() {
      return section.label;
    },
    get description() {
      return section.description;
    },
    icon: section.icon,
  })),
};

const ALL_MODULES: WorkspaceModule[] = [
  ...WORKSPACE_MODULES,
  NOVEL_MODULE,
  SETTINGS_MODULE,
];

/** Retourne un module par son identifiant. */
export function getModule(id: ModuleId): WorkspaceModule {
  return ALL_MODULES.find((module) => module.id === id) ?? ALL_MODULES[0];
}

/**
 * Fiche d'un personnage (onglet `character:<id>`) : fonctionnalité du module
 * Personnages, dont le libellé est le nom du personnage.
 */
function characterFeature(tabId: string, characterId: string): WorkspaceFeature {
  return {
    id: tabId,
    icon: UserRound,
    get label() {
      const character = useCharacterStore
        .getState()
        .characters.find((item) => item.id === characterId);

      return (character && fullName(character)) || i18n.t("characters:tab.fallback");
    },
    get description() {
      return i18n.t("modules:features.characters.list.description");
    },
  };
}

/**
 * Fiche d'un lieu (onglet `location:<id>`) : fonctionnalité du module Lieux,
 * dont le libellé est le nom du lieu.
 */
function locationFeature(tabId: string, locationId: string): WorkspaceFeature {
  return {
    id: tabId,
    icon: MapPinned,
    get label() {
      const location = useLocationStore
        .getState()
        .locations.find((item) => item.id === locationId);

      return location?.name || i18n.t("locations:tab.fallback");
    },
    get description() {
      return i18n.t("modules:features.locations.list.description");
    },
  };
}

/**
 * Fiche d'un élément du découpage (onglet `structure-node:<id>`) :
 * fonctionnalité du module Découpage, dont le libellé est le nom de
 * l'élément (« Chapitre 3 — Le départ »).
 */
function structureNodeFeature(tabId: string, nodeId: string): WorkspaceFeature {
  return {
    id: tabId,
    icon: ListTree,
    get label() {
      const structure = useStructureStore.getState().structure;
      const node = structure?.nodes.find((item) => item.id === nodeId);

      if (!structure || !node) return i18n.t("structure:node.fallback");

      const levels = resolveLevels(structure, (template, index, form) =>
        index < 3
          ? i18n.t(`structure:templates.${template}.levels.${String(index) as "0" | "1" | "2"}.${form}`)
          : i18n.t("structure:levels.fallback", { number: index + 1 }),
      );

      return nodeHeading(node, levels, numberNodes(structure.nodes, levels, structure.autoNumbering)).label;
    },
    get description() {
      return i18n.t("modules:features.structure.plan.description");
    },
  };
}

/**
 * Note ouverte (onglet `note:<id>`) : fonctionnalité du module Notes, dont
 * le libellé est le titre de la note.
 */
function noteFeature(tabId: string, noteId: string): WorkspaceFeature {
  return {
    id: tabId,
    icon: NotebookText,
    get label() {
      const note = useNoteStore.getState().notes.find((item) => item.id === noteId);

      return note ? note.title || i18n.t("notes:untitled") : i18n.t("notes:tab.fallback");
    },
    get description() {
      return i18n.t("modules:features.notes.list.description");
    },
  };
}

/** Retrouve une fonctionnalité (et son module) par son identifiant. */
export function findFeature(
  featureId: string,
): { module: WorkspaceModule; feature: WorkspaceFeature } | undefined {
  const characterId = characterIdOfTab(featureId);

  if (characterId) {
    return {
      module: getModule("characters"),
      feature: characterFeature(featureId, characterId),
    };
  }

  const locationId = locationIdOfTab(featureId);

  if (locationId) {
    return {
      module: getModule("locations"),
      feature: locationFeature(featureId, locationId),
    };
  }

  const nodeId = structureNodeIdOfTab(featureId);

  if (nodeId) {
    return {
      module: getModule("structure"),
      feature: structureNodeFeature(featureId, nodeId),
    };
  }

  const noteId = noteIdOfTab(featureId);

  if (noteId) {
    return {
      module: getModule("notes"),
      feature: noteFeature(featureId, noteId),
    };
  }

  for (const module of ALL_MODULES) {
    const feature = module.features.find((item) => item.id === featureId);

    if (feature) {
      return { module, feature };
    }
  }

  return undefined;
}