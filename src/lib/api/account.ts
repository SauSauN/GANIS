import { call } from "./client";
import type {
  AccountCreated,
  AuthorProfile,
  AppInfo,
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
  //  * Rapport de diagnostic (administrateur ou développeur).
  //  */
  // getDiagnostics: () => call<Diagnostics>("get_diagnostics"),
};
