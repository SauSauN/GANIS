import {
  BookOpenText,
  Clapperboard,
  FileUp,
  Filter,
  FolderTree,
  GalleryThumbnails,
  Image,
  Layers,
  Link2,
  ListTree,
  MapPin,
  Megaphone,
  Network,
  NotebookText,
  Package,
  PawPrint,
  PenLine,
  Play,
  Power,
  Replace,
  Route,
  Settings2,
  StickyNote,
  Target,
  UserPlus,
  UserRound,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { create } from "zustand";
import i18n from "@/i18n";
import { useHelpStore } from "@/lib/shortcuts";

/*
 * Tutoriels de l'espace de travail : un par type de projet (le mode de
 * démarrage : par où commencer) et un par module.
 *
 * Textes : `tutorials.json` → `<id>.title`, `<id>.intro`, et pour chaque
 * étape `<id>.steps.<étape>` (`title`, `text`, `points`). Une étape peut
 * ouvrir une fonctionnalité de l'espace de travail (`open`).
 */

/**
 * Texte de `tutorials.json`, sans typage des clés (voir `i18next.d.ts`). Lu
 * au rendu, il suit la langue courante. `tutorials.test.ts` vérifie les clés.
 */
export function tutorialText<T = string>(key: string, options?: Record<string, unknown>): T {
  return (i18n as unknown as { t: (key: string, options?: Record<string, unknown>) => T }).t(`tutorials:${key}`, options);
}

export type TutorialId =
  | "novel"
  | "manga"
  | "story"
  | "characters"
  | "locations"
  | "items"
  | "species"
  | "structure"
  | "plot"
  | "notes";

export interface TutorialStep {
  id: string;
  icon: LucideIcon;
  /** Fonctionnalité proposée à cette étape (voir `modules.ts`). */
  open?: string;
}

export interface Tutorial {
  icon: LucideIcon;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<TutorialId, Tutorial> = {
  novel: {
    icon: BookOpenText,
    steps: [
      { id: "start", icon: PenLine, open: "synopsis.edit" },
      { id: "plan", icon: ListTree, open: "structure.plan" },
      { id: "write", icon: NotebookText },
      { id: "import", icon: FileUp, open: "manuscript.import" },
      { id: "manuscript", icon: BookOpenText, open: "manuscript.read" },
      { id: "progress", icon: Target, open: "manuscript.progress" },
      { id: "replace", icon: Replace, open: "manuscript.replace" },
      { id: "editorial", icon: Megaphone, open: "manuscript.editorial" },
    ],
  },
  manga: {
    icon: Clapperboard,
    steps: [
      { id: "start", icon: PenLine, open: "synopsis.edit" },
      { id: "plan", icon: ListTree, open: "structure.plan" },
      { id: "chapter", icon: Target },
      { id: "panels", icon: Layers },
      { id: "art", icon: Image },
      { id: "read", icon: BookOpenText, open: "script.read" },
      { id: "flatplan", icon: GalleryThumbnails, open: "script.flatplan" },
      { id: "progress", icon: Target, open: "script.progress" },
      { id: "continuity", icon: Route, open: "script.continuity" },
    ],
  },
  story: {
    icon: Play,
    steps: [
      { id: "start", icon: PenLine, open: "synopsis.edit" },
      { id: "cast", icon: Users, open: "characters.create" },
      { id: "world", icon: MapPin, open: "locations.create" },
      { id: "plan", icon: ListTree, open: "structure.plan" },
      { id: "plot", icon: Waypoints, open: "plot.board" },
      { id: "read", icon: Play, open: "structure.read" },
    ],
  },
  characters: {
    icon: Users,
    steps: [
      { id: "create", icon: UserPlus, open: "characters.create" },
      { id: "level", icon: Settings2, open: "settings:characters" },
      { id: "images", icon: Image },
      { id: "relations", icon: Network, open: "characters.relations" },
    ],
  },
  locations: {
    icon: MapPin,
    steps: [
      { id: "create", icon: MapPin, open: "locations.create" },
      { id: "nest", icon: FolderTree, open: "locations.list" },
      { id: "types", icon: Settings2, open: "settings:locations" },
      { id: "links", icon: Link2 },
    ],
  },
  items: {
    icon: Package,
    steps: [
      { id: "enable", icon: Power, open: "settings:items" },
      { id: "categories", icon: Filter, open: "settings:items" },
      { id: "create", icon: Package, open: "items.create" },
      { id: "nest", icon: FolderTree, open: "items.list" },
      { id: "links", icon: Link2 },
    ],
  },
  species: {
    icon: PawPrint,
    steps: [
      { id: "enable", icon: Power, open: "settings:species" },
      { id: "nature", icon: PawPrint, open: "species.create" },
      { id: "hierarchy", icon: FolderTree, open: "species.list" },
      { id: "character", icon: UserRound },
      { id: "links", icon: Link2 },
    ],
  },
  structure: {
    icon: ListTree,
    steps: [
      { id: "plan", icon: ListTree, open: "structure.plan" },
      { id: "sheet", icon: NotebookText },
      { id: "documents", icon: FileUp },
      { id: "settings", icon: Settings2, open: "settings:structure" },
    ],
  },
  plot: {
    icon: Waypoints,
    steps: [
      { id: "board", icon: Waypoints, open: "plot.board" },
      { id: "links", icon: Link2 },
      { id: "connect", icon: Network },
      { id: "reading", icon: BookOpenText, open: "plot.reading" },
    ],
  },
  notes: {
    icon: StickyNote,
    steps: [
      { id: "create", icon: NotebookText, open: "notes.create" },
      { id: "editor", icon: PenLine },
      { id: "organize", icon: FolderTree, open: "notes.list" },
      { id: "wall", icon: StickyNote, open: "notes.wall" },
    ],
  },
};

/** Le mode de démarrage d'un type de projet. */
export function tutorialForProject(projectType: string | null | undefined): TutorialId {
  if (projectType === "novel") return "novel";
  if (projectType === "manga") return "manga";
  return "story";
}

/** Tutoriel d'un module de la barre de gauche (`null` s'il n'en a pas). */
export function tutorialForModule(moduleId: string): TutorialId | null {
  switch (moduleId) {
    case "manuscript":
      return "novel";
    case "script":
      return "manga";
    case "characters":
    case "locations":
    case "items":
    case "species":
    case "structure":
    case "plot":
    case "notes":
      return moduleId;
    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Fenêtre du tutoriel
// ----------------------------------------------------------------------------

interface TutorialState {
  open: TutorialId | null;
  /** Étape affichée à l'ouverture. */
  step: number;
  /** Étape où reprendre : l'auteur est parti essayer une fonctionnalité. */
  resume: { id: TutorialId; step: number } | null;
  show: (id: TutorialId) => void;
  /** Ferme la fenêtre en gardant l'étape, pour reprendre au même endroit. */
  pause: (step: number) => void;
  close: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  open: null,
  step: 0,
  resume: null,
  show: (id) => {
    const { resume } = get();
    set({ open: id, step: resume?.id === id ? resume.step : 0, resume: null });
  },
  pause: (step) => {
    const { open } = get();
    if (open) set({ open: null, resume: { id: open, step } });
  },
  close: () => set({ open: null, resume: null }),
}));

const SEEN_PREFIX = "ganis-tutorial-seen-";

/**
 * Un tutoriel s'ouvre seul une fois sur cet appareil. Si une autre fenêtre
 * d'aide est ouverte, il attend une prochaine occasion (rien n'est mémorisé).
 */
export function showTutorialOnce(id: TutorialId) {
  if (useTutorialStore.getState().open || useHelpStore.getState().open) return;
  try {
    if (localStorage.getItem(SEEN_PREFIX + id)) return;
    localStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {
    return; // stockage indisponible : pas d'ouverture automatique
  }
  useTutorialStore.getState().show(id);
}
