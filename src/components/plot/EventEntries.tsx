import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { input } from "@/components/plot/panelParts";
import type { PlotEntryRef, PlotEvent } from "@/lib/plot";
import { cn } from "@/lib/utils";
import { worldTabId } from "@/lib/world";
import { useEnabledWorldModules, useWorldEntries } from "@/stores/worldStore";
import type { WorldModule } from "@/types";

const MODULES: WorldModule[] = ["item", "species", "faction", "people", "magic"];

/**
 * Fiches du monde présentes dans un événement de la trame (objets, faune et
 * flore, factions, peuples, magie) : des pastilles qui ouvrent la fiche, et
 * une liste pour en ajouter. Seuls les modules activés sont proposés ; une
 * fiche supprimée depuis n'est pas affichée.
 */
export function EventEntries({
  projectId,
  event,
  onChange,
  onOpenFeature,
}: {
  projectId: string;
  event: PlotEvent;
  onChange: (entries: PlotEntryRef[]) => void;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation(["plot", "world"]);
  const enabled = useEnabledWorldModules(projectId);
  const slices = {
    item: useWorldEntries(projectId, "item").entries,
    species: useWorldEntries(projectId, "species").entries,
    faction: useWorldEntries(projectId, "faction").entries,
    people: useWorldEntries(projectId, "people").entries,
    magic: useWorldEntries(projectId, "magic").entries,
  };
  const modules = MODULES.filter((module) => enabled[module]);
  if (!modules.length && !event.entries.length) return null;

  const nameOf = (ref: PlotEntryRef) => slices[ref.kind].find((entry) => entry.id === ref.id)?.name ?? null;
  const present = event.entries.filter((ref) => nameOf(ref) !== null);
  const taken = new Set(event.entries.map((ref) => `${ref.kind}:${ref.id}`));

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("event.entries")}</span>
      <div className="flex flex-wrap gap-1.5">
        {present.map((ref) => {
          const name = nameOf(ref)!;
          return (
            <span key={`${ref.kind}:${ref.id}`} className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-xs">
              <button type="button" className="hover:underline" title={t(`world:links.kinds.${ref.kind}`)} onClick={() => onOpenFeature(worldTabId(ref.kind, ref.id))}>
                {name}
              </button>
              <button
                type="button"
                aria-label={t("event.removeEntry", { name })}
                title={t("event.removeEntry", { name })}
                onClick={() => onChange(event.entries.filter((item) => !(item.kind === ref.kind && item.id === ref.id)))}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
      {modules.some((module) => slices[module].some((entry) => !taken.has(`${module}:${entry.id}`))) && (
        <select
          aria-label={t("event.addEntry")}
          value=""
          onChange={(e) => {
            const [kind, ...rest] = e.target.value.split(":");
            const id = rest.join(":");
            if (kind && id) onChange([...event.entries, { kind: kind as WorldModule, id }]);
          }}
          className={cn(input, "mt-1.5")}
        >
          <option value="">{t("event.addEntry")}</option>
          {modules.map((module) => {
            const free = slices[module].filter((entry) => !taken.has(`${module}:${entry.id}`));
            return free.length ? (
              <optgroup key={module} label={t(`world:links.kinds.${module}`)}>
                {free.map((entry) => (
                  <option key={entry.id} value={`${module}:${entry.id}`}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      )}
    </div>
  );
}
