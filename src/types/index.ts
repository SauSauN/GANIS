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
// Format .ganix (export / import d'un projet)
// ----------------------------------------------------------------------------

/** Contenu d'un `.ganix`, compté à la vérification. */
export interface GanixCounts {
  characters: number;
  locations: number;
  structureNodes: number;
  relations: number;
  placeLinks: number;
}

/** Aperçu d'un `.ganix` vérifié, en attente de confirmation. */
export interface GanixPreview {
  stagingId: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  exportedAt: string; // RFC 3339, UTC
  createdWith: string;
  counts: GanixCounts;
  sizeBytes: number;
  /** L'utilisateur a déjà ce projet : copie ou remplacement. */
  alreadyOwned: boolean;
}

/** Choix quand l'utilisateur a déjà le projet du fichier. */
export type GanixImportMode = "copy" | "replace";

export interface GanixImportOutcome {
  project: Project;
  /** Remplacement : nom du fichier de sauvegarde de l'ancienne version. */
  backupFile: string | null;
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
 * Modèle de découpage : il donne un nom et une numérotation à chacun des
 * trois niveaux (ex. roman : Partie › Chapitre › Scène). Voir
 * `lib/structure.ts`.
 */
export type StructureTemplateId =
  | "novel"
  | "manga"
  | "film"
  | "series"
  | "game"
  | "rpg"
  | "generic";

/**
 * Numérotation d'un niveau : continue dans tout le projet, qui repart dans
 * chaque élément parent, ou aucune.
 */
export type StructureNumbering = "continuous" | "perParent" | "none";

/** Niveau du découpage (correspond à `StructureLevel` en Rust). */
export interface StructureLevel {
  /** Identifiant stable (suit le niveau quand on en insère ou retire un). */
  id: string;
  /** Nom au singulier ; `null` : nom du modèle, traduit. */
  one: string | null;
  /** Nom au pluriel ; `null` : nom du modèle, traduit. */
  other: string | null;
  numbering: StructureNumbering;
  /** Premier numéro (souvent 1). */
  start: number;
  /** Nombre minimal de chiffres (2 → « 01 »). */
  digits: number;
  /** Couleur « #rrggbb » ; `null` : couleur par défaut selon la place du niveau. */
  color: string | null;
}

/** Niveau envoyé pour personnaliser le découpage (`id` absent : nouveau). */
export interface StructureLevelInput {
  id?: string;
  one: string;
  other: string;
  numbering: StructureNumbering;
  start: number;
  digits: number;
  color?: string | null;
}

/** Élément du découpage (correspond à `StructureNode` en Rust). */
export interface StructureNode {
  id: string;
  /** `null` : élément à la racine. */
  parentId: string | null;
  /** Niveau (0 = le plus large). */
  level: number;
  /** Titre facultatif : « Chapitre 3 — <titre> ». */
  title: string;
  summary: string;
  /** Ordre parmi les éléments de même parent. */
  position: number;
  /** Faux : élément hors numérotation (prologue, interlude…). */
  numbered: boolean;
  /**
   * Numéro enregistré (numérotation non automatique). Ignoré quand la
   * numérotation est automatique : le numéro est alors calculé.
   */
  number: number | null;
  createdAt: string; // RFC 3339, UTC
  updatedAt: string; // RFC 3339, UTC
}

/** Rôle d'un personnage dans un élément du découpage. */
export type NodeCharacterRole = "present" | "pov" | "mentioned";

/** Rôle d'un lieu dans un élément du découpage. */
export type NodeLocationRole = "setting" | "mentioned";

/** Personnage lié à un élément du découpage. */
export interface NodeCharacterLink {
  nodeId: string;
  characterId: string;
  role: NodeCharacterRole;
  createdAt: string; // RFC 3339, UTC
}

/** Lieu lié à un élément du découpage. */
export interface NodeLocationLink {
  nodeId: string;
  locationId: string;
  role: NodeLocationRole;
  createdAt: string; // RFC 3339, UTC
}

/** Personnages et lieux liés aux éléments du découpage. */
export interface StructureLinks {
  characters: NodeCharacterLink[];
  locations: NodeLocationLink[];
}

/** Découpage complet d'un projet. */
export interface Structure {
  template: StructureTemplateId;
  /** Faux : le modèle suit le type du projet. */
  templateChosen: boolean;
  /** Niveaux, du plus large au plus fin (1 à 5). */
  levels: StructureLevel[];
  /** Vrai si les niveaux ont été personnalisés. */
  levelsCustom: boolean;
  /**
   * Vrai : les numéros suivent l'ordre du plan (ils changent à chaque ajout,
   * déplacement ou suppression). Faux (par défaut) : chaque élément garde
   * son numéro ; « Renuméroter » les remet dans l'ordre.
   */
  autoNumbering: boolean;
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
// Notes (voir `note_service.rs`)
// ----------------------------------------------------------------------------

/** Dossier de notes ; `parentId` nul : à la racine. */
export interface NoteFolder {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Note sans son contenu (listes, panneau latéral). */
export interface NoteSummary {
  id: string;
  folderId: string | null;
  title: string;
  /** Début du texte, pour les listes. */
  excerpt: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Note complète : `content` est le document de l'éditeur, en JSON (vide : note neuve). */
export interface Note extends NoteSummary {
  content: string;
}

/** Champs modifiés d'une note (les autres restent inchangés). */
export interface NoteUpdate {
  title?: string;
  content?: string;
  excerpt?: string;
  pinned?: boolean;
}

export type StickyColor = "yellow" | "pink" | "green" | "blue" | "purple" | "orange";

/** Post-it du mur. */
export interface StickyNote {
  id: string;
  text: string;
  color: StickyColor;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ordre d'empilement : le plus grand est au premier plan. */
  z: number;
  createdAt: string;
  updatedAt: string;
}

export type StickyUpdate = Partial<Pick<StickyNote, "text" | "color" | "x" | "y" | "width" | "height" | "z">>;

// ----------------------------------------------------------------------------
// Corbeille (voir `trash_service.rs`)
// ----------------------------------------------------------------------------

export type TrashKind =
  | "character"
  | "location"
  | "structureNode"
  | "document"
  | "note"
  | "noteFolder"
  | "sticky"
  | "relation"
  | "placeLink";

export interface TrashItem {
  id: string;
  kind: TrashKind;
  /** Identifiant de l'élément supprimé. */
  itemId: string;
  label: string;
  deletedAt: string;
}

// ----------------------------------------------------------------------------
// Historique, versions et recherche (voir `history_service.rs`, `search_service.rs`)
// ----------------------------------------------------------------------------

export type ActivityAction = "created" | "updated" | "deleted" | "restored" | "versionRestored" | "moved";

/** Type d'élément du journal (ceux de la corbeille, plus le synopsis). */
export type HistoryKind = TrashKind | "synopsis";

export interface Activity {
  id: string;
  at: string;
  action: ActivityAction;
  kind: HistoryKind;
  itemId: string;
  label: string;
  /** Suppression : identifiant de l'entrée de la corbeille. */
  detail: string;
}

/** Éléments qui ont des versions. */
export type VersionKind = "character" | "location" | "structureNode" | "note" | "synopsis";

export interface Version {
  id: string;
  /** Vide : version automatique. */
  name: string;
  createdAt: string;
  /** Colonnes de l'élément (`fields`, `content`… en texte JSON). */
  data: Record<string, string | number | null>;
}

export interface VersionList {
  current: Record<string, string | number | null>;
  versions: Version[];
}

/** Calendrier de travail (tableau de bord). */
export interface WorkCalendar {
  year: number;
  firstYear: number | null;
  days: Array<{
    day: string;
    actions: number;
    minutes: number;
    projects: Array<{ projectId: string; actions: number; minutes: number }>;
  }>;
}

/** `document` : l'identifiant est celui de l'élément du découpage qui le contient. */
export type SearchKind = "character" | "location" | "structureNode" | "document" | "note" | "noteFolder" | "sticky";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  inTitle: boolean;
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
// ----------------------------------------------------------------------------
// Documents rangés dans le découpage (voir `document_service.rs`)
// ----------------------------------------------------------------------------

export interface StructureDocument {
  id: string;
  nodeId: string;
  /** Nom du fichier, avec son extension. */
  name: string;
  mime: string;
  /** Taille en octets. */
  size: number;
  note: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Nombre de versions précédentes. */
  versions: number;
}

export interface DocumentVersion {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

/** Document ouvert dans une autre application. */
export interface ExternalStatus {
  open: boolean;
  changed: boolean;
  path: string;
}

export interface ExternalSync {
  status: ExternalStatus;
  /** Document mis à jour : ses modifications viennent d'être reprises. */
  document: StructureDocument | null;
}
