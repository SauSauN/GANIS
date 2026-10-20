import { call } from "./client";
import type {
  ThemeData,
  User,
  UserPackage,
} from "@/types";

/** Packages et mode développeur. */
export const packagesApi = {
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
