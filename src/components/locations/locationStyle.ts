import {
  Anchor,
  Building,
  Building2,
  Castle,
  Church,
  Cloud,
  Crown,
  Droplets,
  Earth,
  Flag,
  Flame,
  Gem,
  Globe,
  House,
  Landmark,
  Library,
  Lock,
  Map,
  Mountain,
  MountainSnow,
  Orbit,
  Rocket,
  School,
  Shield,
  Skull,
  Sparkles,
  Store,
  Sun,
  Tent,
  TreePine,
  Trees,
  Ban,
  Waves,
  Ghost,
  Footprints,
  Warehouse,
  LandPlot,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { LocationCategory } from "@/lib/locations";

/*
 * Apparence des catégories et des types de lieux : une icône et une teinte
 * par catégorie (pastilles, vignettes sans image), une icône par type
 * quand il en existe une parlante (sinon celle de la catégorie).
 */

export const CATEGORY_ICONS: Record<LocationCategory, LucideIcon> = {
  settlement: Building2,
  political: Crown,
  region: Map,
  built: Castle,
  natural: Trees,
  special: Sparkles,
};

/** Teinte (oklch) de chaque catégorie. */
const CATEGORY_HUES: Record<LocationCategory, number> = {
  settlement: 85,
  political: 290,
  region: 210,
  built: 22,
  natural: 145,
  special: 340,
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  city: Building2,
  village: House,
  hamlet: Tent,
  borough: Store,
  metropolis: Building,
  cite: Landmark,
  capital: Landmark,
  port: Anchor,
  colony: Flag,
  kingdom: Crown,
  empire: Crown,
  country: Flag,
  principality: Shield,
  duchy: Shield,
  republic: Landmark,
  province: LandPlot,
  state: LandPlot,
  autonomousTerritory: Flag,
  region: Map,
  continent: Earth,
  island: Waves,
  archipelago: Waves,
  valley: Mountain,
  peninsula: Map,
  plain: Sun,
  mountainRange: MountainSnow,
  castle: Castle,
  fortress: Shield,
  palace: Crown,
  temple: Church,
  school: School,
  library: Library,
  prison: Lock,
  ruins: Warehouse,
  district: Building,
  market: Store,
  forest: TreePine,
  desert: Sun,
  mountain: Mountain,
  lake: Droplets,
  river: Waves,
  ocean: Waves,
  cave: Gem,
  volcano: Flame,
  swamp: Footprints,
  dungeon: Skull,
  parallelDimension: Orbit,
  celestialRealm: Cloud,
  realmOfTheDead: Ghost,
  spaceStation: Rocket,
  sacredPlace: Sparkles,
  forbiddenZone: Ban,
};

export function typeIcon(type: string, category: LocationCategory | undefined): LucideIcon {
  return TYPE_ICONS[type] ?? (category ? CATEGORY_ICONS[category] : Globe);
}

/** Couleurs d'une pastille de catégorie (fond léger, texte soutenu). */
export function categoryTint(category: LocationCategory | undefined): CSSProperties {
  if (!category) return {};

  const hue = CATEGORY_HUES[category];
  return {
    backgroundColor: `oklch(0.65 0.12 ${hue} / 0.16)`,
    color: `oklch(0.58 0.14 ${hue})`,
  };
}

/** Fond d'une vignette sans image (dégradé dans la teinte de la catégorie). */
export function categoryBackdrop(category: LocationCategory | undefined): CSSProperties {
  const hue = category ? CATEGORY_HUES[category] : 260;
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.62 0.12 ${hue}), oklch(0.42 0.1 ${hue + 25}))`,
  };
}
