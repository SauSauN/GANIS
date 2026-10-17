import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { KindIcon } from "@/components/plot/KindIcon";
import type { PlotLinks } from "@/components/plot/usePlotLinks";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { allTags, EMPTY_FILTER, LINK_KINDS, STATUS_ORDER, visibleLanes, type PlotData, type PlotFilter, type PlotLinkKind } from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore } from "@/stores/plotStore";

export interface PlotView {
  zoom: number;
  kinds: Record<PlotLinkKind, boolean>;
  labels: boolean;
  notes: boolean;
  tension: boolean;
  /** Lignes horizontales entre les moments (les actes restent marqués). */
  rowLines: boolean;
}

interface PlotViewMenuProps {
  projectId: string;
  data: PlotData;
  links: PlotLinks;
  view: PlotView;
  onView: (view: PlotView) => void;
  filter: PlotFilter;
  onFilter: (filter: PlotFilter) => void;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/**
 * « Affichage » : trames montrées, mise en avant (avancement, personnage,
 * lieu, étiquette), types de liens, aperçu du texte, colonne de tension.
 */
export function PlotViewMenu({ projectId, data, links, view, onView, filter, onFilter, anchor, onClose }: PlotViewMenuProps) {
  const { t } = useTranslation("plot");
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const mutate = usePlotStore((s) => s.mutate);

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [anchor, onClose]);

  const tags = allTags(data);
  const usedCharacters = links.characters.filter((c) => data.events.some((e) => e.characterIds.includes(c.id) || e.povId === c.id));
  const usedLocations = links.locations.filter((l) => data.events.some((e) => e.locationId === l.id));
  const check = "size-4 accent-primary";

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t("view.title")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed z-[60] max-h-[75vh] w-[min(330px,calc(100vw-16px))] overflow-y-auto rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-xl"
      style={{ top: position?.top ?? -9999, right: position?.right ?? 0 }}
    >
      <section className="mb-4">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("view.lanes")}</h2>
        <ul className="space-y-1">
          {data.lanes.map((lane) => (
            <li key={lane.id}>
              <label className="flex min-h-7 items-center gap-2">
                <input
                  type="checkbox"
                  className={check}
                  checked={!lane.hidden}
                  onChange={(e) => {
                    if (!e.target.checked && visibleLanes(data).length <= 1) return;
                    mutate(projectId, (d) => {
                      const l = d.lanes.find((x) => x.id === lane.id);
                      if (l) l.hidden = !e.target.checked;
                    });
                  }}
                />
                <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />
                <span className="truncate">{lane.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {data.lanes.some((l) => l.hidden) && (
          <button
            type="button"
            className="mt-1 text-xs text-primary hover:underline"
            onClick={() =>
              mutate(projectId, (d) => {
                for (const l of d.lanes) l.hidden = false;
              })
            }
          >
            {t("view.showAll")}
          </button>
        )}
      </section>

      <section className="mb-4 space-y-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("view.highlight")}</h2>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t("view.status")}</span>
          <select className={cn(fieldClass, "h-8")} value={filter.status} onChange={(e) => onFilter({ ...filter, status: e.target.value as PlotFilter["status"] })}>
            <option value="">{t("view.all")}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t("view.character")}</span>
          <select className={cn(fieldClass, "h-8")} value={filter.characterId} onChange={(e) => onFilter({ ...filter, characterId: e.target.value })}>
            <option value="">{t("view.all")}</option>
            {usedCharacters.map((c) => (
              <option key={c.id} value={c.id}>
                {links.characterName(c.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t("view.location")}</span>
          <select className={cn(fieldClass, "h-8")} value={filter.locationId} onChange={(e) => onFilter({ ...filter, locationId: e.target.value })}>
            <option value="">{t("view.all")}</option>
            {usedLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {tags.length > 0 && (
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("view.tag")}</span>
            <select className={cn(fieldClass, "h-8")} value={filter.tag} onChange={(e) => onFilter({ ...filter, tag: e.target.value })}>
              <option value="">{t("view.all")}</option>
              {tags.map((tag) => (
                <option key={tag.tag} value={tag.tag}>
                  {tag.tag} ({tag.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => onFilter({ ...EMPTY_FILTER, q: filter.q })}>
          {t("view.clear")}
        </button>
      </section>

      <section className="mb-4 space-y-1">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("view.links")}</h2>
        {LINK_KINDS.map((kind) => (
          <label key={kind} className="flex min-h-7 items-center gap-2">
            <input type="checkbox" className={check} checked={view.kinds[kind]} onChange={(e) => onView({ ...view, kinds: { ...view.kinds, [kind]: e.target.checked } })} />
            <KindIcon kind={kind} />
            {t(`kinds.${kind}.name`)}
          </label>
        ))}
        <label className="flex min-h-7 items-center gap-2">
          <input type="checkbox" className={check} checked={view.labels} onChange={(e) => onView({ ...view, labels: e.target.checked })} />
          {t("view.labels")}
        </label>
      </section>

      <section className="space-y-1">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("view.board")}</h2>
        <label className="flex min-h-7 items-center gap-2">
          <input type="checkbox" className={check} checked={view.notes} onChange={(e) => onView({ ...view, notes: e.target.checked })} />
          {t("view.notes")}
        </label>
        <label className="flex min-h-7 items-center gap-2">
          <input type="checkbox" className={check} checked={view.tension} onChange={(e) => onView({ ...view, tension: e.target.checked })} />
          {t("view.tension")}
        </label>
        <label className="flex min-h-7 items-center gap-2" title={t("view.rowLinesHint")}>
          <input type="checkbox" className={check} checked={view.rowLines} onChange={(e) => onView({ ...view, rowLines: e.target.checked })} />
          {t("view.rowLines")}
        </label>
      </section>
    </div>,
    document.body,
  );
}
