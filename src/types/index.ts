// ============================================================================
// GANIS — Types partagés entre le frontend et le backend Rust.
// ============================================================================
// Ces types doivent rester synchronisés avec les structs Rust exposés
// via #[derive(Serialize)] dans src-tauri/src/models/.
// ============================================================================

// ----------------------------------------------------------------------------
// Utilisateurs & authentification
// ----------------------------------------------------------------------------

export type Role = "admin" | "developer" | "user";

/**
 * Utilisateur tel qu'exposé par le backend (correspond à `UserPublic` en Rust).
 * Le hash et le sel du mot de passe ne sont jamais transmis à l'interface.
 */
export interface User {
  id: string;
  username: string;
  email?: string | null;
  role: Role;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/**
 * Compte créé (inscription, configuration initiale).
 *
 * `recoveryKey` n'est transmise qu'à cet instant : elle n'est stockée nulle
 * part en clair et ne pourra plus jamais être relue. Elle vaut `null` tant
 * que les clés de récupération sont désactivées (`RECOVERY_KEY_ENABLED`).
 */
export interface AccountCreated {
  user: User;
  recoveryKey: string | null;
}

/**
 * Connexion réussie.
 *
 * `recoveryKey` n'est présente que si le compte vient d'être chiffré à
 * cette connexion (compte créé avant le chiffrement) : elle doit être
 * montrée une seule fois.
 */
export interface LoginResult {
  user: User;
  recoveryKey: string | null;
}

// ----------------------------------------------------------------------------
// Projets narratifs
// ----------------------------------------------------------------------------

export type ProjectType =
  | "manga"
  | "novel"
  | "film"
  | "series"
  | "game"
  | "rpg"
  | "custom";

export type ProjectStatus = "preparing" | "in_progress" | "paused" | "done";

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
  /** Dernière ouverture du projet ; `null` s'il n'a jamais été ouvert. */
  lastOpenedAt?: string | null; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Synopsis
// ----------------------------------------------------------------------------

/**
 * Synopsis d'un projet narratif.
 *
 * Un projet n'a qu'un seul synopsis, stocké dans la base de données
 * propre au projet. Il contient :
 *   - le contenu textuel du synopsis (éditeur riche, HTML) ;
 *   - les genres associés (ex. "Fantasy", "Aventure") ;
 *   - les sous-genres associés (ex. "Dark Fantasy") ;
 *   - les tons associés (ex. "Sombre", "Épique").
 */
export interface Synopsis {
  id: string;
  content: string;
  genres: string[];
  subgenres: string[];
  tone: string[];
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Découpage du récit
// ----------------------------------------------------------------------------

/**
 * Modèle de découpage : il donne un nom à chacun des trois niveaux
 * (ex. roman : Partie › Chapitre › Scène). Voir `lib/structure.ts`.
 */
export type StructureTemplateId =
  | "novel"
  | "manga"
  | "film"
  | "series"
  | "game"
  | "rpg"
  | "generic";

/** Élément du découpage (correspond à `StructureNode` en Rust). */
export interface StructureNode {
  id: string;
  /** `null` : élément à la racine. */
  parentId: string | null;
  /** Niveau : 0, 1 ou 2. Son nom dépend du modèle. */
  level: number;
  title: string;
  summary: string;
  /** Ordre parmi les éléments de même parent. */
  position: number;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/** Découpage complet d'un projet. */
export interface Structure {
  template: StructureTemplateId;
  /** Faux : le modèle suit le type du projet. */
  templateChosen: boolean;
  /** Tous les éléments, triés par parent puis par position. */
  nodes: StructureNode[];
}

// ----------------------------------------------------------------------------
// Personnages
// ----------------------------------------------------------------------------

/**
 * Niveau de détail des fiches de personnage, réglé pour tout le projet.
 * Les niveaux sont cumulatifs : chacun ajoute des champs au précédent
 * (voir `lib/characters.ts`).
 */
export type CharacterDetailLevel = "basic" | "intermediate" | "advanced";

/** Listes personnalisables d'un projet (valeurs de rôle, statut…). */
export type CharacterListKey = "gender" | "status" | "role" | "build";

/** Personnage (correspond à `Character` en Rust ; les images sont à part). */
export interface Character {
  id: string;
  firstName: string;
  lastName: string;
  /** Valeur de la liste « rôle » (code par défaut ou valeur personnalisée). */
  role: string;
  /** Valeur de la liste « statut ». */
  status: string;
  /** Champs remplis de la fiche, par clé (voir `characterFields.json`). */
  fields: Record<string, string>;
  /** Date de l'image principale ; `null` : pas d'image (initiales). */
  portraitUpdatedAt: string | null;
  /** Nombre d'images de la galerie de références. */
  galleryCount: number;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/** Contenu d'une fiche, envoyé pour créer ou modifier un personnage. */
export interface CharacterInput {
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  fields: Record<string, string>;
}

/** Réglages des personnages d'un projet. */
export interface CharacterSettings {
  /** Niveau de détail de toutes les fiches ; `null` : pas encore choisi. */
  detailLevel: CharacterDetailLevel | null;
  /** Listes personnalisées ; une liste absente : valeurs par défaut. */
  lists: Partial<Record<CharacterListKey, string[]>>;
}

/** Image de la galerie, sans son contenu. */
export interface GalleryImage {
  id: string;
  createdAt: string;
}

/** Image d'un personnage, encodée en base64. */
export interface CharacterPortrait {
  mime: string;
  data: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Lieux
// ----------------------------------------------------------------------------

/** Lieu (correspond à `Location` en Rust ; les images sont à part). */
export interface Location {
  id: string;
  name: string;
  /** Type par défaut (`city`, `forest`…) ou ajouté par l'auteur (`custom-…`). */
  type: string;
  /** Lieu qui contient celui-ci ; `null` : tout en haut. */
  parentId: string | null;
  /** Valeur de la liste « statut » (code par défaut ou valeur personnalisée). */
  status: string;
  /** Champs remplis de la fiche, par clé (voir `locationCatalog.json`). */
  fields: Record<string, string>;
  /** Date de l'image principale ; `null` : pas d'image. */
  portraitUpdatedAt: string | null;
  galleryCount: number;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/** Contenu d'une fiche, envoyé pour créer ou modifier un lieu. */
export interface LocationInput {
  name: string;
  type: string;
  parentId: string | null;
  status: string;
  fields: Record<string, string>;
}

/** Type de lieu ajouté par l'auteur. */
export interface CustomLocationType {
  id: string;
  name: string;
  category: string;
}

/** Réglages des lieux du projet. */
export interface LocationSettings {
  customTypes: CustomLocationType[];
  /** Listes personnalisées (absente : valeurs par défaut). */
  lists: Partial<Record<"status", string[]>>;
}

/** Lien entre un personnage et un lieu (visible sur les deux fiches). */
export interface CharacterLocation {
  id: string;
  characterId: string;
  locationId: string;
  /** Nature du lien : `born`, `lives`, `rules`… (voir `lib/placeLinks.ts`). */
  type: string;
  label: string;
  description: string;
  /** Élément du plan où le lien commence / finit (`null` : début / fin). */
  sinceNode: string | null;
  untilNode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterLocationInput {
  characterId: string;
  locationId: string;
  type: string;
  label: string;
  description: string;
  sinceNode: string | null;
  untilNode: string | null;
}

/** Image de la galerie d'un lieu, sans son contenu. */
export interface LocationImage {
  id: string;
  caption: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Relations entre personnages
// ----------------------------------------------------------------------------

/** Type de relation (couleur et nom dans `lib/relations.ts`). */
export type RelationType =
  | "family"
  | "love"
  | "friendship"
  | "alliance"
  | "professional"
  | "mentor"
  | "political"
  | "rivalry"
  | "enmity"
  | "betrayal"
  | "secret"
  | "other";

export type RelationSentiment = "positive" | "neutral" | "negative";

/** Relation entre deux personnages (correspond à `Relation` en Rust). */
export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  /** Nom libre (« Frère aîné »…), éventuellement vide. */
  label: string;
  description: string;
  /** Vrai : à sens unique (de `sourceId` vers `targetId`). */
  directed: boolean;
  /** 1 (faible) à 5 (très forte). */
  intensity: number;
  sentiment: RelationSentiment;
  /** Élément du découpage où la relation commence (`null` : dès le début). */
  sinceNode: string | null;
  /** Élément du découpage où elle finit (`null` : jusqu'à la fin). */
  untilNode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RelationInput = Omit<Relation, "id" | "createdAt" | "updatedAt">;

/** Position d'un personnage dans la disposition libre du graphe. */
export interface GraphPosition {
  characterId: string;
  x: number;
  y: number;
}

// ----------------------------------------------------------------------------
// Packages (§20) — pour l'instant, uniquement les thèmes
// ----------------------------------------------------------------------------

/** Type technique d'un package (correspond à `PackageType` en Rust). */
export type PackageType = "theme";

/**
 * Couleurs modifiables d'un thème, pour un mode (clair ou sombre).
 * Chaque valeur est une couleur `#RRGGBB` (vérifiée par Rust).
 * Les autres variables de l'interface en sont dérivées (`lib/colorTheme.ts`).
 */
export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  sidebar: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  success: string;
  warning: string;
}

/** Données d'un package de type `theme` (correspond à `ThemeData`). */
export interface ThemeData {
  light: ThemePalette;
  dark: ThemePalette;
  /** Arrondi des coins, en rem (0 à 1,5). */
  radius: number;
  /**
   * Couleurs des types de relation (`#RRGGBB`), les mêmes en mode clair et
   * sombre. Facultatives : un type absent garde sa couleur par défaut.
   */
  relations?: Partial<Record<RelationType, string>>;
}

/** Package créé par l'utilisateur connecté (correspond à `UserPackage`). */
export interface UserPackage {
  id: string;
  /** Identifiant public, de la forme `auteur.nom`. */
  packageId: string;
  type: PackageType;
  name: string;
  description: string;
  version: string;
  author: string;
  theme: ThemeData;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

// ----------------------------------------------------------------------------
// Informations sur l'application
// ----------------------------------------------------------------------------

export interface AppInfo {
  name: string;
  version: string;
  offline: boolean;
}

/**
 * Rapport de diagnostic (correspond à `Diagnostics` en Rust).
 * Réservé aux rôles administrateur et développeur.
 */
export interface Diagnostics {
  appVersion: string;
  os: string;
  arch: string;
  generatedAt: string; // RFC 3339, UTC
  database: {
    sqliteVersion: string;
    sizeBytes: number;
    /** "ok" si la base est saine, sinon le message de SQLite. */
    integrity: string;
    foreignKeyViolations: number;
    appliedMigrations: number;
  };
  counts: {
    users: number;
    admins: number;
    developers: number;
    activeSessions: number;
    projects: number;
  };
}

// ----------------------------------------------------------------------------
// Gestion des erreurs
// ----------------------------------------------------------------------------

/**
 * Codes d'erreur renvoyés par Rust (voir `error.rs`, enum `ErrorCode`).
 * Toute valeur hors de cette liste doit être traitée comme `INTERNAL`.
 */
export type ErrorCode =
  | "INTERNAL"
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DATABASE"
  | "IO";

/** Forme exacte de l'erreur renvoyée par Rust (voir `error.rs`). */
export interface ApiErrorPayload {
  code: ErrorCode;
  /** Message français, toujours présent (secours et journal). */
  message: string;
  /** Clé de traduction (`errors.json`), quand Rust en fournit une. */
  key?: string;
  /** Valeurs à insérer dans le message traduit. */
  params?: Record<string, string | number>;
}

// ----------------------------------------------------------------------------
// Libellés pour l'interface
// ----------------------------------------------------------------------------

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  manga: "Manga",
  novel: "Roman",
  film: "Film",
  series: "Série",
  game: "Jeu vidéo",
  rpg: "Jeu de rôle",
  custom: "Personnalisé",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "En préparation",
  in_progress: "En cours",
  paused: "En pause",
  done: "Terminé",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  developer: "Développeur",
  user: "Utilisateur",
};