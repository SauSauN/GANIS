import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enActivitybar from "./locales/en/activitybar.json";
import enCharacters from "./locales/en/characters.json";
import enCommon from "./locales/en/common.json";
import enDashboard from "./locales/en/dashboard.json";
import enErrors from "./locales/en/errors.json";
import enLocations from "./locales/en/locations.json";
import enLogin from "./locales/en/login.json";
import enModules from "./locales/en/modules.json";
import enPackages from "./locales/en/packages.json";
import enProjectSettings from "./locales/en/projectSettings.json";
import enProjects from "./locales/en/projects.json";
import enRecovery from "./locales/en/recovery.json";
import enRelations from "./locales/en/relations.json";
import enRegister from "./locales/en/register.json";
import enSettings from "./locales/en/settings.json";
import enSetup from "./locales/en/setup.json";
import enSidebar from "./locales/en/sidebar.json";
import enStatusbar from "./locales/en/statusbar.json";
import enStructure from "./locales/en/structure.json";
import enSynopsis from "./locales/en/synopsis.json";
import enTabs from "./locales/en/tabs.json";
import enTitlebar from "./locales/en/titlebar.json";
import enUnsaved from "./locales/en/unsaved.json";
import enUsermenu from "./locales/en/usermenu.json";
import enViews from "./locales/en/views.json";
import enWelcome from "./locales/en/welcome.json";
import enWorkspace from "./locales/en/workspace.json";
import enWorkspaceHome from "./locales/en/workspaceHome.json";
import frActivitybar from "./locales/fr/activitybar.json";
import frCharacters from "./locales/fr/characters.json";
import frCommon from "./locales/fr/common.json";
import frDashboard from "./locales/fr/dashboard.json";
import frErrors from "./locales/fr/errors.json";
import frLocations from "./locales/fr/locations.json";
import frLogin from "./locales/fr/login.json";
import frModules from "./locales/fr/modules.json";
import frPackages from "./locales/fr/packages.json";
import frProjectSettings from "./locales/fr/projectSettings.json";
import frProjects from "./locales/fr/projects.json";
import frRecovery from "./locales/fr/recovery.json";
import frRelations from "./locales/fr/relations.json";
import frRegister from "./locales/fr/register.json";
import frSettings from "./locales/fr/settings.json";
import frSetup from "./locales/fr/setup.json";
import frSidebar from "./locales/fr/sidebar.json";
import frStatusbar from "./locales/fr/statusbar.json";
import frStructure from "./locales/fr/structure.json";
import frSynopsis from "./locales/fr/synopsis.json";
import frTabs from "./locales/fr/tabs.json";
import frTitlebar from "./locales/fr/titlebar.json";
import frUnsaved from "./locales/fr/unsaved.json";
import frUsermenu from "./locales/fr/usermenu.json";
import frViews from "./locales/fr/views.json";
import frWelcome from "./locales/fr/welcome.json";
import frWorkspace from "./locales/fr/workspace.json";
import frWorkspaceHome from "./locales/fr/workspaceHome.json";

/**
 * Traduction de l'interface (i18next + react-i18next).
 *
 * Les traductions sont intégrées au bundle : aucun chargement réseau,
 * l'application reste entièrement utilisable hors ligne.
 *
 * Organisation : un fichier JSON par langue et par espace de noms
 * (`locales/<langue>/<espace>.json`). `common` regroupe les textes
 * partagés entre plusieurs écrans ; chaque page a son propre espace.
 * Pour traduire une nouvelle page, ajouter son fichier dans chaque langue,
 * puis le déclarer dans `resources` et dans `ns`.
 *
 * Le français est la langue de référence : toute clé absente en anglais
 * s'affiche en français plutôt que de laisser une clé brute à l'écran.
 */

// ----------------------------------------------------------------------------
// Langues disponibles
// ----------------------------------------------------------------------------

export const LANGUAGES = ["fr", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "fr";

/** Nom de chaque langue, écrit dans cette langue (convention des sélecteurs). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  fr: "Français",
  en: "English",
};

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

// ----------------------------------------------------------------------------
// Ressources
// ----------------------------------------------------------------------------

export const resources = {
  fr: {
    activitybar: frActivitybar,
    characters: frCharacters,
    locations: frLocations,
    common: frCommon,
    dashboard: frDashboard,
    errors: frErrors,
    login: frLogin,
    modules: frModules,
    packages: frPackages,
    projectSettings: frProjectSettings,
    projects: frProjects,
    recovery: frRecovery,
    relations: frRelations,
    register: frRegister,
    settings: frSettings,
    setup: frSetup,
    sidebar: frSidebar,
    statusbar: frStatusbar,
    structure: frStructure,
    synopsis: frSynopsis,
    tabs: frTabs,
    titlebar: frTitlebar,
    unsaved: frUnsaved,
    usermenu: frUsermenu,
    views: frViews,
    welcome: frWelcome,
    workspace: frWorkspace,
    workspaceHome: frWorkspaceHome,
  },
  en: {
    activitybar: enActivitybar,
    characters: enCharacters,
    locations: enLocations,
    common: enCommon,
    dashboard: enDashboard,
    errors: enErrors,
    login: enLogin,
    modules: enModules,
    packages: enPackages,
    projectSettings: enProjectSettings,
    projects: enProjects,
    recovery: enRecovery,
    relations: enRelations,
    register: enRegister,
    settings: enSettings,
    setup: enSetup,
    sidebar: enSidebar,
    statusbar: enStatusbar,
    structure: enStructure,
    synopsis: enSynopsis,
    tabs: enTabs,
    titlebar: enTitlebar,
    unsaved: enUnsaved,
    usermenu: enUsermenu,
    views: enViews,
    welcome: enWelcome,
    workspace: enWorkspace,
    workspaceHome: enWorkspaceHome,
  },
} as const;

export const defaultNS = "common";

// ----------------------------------------------------------------------------
// Préférence enregistrée (propre à l'appareil, comme le thème)
// ----------------------------------------------------------------------------

const LANGUAGE_KEY = "ganis-language";

function getSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);

    if (isLanguage(saved)) {
      return saved;
    }
  } catch {
    /* stockage indisponible : langue par défaut */
  }

  // Tant que toute l'interface n'est pas traduite, on ne suit pas la langue
  // du système : un utilisateur anglophone verrait sinon un mélange dès la
  // première page. Le français reste la valeur par défaut.
  return DEFAULT_LANGUAGE;
}

function applyLanguage(language: string) {
  // Lecteurs d'écran, césure et correcteur orthographique s'appuient dessus.
  document.documentElement.lang = language;

  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    /* ignoré */
  }
}

// ----------------------------------------------------------------------------
// Initialisation
// ----------------------------------------------------------------------------

i18n.on("languageChanged", applyLanguage);

void i18n.use(initReactI18next).init({
  resources,
  lng: getSavedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES,
  ns: [
    "activitybar",
    "characters",
    "common",
    "dashboard",
    "errors",
    "login",
    "modules",
    "packages",
    "projectSettings",
    "projects",
    "recovery",
    "relations",
    "register",
    "settings",
    "setup",
    "sidebar",
    "statusbar",
    "structure",
    "synopsis",
    "tabs",
    "titlebar",
    "unsaved",
    "usermenu",
    "views",
    "welcome",
    "workspace",
    "workspaceHome",
  ],
  defaultNS,
  // Ressources déjà en mémoire : initialisation synchrone, prête avant
  // le premier rendu (pas de Suspense ni de flash de clés brutes).
  initAsync: false,
  interpolation: {
    // React échappe déjà le texte rendu.
    escapeValue: false,
  },
});

/** Change la langue de l'interface et l'enregistre sur cet appareil. */
export function setLanguage(language: Language) {
  return i18n.changeLanguage(language);
}

export default i18n;