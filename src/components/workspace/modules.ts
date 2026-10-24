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
  Package,
  PawPrint,
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
  Clapperboard,
  Route,
  Play,
} from "lucide-react";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";
import i18n from "@/i18n";
import { characterIdOfTab, fullName } from "@/lib/characters";
import { locationIdOfTab } from "@/lib/locations";
import { worldEntryOfTab } from "@/lib/world";
import { noteIdOfTab } from "@/lib/notes";
import { nodeHeading, numberNodes, resolveLevels, structureNodeIdOfTab } from "@/lib/structure";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { useStructureStore } from "@/stores/structureStore";
import { useWorldStore } from "@/stores/worldStore";
import type { WorldModule } from "@/types";

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
  | "items"
  | "species"
  | "structure"
  | "plot"
  | "notes"
  | "manuscript"
  | "script"
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
  | "items.create"
  | "items.list"
  | "species.create"
  | "species.list"
  | "structure.plan"
  | "structure.read"
  | "plot.board"
  | "plot.reading"
  | "notes.create"
  | "notes.list"
  | "notes.wall"
  | "manuscript.read"
  | "manuscript.progress"
  | "manuscript.replace"
  | "manuscript.import"
  | "manuscript.editorial"
  | "script.read"
  | "script.progress"
  | "script.continuity";

/** Modules qui ont une liste (et donc un message de liste vide). */
type ListModuleId = "characters" | "locations" | "items" | "species" | "notes";

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
  // « Lecture complète » : l'histoire compilée dans l'ordre du découpage
  // (bouton ▶ de la barre de titre). Le roman et le manga ont la leur
  // (manuscrit, scénario) : elle ne leur est pas proposée, voir
  // `featureAvailable`.
  defineModule("structure", ListTree, [
    defineFeature("structure.plan", ListTree),
    defineFeature("structure.read", Play),
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
 * Scénario : outils du manga / de la BD (lecture et export du scénario,
 * suivi, continuité). Proposé seulement aux projets de manga.
 */
export const MANGA_MODULE: WorkspaceModule = defineModule("script", Clapperboard, [
  defineFeature("script.read", BookOpenText),
  defineFeature("script.progress", Target),
  defineFeature("script.continuity", Route),
]);

/** Fonctionnalités réservées aux mangas / BD. */
export const MANGA_FEATURES = new Set(MANGA_MODULE.features.map((feature) => feature.id));

/**
 * Objets, faune et flore : modules facultatifs, masqués tant que l'auteur ne
 * les a pas activés dans Paramètres du projet (voir `modulesFor`). Leurs
 * onglets restent reconnus partout ; ouverts alors que le module est
 * désactivé, ils le disent (rien n'est supprimé).
 */
export const ITEMS_MODULE: WorkspaceModule = defineListModule("items", Package, [
  defineFeature("items.create", Plus),
  defineFeature("items.list", List),
]);

export const SPECIES_MODULE: WorkspaceModule = defineListModule("species", PawPrint, [
  defineFeature("species.create", Plus),
  defineFeature("species.list", List),
]);

/** Module de la barre de gauche de chaque module du monde. */
export const WORLD_WORKSPACE_MODULES: Record<WorldModule, WorkspaceModule> = {
  item: ITEMS_MODULE,
  species: SPECIES_MODULE,
};

/** Modules facultatifs activés pour le projet. */
export type EnabledWorldModules = Partial<Record<WorldModule, boolean>>;

/**
 * Modules de la barre de gauche pour un type de projet : après la Trame,
 * le module Manuscrit s'ajoute pour un roman, le module Scénario pour un
 * manga ou une BD.
 */
export function modulesFor(
  projectType: string | null | undefined,
  world: EnabledWorldModules = {},
): WorkspaceModule[] {
  // Objets puis Faune et flore, juste après les Lieux, s'ils sont activés.
  const worldModules = (["item", "species"] as const)
    .filter((module) => world[module])
    .map((module) => WORLD_WORKSPACE_MODULES[module]);
  const after = WORKSPACE_MODULES.findIndex((module) => module.id === "locations");
  const base = [...WORKSPACE_MODULES.slice(0, after + 1), ...worldModules, ...WORKSPACE_MODULES.slice(after + 1)];

  const extra = projectType === "novel" ? NOVEL_MODULE : projectType === "manga" ? MANGA_MODULE : null;
  if (!extra) return base;
  const index = base.findIndex((module) => module.id === "plot");
  return [...base.slice(0, index + 1), extra, ...base.slice(index + 1)];
}

/** Lecture complète des types sans module dédié (film, série, jeu vidéo…). */
export const STORY_READ_FEATURE = "structure.read";

/**
 * La fonctionnalité est-elle proposée à ce type de projet ? Les outils du
 * roman et du manga leur sont réservés ; la lecture complète générique ne
 * l'est pas à eux (ils lisent leur histoire dans le Manuscrit / Scénario).
 */
export function featureAvailable(featureId: string, projectType: string | null | undefined): boolean {
  if (NOVEL_FEATURES.has(featureId)) return projectType === "novel";
  if (MANGA_FEATURES.has(featureId)) return projectType === "manga";
  if (featureId === STORY_READ_FEATURE) return projectType !== "novel" && projectType !== "manga";
  return true;
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
  ITEMS_MODULE,
  SPECIES_MODULE,
  NOVEL_MODULE,
  MANGA_MODULE,
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
 * Fiche d'un objet ou d'une espèce (onglet `item:<id>`, `species:<id>`) :
 * fonctionnalité du module, dont le libellé est le nom de la fiche.
 */
function worldFeature(tabId: string, module: WorldModule, entryId: string): WorkspaceFeature {
  return {
    id: tabId,
    icon: module === "item" ? Package : PawPrint,
    get label() {
      const entry = useWorldStore.getState()[module].entries.find((item) => item.id === entryId);
      return entry?.name || i18n.t("world:tab.fallback");
    },
    get description() {
      return i18n.t(`modules:features.${module === "item" ? "items" : "species"}.list.description`);
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

  const worldEntry = worldEntryOfTab(featureId);

  if (worldEntry) {
    return {
      module: WORLD_WORKSPACE_MODULES[worldEntry.module],
      feature: worldFeature(featureId, worldEntry.module, worldEntry.id),
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
