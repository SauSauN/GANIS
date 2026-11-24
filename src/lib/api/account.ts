import { call } from "./client";
import type {
  AccountCreated,
  AuthorProfile,
  AppInfo,
  DeviceStatus,
  LoginResult,
  User,
} from "@/types";

/** Compte : configuration initiale, authentification, récupération, profil. */
export const accountApi = {
  // -------------------------------------------------------------------------
  // Général
  // -------------------------------------------------------------------------

  appInfo: () => call<AppInfo>("app_info"),

  // -------------------------------------------------------------------------
  // Phase 2 — Configuration initiale
  // -------------------------------------------------------------------------

  /**
   * Crée le premier compte (un compte « Utilisateur » comme les autres).
   * Retourne aussi sa clé de récupération, à montrer une seule fois.
   */
  setupFirstAccount: (input: {
    username: string;
    password: string;
    email?: string;
  }) => call<AccountCreated>("setup_first_account", { input }),

  /**
   * Indique si au moins un compte utilisateur existe.
   */
  hasAnyUser: () => call<boolean>("has_any_user"),

  // -------------------------------------------------------------------------
  // Clé d'appareil (chiffrement de app.db, voir security/device_key.rs)
  // -------------------------------------------------------------------------

  /** Données verrouillées au démarrage (clé d'appareil indisponible) ? */
  deviceStatus: () => call<DeviceStatus>("device_status"),

  /**
   * Données verrouillées : choisit le fichier de clé de secours. S'il
   * convient, l'application redémarre ; `false` si la fenêtre est fermée.
   */
  restoreDeviceKey: (dialogTitle: string) => call<boolean>("restore_device_key", { dialogTitle }),

  /** Enregistre la clé de secours des données de cet ordinateur. */
  saveDeviceKeyBackup: (input: { language: string; dialogTitle: string }) =>
    call<string | null>("save_device_key_backup", { input }),

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

  // -------------------------------------------------------------------------
  // Récupération par e-mail (Supabase)
  // -------------------------------------------------------------------------

  /**
   * Active (ou renouvelle) la récupération par e-mail. Le mot de passe est
   * vérifié par Rust ; le secret retourné doit être envoyé à Supabase puis
   * oublié. Un ancien secret cesse de fonctionner.
   */
  enableEmailRecovery: (input: { username: string; password: string }) =>
    call<{ userId: string; secret: string }>("enable_email_recovery", { input }),

  /** Désactive la récupération par e-mail du compte connecté. */
  disableEmailRecovery: () => call<void>("disable_email_recovery"),

  /** Vrai si le compte connecté peut être récupéré par e-mail. */
  hasEmailRecovery: () => call<boolean>("has_email_recovery"),

  /**
   * Mot de passe oublié, par e-mail : `secrets` sont ceux rendus par
   * Supabase après vérification du code.
   */
  recoverWithEmail: (input: {
    username: string;
    secrets: string[];
    newPassword: string;
  }) => call<void>("recover_with_email", { input }),

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
   * Met à jour le profil d'auteur du compte connecté (nom d'auteur, nom
   * complet, site web, biographie). Tous les champs vides l'effacent.
   */
  updateAuthorProfile: (profile: AuthorProfile) =>
    call<User>("update_author_profile", { profile }),

  /**
   * Change le mot de passe du compte connecté.
   */
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => call<void>("change_password", { input }),

  /**
   * Supprime le compte connecté (mot de passe demandé), avec ses projets
   * privés. La session est fermée.
   */
  deleteAccount: (password: string) =>
    call<void>("delete_account", { input: { password } }),

  // Commande de diagnostic désactivée côté Rust (mise en commentaire
  // dans src-tauri/src/lib.rs). À décommenter en même temps qu'elle.
  // /**
  //  * Rapport de diagnostic (développeur).
  //  */
  // getDiagnostics: () => call<Diagnostics>("get_diagnostics"),
};
