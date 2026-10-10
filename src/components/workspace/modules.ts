import {
  FileText,
  Info,
  List,
  ListTree,
  MapPin,
  Network,
  PenLine,
  Plus,
  Search,
  Settings,
  StickyNote,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PROJECT_SETTINGS_SECTIONS } from "@/components/project-settings/sections";
import i18n from "@/i18n";
import { characterIdOfTab, fullName } from "@/lib/characters";
import { useCharacterStore } from "@/stores/characterStore";

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
  | "notes"
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
  | "characters.create"
  | "characters.list"
  | "characters.relations"
  | "locations.create"
  | "locations.list"
  | "structure.plan"
  | "notes.create"
  | "notes.list";

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
  defineListModule("notes", StickyNote, [
    defineFeature("notes.create", Plus),
    defineFeature("notes.list", List),
  ]),
  defineModule("search", Search, []),
];

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

  for (const module of ALL_MODULES) {
    const feature = module.features.find((item) => item.id === featureId);

    if (feature) {
      return { module, feature };
    }
  }

  return undefined;
}