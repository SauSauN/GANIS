import { useMemo } from "react";
import { WorldThumb } from "@/components/world/WorldVisuals";
import { worldTabId } from "@/lib/world";
import { useEnabledWorldModules, useWorldEntries } from "@/stores/worldStore";
import type { NodeEntryLink, NodeEntryRole, WorldModule } from "@/types";

/*
 * Fiches du monde (objets, faune et flore, factions, peuples, magie) sur la
 * fiche d'un élément du découpage : la section « Univers », sur le modèle
 * des personnages et des lieux. Une fiche est désignée par « sorte:id ».
 */

export const ENTRY_ROLES: NodeEntryRole[] = ["central", "present", "mentioned"];

const MODULES: WorldModule[] = ["item", "species", "faction", "people", "magic"];

/** « item:abc » → sorte et identifiant. */
export function splitEntryKey(key: string): { kind: WorldModule; id: string } {
  const [kind, ...rest] = key.split(":");
  return { kind: kind as WorldModule, id: rest.join(":") };
}

export const entryKey = (kind: WorldModule, id: string) => `${kind}:${id}`;

/**
 * Fiches proposées (modules activés, plus celles déjà liées d'un module
 * désactivé depuis), avec leurs vignettes, et celles dont c'est la première
 * apparition.
 */
export function useNodeEntryItems(projectId: string, nodeId: string, links: NodeEntryLink[] | null) {
  const enabled = useEnabledWorldModules(projectId);
  const slices = {
    item: useWorldEntries(projectId, "item"),
    species: useWorldEntries(projectId, "species"),
    faction: useWorldEntries(projectId, "faction"),
    people: useWorldEntries(projectId, "people"),
    magic: useWorldEntries(projectId, "magic"),
  };

  return useMemo(() => {
    const mine = (links ?? []).filter((link) => link.nodeId === nodeId);
    const linkedKinds = new Set(mine.map((link) => link.kind));
    const items = MODULES.filter((module) => enabled[module] || linkedKinds.has(module)).flatMap((module) => {
      const slice = slices[module];
      return slice.entries.map((entry) => ({
        id: entryKey(module, entry.id),
        name: entry.name,
        visual: <WorldThumb projectId={projectId} module={module} entry={entry} customTypes={slice.settings.customTypes} size="sm" />,
        chip: <WorldThumb projectId={projectId} module={module} entry={entry} customTypes={slice.settings.customTypes} size="xs" className="rounded-full" />,
        tab: worldTabId(module, entry.id),
        firstAppearance: entry.fields.firstAppearance === nodeId,
      }));
    });
    const known = new Set(items.map((item) => item.id));
    const direct = mine.map((link) => ({ id: entryKey(link.kind, link.entryId), role: link.role })).filter((link) => known.has(link.id));
    const firstHere = items.filter((item) => item.firstAppearance).map((item) => item.id);
    return { items, direct, firstHere, anyModule: MODULES.some((module) => enabled[module]) || direct.length > 0 };
    // Les tranches changent avec leurs fiches ; `enabled` avec les réglages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, nodeId, links, enabled, slices.item.entries, slices.species.entries, slices.faction.entries, slices.people.entries, slices.magic.entries]);
}
