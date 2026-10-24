import {
  Amphora,
  Apple,
  Axe,
  Backpack,
  Bike,
  Bird,
  Bomb,
  Book,
  BookMarked,
  Bot,
  Box,
  Bug,
  Bus,
  Camera,
  Car,
  Caravan,
  Coins,
  Cpu,
  Crosshair,
  Crown,
  CupSoda,
  Diamond,
  Drama,
  Fish,
  FlaskConical,
  FlaskRound,
  Flame,
  Flower2,
  Footprints,
  Gem,
  Ghost,
  GraduationCap,
  Guitar,
  HardHat,
  Image,
  Key,
  Lamp,
  Laptop,
  Leaf,
  Mail,
  Map,
  Package,
  PawPrint,
  Pill,
  Plane,
  Puzzle,
  Radio,
  Rabbit,
  Rocket,
  Sailboat,
  ScrollText,
  Shield,
  ShieldHalf,
  Ship,
  Shirt,
  Shrub,
  Skull,
  Smartphone,
  Snail,
  Sparkles,
  Sprout,
  Sword,
  Swords,
  Target,
  TrainFront,
  TreeDeciduous,
  Trophy,
  Turtle,
  Utensils,
  WandSparkles,
  Watch,
  Waves,
  Wheat,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { WorldModule } from "@/types";

/*
 * Apparence des objets, de la faune et de la flore : une icône et une
 * teinte par catégorie, une icône par type quand il en existe une
 * parlante (sinon celle de la catégorie). Même principe que les lieux.
 */

const CATEGORY_ICONS: Record<WorldModule, Record<string, LucideIcon>> = {
  item: {
    weapon: Swords,
    armor: Shield,
    clothing: Shirt,
    vehicle: Car,
    tech: Smartphone,
    magic: WandSparkles,
    document: ScrollText,
    tool: Wrench,
    treasure: Gem,
    consumable: FlaskConical,
  },
  species: {
    fauna: PawPrint,
    flora: Leaf,
  },
};

const CATEGORY_HUES: Record<WorldModule, Record<string, number>> = {
  item: {
    weapon: 25,
    armor: 240,
    clothing: 330,
    vehicle: 200,
    tech: 260,
    magic: 300,
    document: 70,
    tool: 50,
    treasure: 95,
    consumable: 160,
  },
  species: {
    fauna: 45,
    flora: 140,
  },
};

const TYPE_ICONS: Record<WorldModule, Record<string, LucideIcon>> = {
  item: {
    sword: Sword,
    dagger: Sword,
    axe: Axe,
    spear: Swords,
    bow: Target,
    crossbow: Crosshair,
    pistol: Crosshair,
    rifle: Crosshair,
    explosive: Bomb,
    armor: Shield,
    shield: ShieldHalf,
    helmet: HardHat,
    hat: GraduationCap,
    cloak: Shirt,
    outfit: Shirt,
    shoes: Footprints,
    jewel: Diamond,
    ring: Diamond,
    bag: Backpack,
    mask: Drama,
    car: Car,
    motorcycle: Bike,
    bicycle: Bike,
    cart: Caravan,
    carriage: Caravan,
    boat: Sailboat,
    ship: Ship,
    train: TrainFront,
    plane: Plane,
    airship: Bus,
    spaceship: Rocket,
    phone: Smartphone,
    computer: Laptop,
    watch: Watch,
    camera: Camera,
    radio: Radio,
    robot: Bot,
    gadget: Cpu,
    artifact: Sparkles,
    wand: WandSparkles,
    magicStaff: WandSparkles,
    grimoire: BookMarked,
    amulet: Gem,
    crystal: Diamond,
    potion: FlaskRound,
    relic: Amphora,
    letter: Mail,
    book: Book,
    map: Map,
    scroll: ScrollText,
    contract: ScrollText,
    diary: BookMarked,
    photo: Image,
    key: Key,
    tool: Wrench,
    container: Box,
    instrument: Guitar,
    lamp: Lamp,
    toy: Puzzle,
    coins: Coins,
    gem: Gem,
    crown: Crown,
    trophy: Trophy,
    food: Utensils,
    drink: CupSoda,
    medicine: Pill,
    poison: Skull,
    ingredient: Apple,
  },
  species: {
    mammal: Rabbit,
    bird: Bird,
    reptile: Turtle,
    amphibian: Snail,
    fish: Fish,
    insect: Bug,
    fantasticCreature: Ghost,
    dragon: Flame,
    tree: TreeDeciduous,
    shrub: Shrub,
    flower: Flower2,
    herb: Sprout,
    mushroom: Sprout,
    aquaticPlant: Waves,
    crop: Wheat,
    magicPlant: Sparkles,
  },
};

/** Icône du module (barre de gauche, paramètres). */
export const MODULE_ICONS: Record<WorldModule, LucideIcon> = { item: Package, species: PawPrint };

export function categoryIcon(module: WorldModule, category: string | undefined): LucideIcon {
  return (category && CATEGORY_ICONS[module][category]) || MODULE_ICONS[module];
}

export function typeIcon(module: WorldModule, type: string, category: string | undefined): LucideIcon {
  return TYPE_ICONS[module][type] ?? categoryIcon(module, category);
}

function hueOf(module: WorldModule, category: string | undefined): number | null {
  return category ? (CATEGORY_HUES[module][category] ?? null) : null;
}

/** Pastille de catégorie (fond léger, texte soutenu). */
export function categoryTint(module: WorldModule, category: string | undefined): CSSProperties {
  const hue = hueOf(module, category);
  if (hue === null) return {};
  return {
    backgroundColor: `oklch(0.65 0.12 ${hue} / 0.16)`,
    color: `oklch(0.58 0.14 ${hue})`,
  };
}

/** Fond d'une vignette sans image. */
export function categoryBackdrop(module: WorldModule, category: string | undefined): CSSProperties {
  const hue = hueOf(module, category) ?? 260;
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.62 0.12 ${hue}), oklch(0.42 0.1 ${hue + 25}))`,
  };
}
