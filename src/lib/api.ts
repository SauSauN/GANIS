import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import i18n from "@/i18n";
import { isWriteCommand, useSaveStatusStore } from "@/lib/saveStatus";
import type {
  AccountCreated,
  ApiErrorPayload,
  AppInfo,
  Character,
  CharacterInput,
  CharacterPortrait,
  CharacterListKey,
  CharacterSettings,
  GalleryImage,
  GraphPosition,
  CharacterLocation,
  CharacterLocationInput,
  Location,
  LocationImage,
  LocationInput,
  LocationSettings,
  SystemNotesSettings,
  CustomLocationType,
  Relation,
  RelationInput,
  // Diagnostics, // utilisé par getDiagnostics (en commentaire)
  ErrorCode,
  GanixImportMode,
  GanixImportOutcome,
  GanixPreview,
  LoginResult,
  Project,
  // Role, // utilisé par createUser (en commentaire)
  Structure,
  StructureLevelInput,
  StructureLinks,
  NodeCharacterRole,
  NodeLocationRole,
  Note,
  NoteFolder,
  NoteSummary,
  NoteUpdate,
  StickyColor,
  StickyNote,
  StickyUpdate,
  TrashItem,
  Activity,
  Version,
  VersionKind,
  VersionList,
  SearchHit,
  WorkCalendar,
  StructureDocument,
  DocumentVersion,
  ExternalStatus,
  ExternalSync,
  StructureNode,
  Synopsis,
  ThemeData,
  User,
  UserPackage,
} from "@/types";

/** `t` sans typage des clés : les clés d'erreur viennent de Rust, à l'exécution. */
const translate = i18n.t.bind(i18n) as unknown as (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * Message d'une erreur Rust dans la langue de l'interface.
 *
 * 1. Rust a fourni une clé connue de `errors.json` → message traduit ;
 * 2. sinon, en français → le message d'origine de Rust (le plus précis) ;
 * 3. sinon → un message générique selon le code (`errors.codes.*`).
 */
export function translateApiError(error: ApiError): string {
  const message = translateMessage(error);

  // Piste de solution, quand il y en a une (`errors.json` › `hints`).
  const hintKey = error.key && i18n.exists(`errors:hints.${error.key}`)
    ? `errors:hints.${error.key}`
    : !error.key && i18n.exists(`errors:hints.codes.${error.code}`)
      ? `errors:hints.codes.${error.code}`
      : null;

  return hintKey ? `${message} ${translate(hintKey)}` : message;
}

function translateMessage(error: ApiError): string {
  if (error.key && i18n.exists(`errors:${error.key}`)) {
    const params: Record<string, unknown> = { ...error.params };

    // Nom de champ (ex. `genres`) : traduit lui aussi.
    if (typeof params.field === "string") {
      params.field = translate(`errors:fields.${params.field}`, {
        defaultValue: params.field,
      });
    }

    return translate(`errors:${error.key}`, params);
  }

  if (i18n.resolvedLanguage === "fr") {
    return error.rawMessage;
  }

  return translate(`errors:codes.${error.code}`);
}

/**
 * Erreur normalisée renvoyée par le pont Rust.
 *
 * Utilise les codes de `ErrorCode` définis dans `types/index.ts`
 * et correspondant aux codes du backend Rust.
 *
 * `message` est traduit à chaque lecture (voir `translateApiError`) :
 * tout le code existant qui affiche `e.message` obtient donc le texte
 * dans la langue de l'interface, sans modification.
 */
export class ApiError extends Error {
  code: ErrorCode;
  /** Message d'origine, en français, tel que renvoyé par Rust. */
  readonly rawMessage: string;
  /** Clé de traduction fournie par Rust (`errors.json`). */
  readonly key?: string;
  /** Valeurs à insérer dans le message traduit. */
  readonly params?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    message: string,
    key?: string,
    params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.rawMessage = message;
    this.key = key;
    this.params = params;

    Object.defineProperty(this, "message", {
      get: () => translateApiError(this),
      configurable: true,
      enumerable: false,
    });
  }
}

/** Construit une `ApiError` à partir de la réponse de Rust. */
function fromPayload(payload: ApiErrorPayload): ApiError {
  return new ApiError(
    payload.code,
    payload.message,
    payload.key,
    payload.params,
  );
}

/**
 * Vérifie qu'une valeur possède la structure d'une erreur API.
 */
function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("code" in value) || !("message" in value)) {
    return false;
  }

  const payload = value as {
    code?: unknown;
    message?: unknown;
  };

  const validCodes: ErrorCode[] = [
    "INTERNAL",
    "VALIDATION",
    "NOT_FOUND",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "CONFLICT",
    "DATABASE",
    "IO",
  ];

  return (
    typeof payload.code === "string" &&
    validCodes.includes(payload.code as ErrorCode) &&
    typeof payload.message === "string" &&
    payload.message.length > 0
  );
}

/**
 * Essaie de convertir une chaîne en payload d'erreur API.
 */
function parseErrorString(value: string): ApiError | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (isApiErrorPayload(parsed)) {
      return fromPayload(parsed);
    }
  } catch {
    // La chaîne n'est pas du JSON.
  }

  return null;
}

/**
 * Normalise toute erreur remontée par Tauri en `ApiError`.
 */
function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }

  if (isApiErrorPayload(e)) {
    return fromPayload(e);
  }

  if (typeof e === "string") {
    const parsed = parseErrorString(e);

    if (parsed) {
      return parsed;
    }

    console.error("Erreur Tauri :", e);

    return new ApiError("INTERNAL", e);
  }

  if (e instanceof Error) {
    console.error("Erreur Tauri :", e);

    return new ApiError("INTERNAL", e.message);
  }

  console.error("Erreur Tauri inconnue :", e);

  return new ApiError(
    "INTERNAL",
    "Une erreur inattendue est survenue.",
  );
}

/**
 * Wrapper bas niveau autour de `invoke`.
 *
 * Toutes les commandes Tauri passent par cette fonction afin
 * de garantir une gestion uniforme des erreurs.
 */
async function call<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  // Les écritures sont signalées à la barre d'état (voir `saveStatus.ts`).
  const writes = isWriteCommand(command);
  const status = useSaveStatusStore.getState();

  if (writes) status.begin();

  try {
    const result = await invoke<T>(command, args, options);
    if (writes) status.succeed();
    return result;
  } catch (e) {
    const error = normalize(e);
    if (writes) status.fail(error.message);
    throw error;
  }
}

/** Corps binaire d'une commande (Tauri l'envoie sans le convertir en JSON). */
function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Vrai lorsque l'application tourne dans Tauri.
 * Faux lorsque le frontend est exécuté dans un navigateur classique.
 */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Point d'accès unique de l'interface au noyau Rust.
 */
export const api = {
  // -------------------------------------------------------------------------
  // Général
  // -------------------------------------------------------------------------

  appInfo: () => call<AppInfo>("app_info"),

  // -------------------------------------------------------------------------
  // Phase 2 — Configuration initiale & administration
  // -------------------------------------------------------------------------

  /**
   * Crée le premier compte administrateur.
   * Retourne aussi sa clé de récupération, à montrer une seule fois.
   */
  setupAdmin: (input: {
    username: string;
    password: string;
    email?: string;
  }) => call<AccountCreated>("setup_admin", { input }),

  // Commandes d'administration désactivées côté Rust (mises en commentaire
  // dans src-tauri/src/lib.rs). À décommenter en même temps qu'elles.
  // /**
  //  * Liste les comptes utilisateurs locaux.
  //  *
  //  * La protection administrateur est effectuée côté Rust.
  //  */
  // listUsers: () => call<User[]>("list_users"),
  //
  // /**
  //  * Modifie le rôle d'un utilisateur.
  //  *
  //  * La vérification des droits administrateur est effectuée
  //  * côté backend Rust.
  //  */
  // updateUserRole: (userId: string, role: User["role"]) =>
  //   call<User>("update_user_role", {
  //     userId,
  //     role,
  //   }),
  //
  // /**
  //  * Crée un compte avec un rôle précis (administrateur uniquement).
  //  */
  // createUser: (input: {
  //   username: string;
  //   password: string;
  //   email?: string;
  //   role: Role;
  // }) => call<User>("create_user", { input }),
  //
  // /**
  //  * Supprime un compte local, avec ses projets (administrateur uniquement).
  //  */
  // deleteUser: (userId: string) => call<void>("delete_user", { userId }),

  /**
   * Indique si au moins un compte utilisateur existe.
   */
  hasAnyUser: () => call<boolean>("has_any_user"),

  // -------------------------------------------------------------------------
  // Phase 3 — Authentification
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau compte utilisateur local.
   * Retourne aussi sa clé de récupération, à montrer une seule fois.
   */
  register: (input: {
    username: string;
    password: string;
    email?: string;
  }) => call<AccountCreated>("register", { input }),

  /**
   * Authentifie un utilisateur existant et ouvre la clé de son compte.
   */
  login: (input: {
    username: string;
    password: string;
  }) => call<LoginResult>("login", { input }),

  // -------------------------------------------------------------------------
  // Clé de récupération
  // -------------------------------------------------------------------------

  /**
   * Mot de passe oublié : choisit un nouveau mot de passe grâce à la clé
   * de récupération. Les projets sont conservés.
   */
  recoverAccount: (input: {
    username: string;
    recoveryKey: string;
    newPassword: string;
  }) => call<void>("recover_account", { input }),

  /**
   * Remplace la clé de récupération du compte connecté et retourne la
   * nouvelle. L'ancienne cesse aussitôt de fonctionner.
   */
  regenerateRecoveryKey: (input: { currentPassword: string }) =>
    call<string>("regenerate_recovery_key", { input }),

  /**
   * Enregistre la clé de récupération dans un fichier texte (fenêtre
   * « Enregistrer sous » ouverte par Rust). `false` si l'utilisateur annule.
   */
  saveRecoveryKeyFile: (input: {
    recoveryKey: string;
    username: string;
    language: string;
    dialogTitle: string;
  }) => call<boolean>("save_recovery_key_file", { input }),

  /**
   * Ferme la session locale courante.
   */
  logout: () => call<void>("logout"),

  // -------------------------------------------------------------------------
  // Phase 4 — Profil et diagnostics
  // -------------------------------------------------------------------------

  /**
   * Met à jour l'adresse e-mail du compte connecté.
   * Une valeur vide supprime l'adresse.
   */
  updateProfile: (input: { email?: string }) =>
    call<User>("update_profile", { input }),

  /**
   * Change le mot de passe du compte connecté.
   */
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => call<void>("change_password", { input }),

  // Commande de diagnostic désactivée côté Rust (mise en commentaire
  // dans src-tauri/src/lib.rs). À décommenter en même temps qu'elle.
  // /**
  //  * Rapport de diagnostic (administrateur ou développeur).
  //  */
  // getDiagnostics: () => call<Diagnostics>("get_diagnostics"),

  // -------------------------------------------------------------------------
  // Phase 4 — Projets
  // -------------------------------------------------------------------------

  /**
   * Crée un nouveau projet.
   *
   * `projectType` est volontairement en camelCase côté frontend.
   * Visibilité automatique (décidée par Rust) : public sans connexion,
   * privé une fois connecté.
   */
  createProject: (input: {
    name: string;
    description: string;
    projectType: Project["type"];
  }) => call<Project>("create_project", { input }),

  /**
   * Rend un projet privé (lié au compte connecté) ou public.
   * Nécessite une connexion.
   */
  setProjectVisibility: (
    projectId: string,
    visibility: Project["visibility"],
  ) =>
    call<Project>("set_project_visibility", { projectId, visibility }),

  /**
   * Liste les projets accessibles : projets publics, et projets privés du
   * compte connecté.
   */
  listProjects: () => call<Project[]>("list_projects"),

  /**
   * Récupère un projet précis.
   */
  getProject: (projectId: string) =>
    call<Project>("get_project", { projectId }),

  /**
   * Ouvre un projet : enregistre la date d'ouverture et retourne le projet.
   */
  openProject: (projectId: string) =>
    call<Project>("open_project", { projectId }),

  /**
   * Met à jour un projet existant.
   *
   * Les champs sont optionnels afin de permettre des mises à jour
   * partielles depuis l'interface.
   */
  updateProject: (
    projectId: string,
    input: {
      name?: string;
      description?: string;
      projectType?: Project["type"];
      status?: Project["status"];
      isFavorite?: boolean;
      isArchived?: boolean;
    },
  ) =>
    call<Project>("update_project", {
      projectId,
      input,
    }),

  /**
   * Duplique un projet (métadonnées uniquement).
   */
  duplicateProject: (projectId: string) =>
    call<Project>("duplicate_project", { projectId }),

  /**
   * Supprime définitivement un projet.
   */
  deleteProject: (projectId: string) =>
    call<void>("delete_project", { projectId }),

  // -------------------------------------------------------------------------
  // Format .ganix
  // -------------------------------------------------------------------------

  /**
   * Exporte un projet dans un fichier `.ganix` choisi par l'utilisateur
   * (fenêtre ouverte par Rust). Retourne le nom du fichier écrit, ou `null`
   * si l'utilisateur a annulé.
   */
  exportProject: (projectId: string, dialogTitle: string) =>
    call<string | null>("export_project", { projectId, dialogTitle }),

  /**
   * Fait choisir un `.ganix`, le vérifie et le met en attente. Retourne
   * l'aperçu, ou `null` si l'utilisateur a annulé.
   */
  inspectGanix: (dialogTitle: string) =>
    call<GanixPreview | null>("inspect_ganix", { dialogTitle }),

  /** Ajoute au compte le projet en attente. */
  confirmGanixImport: (stagingId: string, mode: GanixImportMode) =>
    call<GanixImportOutcome>("confirm_ganix_import", { stagingId, mode }),

  /** Abandonne un import en attente (aucune trace). */
  cancelGanixImport: (stagingId: string) =>
    call<void>("cancel_ganix_import", { stagingId }),

  // -------------------------------------------------------------------------
  // Synopsis
  // -------------------------------------------------------------------------

  /**
   * Récupère le synopsis d'un projet.
   */
  getSynopsis: (projectId: string) =>
    call<Synopsis>("get_synopsis", { projectId }),

  /**
   * Met à jour le synopsis d'un projet.
   */
  updateSynopsis: (
    projectId: string,
    input: {
      content: string;
      genres: string[];
      subgenres: string[];
      tone: string[];
    },
  ) =>
    call<Synopsis>("update_synopsis", {
      projectId,
      input,
    }),

  // -------------------------------------------------------------------------
  // Découpage du récit
  // -------------------------------------------------------------------------

  /** Découpage complet du projet (modèle et éléments). */
  getStructure: (projectId: string) =>
    call<Structure>("get_structure", { projectId }),

  /**
   * Choisit le modèle de découpage (`null` : il suit le type du projet).
   * Les niveaux redeviennent ceux du modèle.
   */
  setStructureTemplate: (projectId: string, template: string | null) =>
    call<void>("set_structure_template", { projectId, template }),

  /** Personnalise les niveaux : noms, numérotation, ajout ou retrait. */
  setStructureLevels: (projectId: string, levels: StructureLevelInput[]) =>
    call<void>("set_structure_levels", { projectId, levels }),

  /** Active ou désactive la mise à jour automatique des numéros. */
  setStructureAutoNumbering: (projectId: string, enabled: boolean) =>
    call<void>("set_structure_auto_numbering", { projectId, enabled }),

  /** Remet tous les numéros dans l'ordre du plan (« Renuméroter »). */
  renumberStructure: (projectId: string) =>
    call<void>("renumber_structure", { projectId }),

  /**
   * Ajoute un élément à la fin de son parent (ou de la racine), ou juste
   * après `afterId` (même parent). Le titre est facultatif.
   */
  createStructureNode: (
    projectId: string,
    input: {
      parentId: string | null;
      level: number;
      title?: string;
      afterId?: string | null;
    },
  ) => call<StructureNode>("create_structure_node", { projectId, input }),

  /**
   * Modifie le titre, le résumé, la numérotation et/ou le numéro (choisi à
   * la main, numérotation non automatique) d'un élément.
   */
  updateStructureNode: (
    projectId: string,
    nodeId: string,
    input: { title?: string; summary?: string; numbered?: boolean; number?: number },
  ) =>
    call<StructureNode>("update_structure_node", { projectId, nodeId, input }),

  /** Monte ou descend un élément parmi ceux de même parent. */
  moveStructureNode: (
    projectId: string,
    nodeId: string,
    direction: "up" | "down",
  ) => call<void>("move_structure_node", { projectId, nodeId, direction }),

  /** Supprime un élément et tout ce qu'il contient. */
  deleteStructureNode: (projectId: string, nodeId: string) =>
    call<string>("delete_structure_node", { projectId, nodeId }),

  /** Personnages et lieux liés aux éléments du découpage. */
  listStructureLinks: (projectId: string) =>
    call<StructureLinks>("list_structure_links", { projectId }),

  /** Lie un personnage à un élément (ou change son rôle). */
  linkStructureCharacter: (projectId: string, nodeId: string, characterId: string, role: NodeCharacterRole) =>
    call<void>("link_structure_character", { projectId, nodeId, characterId, role }),

  /** Retire un personnage d'un élément. */
  unlinkStructureCharacter: (projectId: string, nodeId: string, characterId: string) =>
    call<void>("unlink_structure_character", { projectId, nodeId, characterId }),

  /** Lie un lieu à un élément (ou change son rôle). */
  linkStructureLocation: (projectId: string, nodeId: string, locationId: string, role: NodeLocationRole) =>
    call<void>("link_structure_location", { projectId, nodeId, locationId, role }),

  /** Retire un lieu d'un élément. */
  unlinkStructureLocation: (projectId: string, nodeId: string, locationId: string) =>
    call<void>("unlink_structure_location", { projectId, nodeId, locationId }),

  // -------------------------------------------------------------------------
  // Corbeille (les suppressions ci-dessous renvoient l'identifiant de
  // l'entrée de la corbeille, pour proposer « Annuler »)
  // -------------------------------------------------------------------------

  listTrash: (projectId: string) =>
    call<TrashItem[]>("list_trash", { projectId }),

  /** Remet un élément à sa place ; renvoie l'entrée restaurée. */
  restoreTrash: (projectId: string, trashId: string) =>
    call<TrashItem>("restore_trash", { projectId, trashId }),

  purgeTrash: (projectId: string, trashId: string) =>
    call<void>("purge_trash", { projectId, trashId }),

  emptyTrash: (projectId: string) =>
    call<void>("empty_trash", { projectId }),

  // -------------------------------------------------------------------------
  // Historique, versions, recherche
  // -------------------------------------------------------------------------

  /** Journal du projet, ou d'un seul élément (`kind` + `itemId`). */
  listActivity: (projectId: string, filter: { kind?: string; itemId?: string; limit?: number } = {}) =>
    call<Activity[]>("list_activity", {
      projectId,
      kind: filter.kind ?? null,
      itemId: filter.itemId ?? null,
      limit: filter.limit ?? null,
    }),

  listVersions: (projectId: string, kind: VersionKind, itemId: string) =>
    call<VersionList>("list_versions", { projectId, kind, itemId }),

  /** Version nommée de l'état actuel (« Avant réécriture »). */
  createVersion: (projectId: string, kind: VersionKind, itemId: string, name: string) =>
    call<Version>("create_version", { projectId, kind, itemId, name }),

  /** Remet l'élément dans l'état de la version ; l'état actuel est gardé. */
  restoreVersion: (projectId: string, versionId: string) =>
    call<void>("restore_version", { projectId, versionId }),

  deleteVersion: (projectId: string, versionId: string) =>
    call<void>("delete_version", { projectId, versionId }),

  /** Volume de travail jour par jour d'une année, tous projets confondus. */
  getWorkCalendar: (year: number) =>
    call<WorkCalendar>("get_work_calendar", { year }),

  /** Recherche dans tout le projet (sans casse ni accents). */
  searchProject: (projectId: string, query: string) =>
    call<SearchHit[]>("search_project", { projectId, query }),

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  /** Dossiers de notes du projet. */
  listNoteFolders: (projectId: string) =>
    call<NoteFolder[]>("list_note_folders", { projectId }),

  createNoteFolder: (projectId: string, parentId: string | null, name: string) =>
    call<NoteFolder>("create_note_folder", { projectId, parentId, name }),

  renameNoteFolder: (projectId: string, folderId: string, name: string) =>
    call<NoteFolder>("rename_note_folder", { projectId, folderId, name }),

  /** Déplace un dossier (`null` : à la racine). Refusé dans l'un de ses sous-dossiers. */
  moveNoteFolder: (projectId: string, folderId: string, parentId: string | null) =>
    call<NoteFolder>("move_note_folder", { projectId, folderId, parentId }),

  /** Supprime un dossier et ses sous-dossiers ; leurs notes remontent à la racine. */
  deleteNoteFolder: (projectId: string, folderId: string) =>
    call<string>("delete_note_folder", { projectId, folderId }),

  /** Notes du projet, sans leur contenu (épinglées d'abord, puis les plus récentes). */
  // -------------------------------------------------------------------------
  // Trame
  // -------------------------------------------------------------------------

  getPlot: (projectId: string) => call<{ data: string; updatedAt: string }>("get_plot", { projectId }),

  /** Enregistre toute la trame (document JSON). */
  updatePlot: (projectId: string, data: string) =>
    call<string>("update_plot", { projectId, data }),

  // -------------------------------------------------------------------------
  // Documents rangés dans le découpage
  // -------------------------------------------------------------------------

  listStructureDocuments: (projectId: string, nodeId: string) =>
    call<StructureDocument[]>("list_structure_documents", { projectId, nodeId }),

  countStructureDocuments: (projectId: string) =>
    call<Record<string, number>>("count_structure_documents", { projectId }),

  /** Contenu du document, en binaire. */
  getStructureDocumentContent: (projectId: string, documentId: string) =>
    call<ArrayBuffer>("get_structure_document_content", { projectId, documentId }),

  /** Fenêtre de choix de fichiers ; liste vide si l'utilisateur annule. */
  pickStructureDocuments: (projectId: string, nodeId: string, dialogTitle: string) =>
    call<StructureDocument[]>("pick_structure_documents", { projectId, nodeId, dialogTitle }),

  /** Fichier déposé : envoyé tel quel (corps binaire). */
  addStructureDocument: (projectId: string, nodeId: string, name: string, data: ArrayBuffer | Uint8Array) =>
    call<StructureDocument>("add_structure_document", toBytes(data), {
      headers: {
        "x-project-id": encodeURIComponent(projectId),
        "x-node-id": encodeURIComponent(nodeId),
        "x-name": encodeURIComponent(name),
      },
    }),

  /** Nouveau contenu (texte modifié dans GANIS) ; l'ancien devient une version. */
  updateStructureDocumentContent: (projectId: string, documentId: string, data: ArrayBuffer | Uint8Array) =>
    call<StructureDocument>("update_structure_document_content", toBytes(data), {
      headers: {
        "x-project-id": encodeURIComponent(projectId),
        "x-document-id": encodeURIComponent(documentId),
      },
    }),

  pickStructureDocumentReplacement: (projectId: string, documentId: string, dialogTitle: string) =>
    call<StructureDocument | null>("pick_structure_document_replacement", { projectId, documentId, dialogTitle }),

  renameStructureDocument: (projectId: string, documentId: string, name: string) =>
    call<StructureDocument>("rename_structure_document", { projectId, documentId, name }),

  updateStructureDocumentNote: (projectId: string, documentId: string, note: string) =>
    call<StructureDocument>("update_structure_document_note", { projectId, documentId, note }),

  moveStructureDocument: (projectId: string, documentId: string, nodeId: string) =>
    call<StructureDocument>("move_structure_document", { projectId, documentId, nodeId }),

  reorderStructureDocuments: (projectId: string, nodeId: string, ids: string[]) =>
    call<StructureDocument[]>("reorder_structure_documents", { projectId, nodeId, ids }),

  /** Met le document à la corbeille ; renvoie l'identifiant de l'entrée. */
  deleteStructureDocument: (projectId: string, documentId: string) =>
    call<string>("delete_structure_document", { projectId, documentId }),

  /** « Enregistrer sous… » ; `null` si l'utilisateur annule. */
  saveStructureDocumentAs: (projectId: string, documentId: string, versionId: string | null, dialogTitle: string) =>
    call<string | null>("save_structure_document_as", { projectId, documentId, versionId, dialogTitle }),

  listDocumentVersions: (projectId: string, documentId: string) =>
    call<DocumentVersion[]>("list_document_versions", { projectId, documentId }),

  getDocumentVersionContent: (projectId: string, versionId: string) =>
    call<ArrayBuffer>("get_document_version_content", { projectId, versionId }),

  restoreDocumentVersion: (projectId: string, documentId: string, versionId: string) =>
    call<StructureDocument>("restore_document_version", { projectId, documentId, versionId }),

  deleteDocumentVersion: (projectId: string, versionId: string) =>
    call<void>("delete_document_version", { projectId, versionId }),

  openStructureDocumentExternally: (projectId: string, documentId: string) =>
    call<ExternalStatus>("open_structure_document_externally", { projectId, documentId }),

  syncStructureDocumentExternal: (projectId: string, documentId: string) =>
    call<ExternalSync>("sync_structure_document_external", { projectId, documentId }),

  closeStructureDocumentExternal: (projectId: string, documentId: string) =>
    call<StructureDocument | null>("close_structure_document_external", { projectId, documentId }),

  getSystemNotes: (projectId: string) => call<SystemNotesSettings>("get_system_notes", { projectId }),

  setSystemNotes: (projectId: string, enabled: boolean, language: string) =>
    call<SystemNotesSettings>("set_system_notes", { projectId, enabled, language }),

  syncSystemNotes: (projectId: string, language: string) => call<void>("sync_system_notes", { projectId, language }),

  listNotes: (projectId: string) =>
    call<NoteSummary[]>("list_notes", { projectId }),

  getNote: (projectId: string, noteId: string) =>
    call<Note>("get_note", { projectId, noteId }),

  createNote: (projectId: string, folderId: string | null, title: string) =>
    call<Note>("create_note", { projectId, folderId, title }),

  updateNote: (projectId: string, noteId: string, input: NoteUpdate) =>
    call<Note>("update_note", { projectId, noteId, input }),

  moveNote: (projectId: string, noteId: string, folderId: string | null) =>
    call<Note>("move_note", { projectId, noteId, folderId }),

  deleteNote: (projectId: string, noteId: string) =>
    call<string>("delete_note", { projectId, noteId }),

  /** Post-it du mur. */
  listStickyNotes: (projectId: string) =>
    call<StickyNote[]>("list_sticky_notes", { projectId }),

  createStickyNote: (projectId: string, color: StickyColor, x: number, y: number) =>
    call<StickyNote>("create_sticky_note", { projectId, color, x, y }),

  updateStickyNote: (projectId: string, stickyId: string, input: StickyUpdate) =>
    call<StickyNote>("update_sticky_note", { projectId, stickyId, input }),

  /** Met un post-it au premier plan. */
  raiseStickyNote: (projectId: string, stickyId: string) =>
    call<StickyNote>("raise_sticky_note", { projectId, stickyId }),

  deleteStickyNote: (projectId: string, stickyId: string) =>
    call<string>("delete_sticky_note", { projectId, stickyId }),

  // -------------------------------------------------------------------------
  // Personnages
  // -------------------------------------------------------------------------

  /** Réglages des personnages du projet (niveau de détail des fiches). */
  getCharacterSettings: (projectId: string) =>
    call<CharacterSettings>("get_character_settings", { projectId }),

  /** Choisit le niveau de détail de toutes les fiches du projet. */
  setCharacterDetailLevel: (projectId: string, level: string) =>
    call<CharacterSettings>("set_character_detail_level", { projectId, level }),

  /** Remplace une liste personnalisable (`null` : valeurs par défaut). */
  setCharacterList: (projectId: string, list: CharacterListKey, values: string[] | null) =>
    call<CharacterSettings>("set_character_list", { projectId, list, values }),

  /** Images de la galerie d'un personnage (sans leur contenu). */
  listCharacterGallery: (projectId: string, characterId: string) =>
    call<GalleryImage[]>("list_character_gallery", { projectId, characterId }),

  /** Contenu d'une image de la galerie. */
  getCharacterGalleryImage: (projectId: string, imageId: string) =>
    call<CharacterPortrait>("get_character_gallery_image", { projectId, imageId }),

  /** Ajoute une image à la galerie (`data` : image en base64). */
  addCharacterGalleryImage: (projectId: string, characterId: string, data: string) =>
    call<GalleryImage>("add_character_gallery_image", { projectId, characterId, data }),

  /** Supprime une image de la galerie. */
  deleteCharacterGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_character_gallery_image", { projectId, imageId }),

  // -------------------------------------------------------------------------
  // Liens personnage ↔ lieu
  // -------------------------------------------------------------------------

  /** Tous les liens personnage ↔ lieu du projet. */
  listCharacterLocations: (projectId: string) =>
    call<CharacterLocation[]>("list_character_locations", { projectId }),

  /** Crée un lien. */
  createCharacterLocation: (projectId: string, input: CharacterLocationInput) =>
    call<CharacterLocation>("create_character_location", { projectId, input }),

  /** Remplace un lien. */
  updateCharacterLocation: (projectId: string, linkId: string, input: CharacterLocationInput) =>
    call<CharacterLocation>("update_character_location", { projectId, linkId, input }),

  /** Supprime un lien. */
  deleteCharacterLocation: (projectId: string, linkId: string) =>
    call<string>("delete_character_location", { projectId, linkId }),

  // -------------------------------------------------------------------------
  // Lieux
  // -------------------------------------------------------------------------

  /** Tous les lieux du projet, par nom. */
  listLocations: (projectId: string) =>
    call<Location[]>("list_locations", { projectId }),

  /** Crée un lieu. */
  createLocation: (projectId: string, input: LocationInput) =>
    call<Location>("create_location", { projectId, input }),

  /** Remplace la fiche d'un lieu. */
  updateLocation: (projectId: string, locationId: string, input: LocationInput) =>
    call<Location>("update_location", { projectId, locationId, input }),

  /** Supprime un lieu (ses lieux contenus remontent d'un niveau). */
  deleteLocation: (projectId: string, locationId: string) =>
    call<string>("delete_location", { projectId, locationId }),

  /** Réglages des lieux du projet (types ajoutés, listes). */
  getLocationSettings: (projectId: string) =>
    call<LocationSettings>("get_location_settings", { projectId }),

  /** Remplace les types de lieux ajoutés par l'auteur (`id` absent : nouveau). */
  setLocationCustomTypes: (
    projectId: string,
    types: Array<Omit<CustomLocationType, "id"> & { id?: string }>,
  ) => call<LocationSettings>("set_location_custom_types", { projectId, types }),

  /** Remplace une liste personnalisable (`null` : valeurs par défaut). */
  setLocationList: (projectId: string, list: "status", values: string[] | null) =>
    call<LocationSettings>("set_location_list", { projectId, list, values }),

  setLocationDetailLevel: (projectId: string, level: string) =>
    call<LocationSettings>("set_location_detail_level", { projectId, level }),

  /** Image principale d'un lieu (`null` : pas d'image). */
  getLocationPortrait: (projectId: string, locationId: string) =>
    call<CharacterPortrait | null>("get_location_portrait", { projectId, locationId }),

  /** Remplace l'image principale (`data` : image en base64). */
  setLocationPortrait: (projectId: string, locationId: string, data: string) =>
    call<Location>("set_location_portrait", { projectId, locationId, data }),

  /** Retire l'image principale. */
  removeLocationPortrait: (projectId: string, locationId: string) =>
    call<Location>("remove_location_portrait", { projectId, locationId }),

  /** Images de la galerie d'un lieu (sans leur contenu). */
  listLocationGallery: (projectId: string, locationId: string) =>
    call<LocationImage[]>("list_location_gallery", { projectId, locationId }),

  /** Contenu d'une image de la galerie. */
  getLocationGalleryImage: (projectId: string, imageId: string) =>
    call<CharacterPortrait>("get_location_gallery_image", { projectId, imageId }),

  /** Ajoute une image à la galerie (`data` : image en base64). */
  addLocationGalleryImage: (
    projectId: string,
    locationId: string,
    data: string,
    caption: string | null = null,
  ) => call<LocationImage>("add_location_gallery_image", { projectId, locationId, data, caption }),

  /** Change la légende d'une image. */
  setLocationGalleryCaption: (projectId: string, imageId: string, caption: string | null) =>
    call<void>("set_location_gallery_caption", { projectId, imageId, caption }),

  /** Supprime une image de la galerie. */
  deleteLocationGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_location_gallery_image", { projectId, imageId }),

  /** Tous les personnages du projet, par ordre alphabétique. */
  listCharacters: (projectId: string) =>
    call<Character[]>("list_characters", { projectId }),

  /** Crée un personnage. */
  createCharacter: (projectId: string, input: CharacterInput) =>
    call<Character>("create_character", { projectId, input }),

  /** Remplace la fiche d'un personnage. */
  updateCharacter: (projectId: string, characterId: string, input: CharacterInput) =>
    call<Character>("update_character", { projectId, characterId, input }),

  /** Supprime un personnage et sa photo. */
  deleteCharacter: (projectId: string, characterId: string) =>
    call<string>("delete_character", { projectId, characterId }),

  /** Photo d'un personnage (`null` : pas de photo). */
  getCharacterPortrait: (projectId: string, characterId: string) =>
    call<CharacterPortrait | null>("get_character_portrait", { projectId, characterId }),

  /** Remplace la photo d'un personnage (`data` : image en base64). */
  setCharacterPortrait: (projectId: string, characterId: string, data: string) =>
    call<Character>("set_character_portrait", { projectId, characterId, data }),

  /** Retire la photo d'un personnage. */
  removeCharacterPortrait: (projectId: string, characterId: string) =>
    call<Character>("remove_character_portrait", { projectId, characterId }),

  // -------------------------------------------------------------------------
  // Relations entre personnages
  // -------------------------------------------------------------------------

  /** Toutes les relations du projet. */
  listRelations: (projectId: string) => call<Relation[]>("list_relations", { projectId }),

  /** Crée une relation. */
  createRelation: (projectId: string, input: RelationInput) =>
    call<Relation>("create_relation", { projectId, input }),

  /** Remplace une relation. */
  updateRelation: (projectId: string, relationId: string, input: RelationInput) =>
    call<Relation>("update_relation", { projectId, relationId, input }),

  /** Supprime une relation. */
  deleteRelation: (projectId: string, relationId: string) =>
    call<string>("delete_relation", { projectId, relationId }),

  /** Positions de la disposition libre du graphe. */
  getGraphPositions: (projectId: string) =>
    call<GraphPosition[]>("get_graph_positions", { projectId }),

  /** Enregistre des positions de la disposition libre. */
  saveGraphPositions: (projectId: string, positions: GraphPosition[]) =>
    call<void>("save_graph_positions", { projectId, positions }),

  /** Efface la disposition libre. */
  clearGraphPositions: (projectId: string) => call<void>("clear_graph_positions", { projectId }),

  // -------------------------------------------------------------------------
  // Packages et mode développeur
  // -------------------------------------------------------------------------

  /**
   * Passe le compte connecté au rôle développeur (« Devenir Développeur »).
   * Sans effet pour un développeur ou un administrateur.
   */
  becomeDeveloper: () => call<User>("become_developer"),

  /**
   * Repasse le compte connecté au rôle utilisateur. Les thèmes créés sont
   * conservés. Refusé pour un administrateur.
   */
  leaveDeveloperMode: () => call<User>("leave_developer_mode"),

  /**
   * Packages créés par le compte connecté.
   */
  listMyPackages: () => call<UserPackage[]>("list_my_packages"),

  /**
   * Crée un thème (développeur ou administrateur, vérifié par Rust).
   */
  createThemePackage: (input: {
    name: string;
    description: string;
    theme: ThemeData;
  }) => call<UserPackage>("create_theme_package", { input }),

  /**
   * Modifie un thème du compte connecté.
   */
  updateThemePackage: (
    packageId: string,
    input: {
      name: string;
      description: string;
      theme: ThemeData;
    },
  ) => call<UserPackage>("update_theme_package", { packageId, input }),

  /**
   * Supprime un package du compte connecté.
   */
  deletePackage: (packageId: string) =>
    call<void>("delete_package", { packageId }),
};