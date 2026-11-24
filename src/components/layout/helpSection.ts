import { findFeature, SETTINGS_PREFIX } from "@/components/workspace/modules";

/** Rubriques de l'aide intégrée, dans l'ordre de la liste. Textes : `help.json` → `center.sections.<id>` (et `center.faq`). */
export const CENTER_SECTIONS = ["start", "workspace", "details", "characters", "locations", "items", "species", "factions", "peoples", "magic", "structure", "manuscript", "script", "screen", "reading", "plot", "notes", "search", "history", "files", "settings", "about", "faq"] as const;
export type CenterSection = (typeof CENTER_SECTIONS)[number];

/** Onglets qui ont leur propre rubrique (sinon : celle de leur module). */
const TAB_SECTIONS: Record<string, CenterSection> = {
  "structure.read": "reading",
  history: "history",
  trash: "history",
};

/** Modules dont la rubrique n'a pas leur nom. */
const MODULE_SECTIONS: Record<string, CenterSection> = {
  // Scénario d'une série ou d'un film : une rubrique commune.
  screenplay: "screen",
  film: "screen",
};

/**
 * Rubrique de l'aide qui parle de l'onglet affiché : l'aide s'ouvre
 * dessus, comme les paramètres du projet s'ouvrent sur la section du
 * module. Aucun onglet, ou rien qui en parle : « L'espace de travail ».
 */
export function helpSectionOfTab(tabId: string | null): CenterSection {
  if (!tabId) return "workspace";
  if (tabId.startsWith(SETTINGS_PREFIX)) return "settings";
  if (TAB_SECTIONS[tabId]) return TAB_SECTIONS[tabId];
  const moduleId = findFeature(tabId)?.module.id;
  if (!moduleId) return "workspace";
  if (MODULE_SECTIONS[moduleId]) return MODULE_SECTIONS[moduleId];
  return (CENTER_SECTIONS as readonly string[]).includes(moduleId) ? (moduleId as CenterSection) : "workspace";
}
