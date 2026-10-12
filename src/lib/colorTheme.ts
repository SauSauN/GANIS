import { useSyncExternalStore } from "react";
import type { RelationType, ThemeData, ThemePalette } from "@/types";

/**
 * Thèmes de couleurs (packages de type `theme`, §20.2).
 *
 * À ne pas confondre avec le mode clair / sombre / système (`theme.ts`) :
 * un thème de couleurs fournit une palette pour chacun des deux modes, et
 * le mode choisit laquelle s'affiche.
 *
 * Deux origines, toutes deux utilisables directement, sans téléchargement :
 * - les thèmes système, intégrés à GANIS (ci-dessous) ;
 * - les thèmes créés par l'utilisateur (mode développeur), stockés par Rust.
 *
 * Le thème actif est une préférence de l'appareil, comme le mode. Ses
 * couleurs sont gardées en cache pour être appliquées dès le démarrage,
 * avant même la connexion, sans flash.
 */

// ----------------------------------------------------------------------------
// Couleurs modifiables
// ----------------------------------------------------------------------------

/** Couleurs modifiables, dans l'ordre de l'éditeur. */
export const PALETTE_KEYS = [
  "background",
  "foreground",
  "card",
  "sidebar",
  "primary",
  "primaryForeground",
  "secondary",
  "mutedForeground",
  "border",
  "destructive",
  "success",
  "warning",
] as const satisfies readonly (keyof ThemePalette)[];

export type PaletteKey = (typeof PALETTE_KEYS)[number];

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 1.5;
export const RADIUS_STEP = 0.125;

/** Vrai pour une couleur `#RRGGBB` (seul format accepté, comme côté Rust). */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isPalette(value: unknown): value is ThemePalette {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return PALETTE_KEYS.every((key) => isHexColor(record[key]));
}

/** Couleurs des relations d'un thème : absentes, ou des couleurs hexadécimales. */
function isRelationColors(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isHexColor);
}

/**
 * Vérifie des données de thème venues d'ailleurs (cache local).
 * Rien d'autre qu'une couleur hexadécimale n'atteint la feuille de style.
 */
export function isThemeData(value: unknown): value is ThemeData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isPalette(record.light) &&
    isPalette(record.dark) &&
    isRelationColors(record.relations) &&
    typeof record.radius === "number" &&
    Number.isFinite(record.radius) &&
    record.radius >= RADIUS_MIN &&
    record.radius <= RADIUS_MAX
  );
}

// ----------------------------------------------------------------------------
// Variables CSS
// ----------------------------------------------------------------------------

/**
 * Toutes les variables de l'interface (`index.css`) pour une palette.
 * Les variables non modifiables sont dérivées des couleurs de base.
 */
export function paletteToVars(palette: ThemePalette): Record<string, string> {
  const p = palette;

  return {
    "--background": p.background,
    "--foreground": p.foreground,
    "--card": p.card,
    "--card-foreground": p.foreground,
    "--popover": p.card,
    "--popover-foreground": p.foreground,
    "--primary": p.primary,
    "--primary-foreground": p.primaryForeground,
    "--secondary": p.secondary,
    "--secondary-foreground": p.foreground,
    "--muted": p.secondary,
    "--muted-foreground": p.mutedForeground,
    "--accent": p.secondary,
    "--accent-foreground": p.foreground,
    "--destructive": p.destructive,
    "--success": p.success,
    "--warning": p.warning,
    "--border": p.border,
    "--input": p.border,
    "--ring": p.primary,
    "--chart-1": p.primary,
    "--chart-2": `color-mix(in oklab, ${p.primary} 65%, ${p.background})`,
    "--chart-3": p.success,
    "--chart-4": p.warning,
    "--chart-5": p.destructive,
    "--sidebar": p.sidebar,
    "--sidebar-foreground": p.foreground,
    "--sidebar-primary": p.primary,
    "--sidebar-primary-foreground": p.primaryForeground,
    "--sidebar-accent": p.secondary,
    "--sidebar-accent-foreground": p.foreground,
    "--sidebar-border": p.border,
    "--sidebar-ring": p.primary,
  };
}

const declarations = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

/** Feuille de style complète d'un thème (modes clair et sombre). */
export function themeToCss(theme: ThemeData): string {
  return [
    `:root {\n${declarations(paletteToVars(theme.light))}\n  --radius: ${theme.radius}rem;\n}`,
    `.dark {\n${declarations(paletteToVars(theme.dark))}\n}`,
  ].join("\n\n");
}

// ----------------------------------------------------------------------------
// Thèmes système (intégrés, utilisables sans téléchargement)
// ----------------------------------------------------------------------------

export interface BuiltinTheme {
  /** Identifiant public (`ganis.*`). Nom et description dans `packages.json`. */
  id: string;
  theme: ThemeData;
}

/** Thème par défaut : les couleurs de `index.css`. */
export const DEFAULT_THEME_ID = "ganis.classique";

export const BUILTIN_THEMES: BuiltinTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    theme: {
      radius: 0.625,
      light: {
        background: "#FAFAFD",
        foreground: "#122056",
        card: "#FFFFFF",
        sidebar: "#FFFFFF",
        primary: "#5B65DC",
        primaryForeground: "#FFFFFF",
        secondary: "#EEEFFD",
        mutedForeground: "#5D6590",
        border: "#E0E2F4",
        destructive: "#F87171",
        success: "#34D399",
        warning: "#FBBF24",
      },
      dark: {
        background: "#0D1020",
        foreground: "#EEF0FF",
        card: "#151A30",
        sidebar: "#151A30",
        primary: "#7C85F2",
        primaryForeground: "#0D1020",
        secondary: "#242A4A",
        mutedForeground: "#9AA3D6",
        border: "#2A3157",
        destructive: "#DC2626",
        success: "#059669",
        warning: "#D97706",
      },
    },
  },
  {
    id: "ganis.parchemin",
    theme: {
      radius: 0.375,
      light: {
        background: "#FBF7EF",
        foreground: "#3B2A1A",
        card: "#FFFDF8",
        sidebar: "#F6EFE2",
        primary: "#A0522D",
        primaryForeground: "#FFFFFF",
        secondary: "#F1E7D6",
        mutedForeground: "#7A6650",
        border: "#E6D9C3",
        destructive: "#DC4B3E",
        success: "#4D8B57",
        warning: "#D4A017",
      },
      dark: {
        background: "#1C1611",
        foreground: "#F3E9DA",
        card: "#261E17",
        sidebar: "#211A14",
        primary: "#D98E5C",
        primaryForeground: "#1C1611",
        secondary: "#362B21",
        mutedForeground: "#B7A48C",
        border: "#3E3226",
        destructive: "#E5675A",
        success: "#6FAF79",
        warning: "#E0B44A",
      },
    },
  },
  {
    id: "ganis.foret",
    theme: {
      radius: 0.75,
      light: {
        background: "#F6FAF7",
        foreground: "#13321F",
        card: "#FFFFFF",
        sidebar: "#EEF5F0",
        primary: "#2F7D4F",
        primaryForeground: "#FFFFFF",
        secondary: "#E3F0E7",
        mutedForeground: "#587262",
        border: "#D3E4D8",
        destructive: "#E05252",
        success: "#2F9E66",
        warning: "#E3A21A",
      },
      dark: {
        background: "#0D1712",
        foreground: "#E6F2EA",
        card: "#13221A",
        sidebar: "#112019",
        primary: "#5CC08A",
        primaryForeground: "#0D1712",
        secondary: "#1E3328",
        mutedForeground: "#93B5A1",
        border: "#24402F",
        destructive: "#E26D6D",
        success: "#3FBF7F",
        warning: "#E2B341",
      },
    },
  },
  {
    id: "ganis.crepuscule",
    theme: {
      radius: 1,
      light: {
        background: "#FCF8FB",
        foreground: "#3A1838",
        card: "#FFFFFF",
        sidebar: "#F8EFF6",
        primary: "#B4407F",
        primaryForeground: "#FFFFFF",
        secondary: "#F5E6F1",
        mutedForeground: "#7D5874",
        border: "#EBD5E5",
        destructive: "#E0475A",
        success: "#2FA07A",
        warning: "#E09A2B",
      },
      dark: {
        background: "#170F19",
        foreground: "#F6E9F3",
        card: "#221625",
        sidebar: "#1D1320",
        primary: "#E07AB4",
        primaryForeground: "#170F19",
        secondary: "#34223A",
        mutedForeground: "#BC9BB5",
        border: "#3E2943",
        destructive: "#EA6B7A",
        success: "#4CC49A",
        warning: "#E8B04F",
      },
    },
  },
  {
    id: "ganis.contraste",
    theme: {
      radius: 0.25,
      light: {
        background: "#FFFFFF",
        foreground: "#000000",
        card: "#FFFFFF",
        sidebar: "#FFFFFF",
        primary: "#0037B3",
        primaryForeground: "#FFFFFF",
        secondary: "#E8E8E8",
        mutedForeground: "#333333",
        border: "#595959",
        destructive: "#B00020",
        success: "#006B3C",
        warning: "#8A5A00",
      },
      dark: {
        background: "#000000",
        foreground: "#FFFFFF",
        card: "#0A0A0A",
        sidebar: "#000000",
        primary: "#7DB3FF",
        primaryForeground: "#000000",
        secondary: "#1F1F1F",
        mutedForeground: "#D0D0D0",
        border: "#8A8A8A",
        destructive: "#FF6B6B",
        success: "#4ADE80",
        warning: "#FACC15",
      },
    },
  },
];

export function findBuiltinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id);
}

/** Copie indépendante d'un thème (point de départ de l'éditeur). */
export function cloneTheme(theme: ThemeData): ThemeData {
  return {
    radius: theme.radius,
    light: { ...theme.light },
    dark: { ...theme.dark },
  };
}

// ----------------------------------------------------------------------------
// Thème actif (préférence de l'appareil)
// ----------------------------------------------------------------------------

const KEY = "ganis-color-theme";
const EVENT = "ganis:color-theme-change";
const STYLE_ID = "ganis-color-theme";

interface StoredTheme {
  id: string;
  /** Couleurs en cache, pour les thèmes créés par l'utilisateur. */
  theme?: ThemeData;
}

function readStored(): StoredTheme | null {
  try {
    const raw = localStorage.getItem(KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const { id, theme } = parsed as Record<string, unknown>;

    if (typeof id !== "string") {
      return null;
    }

    return { id, theme: isThemeData(theme) ? theme : undefined };
  } catch {
    return null;
  }
}

/** Couleurs à afficher pour un choix enregistré (`null` : thème par défaut). */
function resolveStored(stored: StoredTheme | null): ThemeData | null {
  if (!stored || stored.id === DEFAULT_THEME_ID) {
    return null;
  }

  return findBuiltinTheme(stored.id)?.theme ?? stored.theme ?? null;
}

function paint(theme: ThemeData | null) {
  let style = document.getElementById(STYLE_ID);

  // Thème par défaut : les couleurs d'`index.css`, sans surcharge.
  if (!theme) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = themeToCss(theme);
}

/** Identifiant du thème actif (thème par défaut si aucun choix valide). */
export function getActiveColorThemeId(): string {
  const stored = readStored();

  return stored && resolveStored(stored) ? stored.id : DEFAULT_THEME_ID;
}

/**
 * Active un thème et l'enregistre sur cet appareil.
 *
 * `theme` est requis pour un thème créé par l'utilisateur (il est mis en
 * cache) ; il est ignoré pour un thème système.
 */
export function setActiveColorTheme(id: string, theme?: ThemeData) {
  const builtin = findBuiltinTheme(id);
  const data = builtin ? undefined : theme;

  if (!builtin && !isThemeData(data)) {
    return;
  }

  try {
    localStorage.setItem(KEY, JSON.stringify({ id, theme: data }));
  } catch {
    /* ignoré : le thème reste appliqué pour cette session */
  }

  paint(builtin ? (id === DEFAULT_THEME_ID ? null : builtin.theme) : data!);
  window.dispatchEvent(new Event(EVENT));
}

/** Revient au thème par défaut. */
export function resetColorTheme() {
  setActiveColorTheme(DEFAULT_THEME_ID);
}

/** Applique le thème enregistré au démarrage, avant le premier rendu. */
export function initColorTheme() {
  paint(resolveStored(readStored()));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);

  return () => window.removeEventListener(EVENT, onChange);
}

/** Identifiant du thème actif, mis à jour dès qu'il change. */
export function useActiveColorThemeId(): string {
  return useSyncExternalStore(subscribe, getActiveColorThemeId);
}

// ----------------------------------------------------------------------------
// Couleurs des relations (personnalisables par un thème)
// ----------------------------------------------------------------------------

type RelationColors = Partial<Record<RelationType, string>>;

const NO_RELATION_COLORS: RelationColors = {};
let relationCache: { key: string; colors: RelationColors } | null = null;

/**
 * Couleurs des relations définies par le thème actif (vide : couleurs par
 * défaut). Le même objet est renvoyé tant qu'elles ne changent pas.
 */
export function getThemeRelationColors(): RelationColors {
  const colors = resolveStored(readStored())?.relations ?? NO_RELATION_COLORS;
  const key = JSON.stringify(colors);

  if (relationCache?.key !== key) {
    relationCache = { key, colors };
  }

  return relationCache.colors;
}

/** Couleurs des relations du thème actif, mises à jour dès qu'il change. */
export function useThemeRelationColors(): RelationColors {
  return useSyncExternalStore(subscribe, getThemeRelationColors);
}

// ----------------------------------------------------------------------------
// Lisibilité (WCAG 2.x)
// ----------------------------------------------------------------------------

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Rapport de contraste entre deux couleurs `#RRGGBB` (1 à 21),
 * ou `null` si l'une d'elles n'est pas valide.
 */
export function contrastRatio(a: string, b: string): number | null {
  if (!isHexColor(a) || !isHexColor(b)) {
    return null;
  }

  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (light + 0.05) / (dark + 0.05);
}

/** Contraste minimal recommandé pour le texte courant (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;