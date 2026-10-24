import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { blankEvent } from "@/components/plot/actions";
import type { PlotLinks } from "@/components/plot/usePlotLinks";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { actsInOrder, applyTemplate, customBeats, newId, parseSteps, PLOT_TEMPLATES, rowsCount, type PlotData } from "@/lib/plot";
import { cn } from "@/lib/utils";
import { usePlotStore } from "@/stores/plotStore";
import { toast } from "@/stores/toastStore";

/** Modèles de structure : place les actes et étapes sur les moments (ou rien du tout). */
export function PlotTemplatesDialog({ open, projectId, data, onClose }: { open: boolean; projectId: string; data: PlotData; onClose: () => void }) {
  const { t: typed } = useTranslation(["plot", "common"]);
  const t = typed as unknown as (key: string, options?: Record<string, unknown>) => string;
  const mutate = usePlotStore((s) => s.mutate);
  const [rows, setRows] = useState(rowsCount(data));
  const [replace, setReplace] = useState(true);
  /** Modèle de l'auteur en cours d'écriture (`id` vide : nouveau). */
  const [draft, setDraft] = useState<{ id: string; name: string; steps: string } | null>(null);
  const hasActs = Object.keys(data.acts).length > 0;

  useEffect(() => {
    if (open) {
      setRows(rowsCount(data));
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function applyNamed(name: string, beats: number[], names: string[]) {
    mutate(projectId, (d) => applyTemplate(d, beats, names, rows, replace));
    toast({ message: t("templates.applied", { name }), tone: "success" });
    onClose();
  }

  function apply(id: string, beats: number[]) {
    const names = t(`templates.${id}.beats`, { returnObjects: true }) as unknown as string[];
    applyNamed(t(`templates.${id}.name`), beats, Array.isArray(names) ? names : []);
  }

  function clearActs() {
    mutate(projectId, (d) => {
      d.acts = {};
    });
    toast({ message: t("templates.cleared"), tone: "success", action: { label: t("undo"), run: () => usePlotStore.getState().undo() } });
    onClose();
  }

  function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim().slice(0, 80);
    const steps = parseSteps(draft.steps);
    if (!name || !steps.length) return;
    mutate(projectId, (d) => {
      const existing = d.templates.find((x) => x.id === draft.id);
      if (existing) {
        existing.name = name;
        existing.steps = steps;
      } else {
        d.templates.push({ id: newId(), name, steps });
      }
    });
    setDraft(null);
  }

  function removeTemplate(id: string) {
    mutate(projectId, (d) => {
      d.templates = d.templates.filter((x) => x.id !== id);
    });
  }

  const card = "flex h-full w-full flex-col items-start rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const draftSteps = draft ? parseSteps(draft.steps) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{t("templates.title")}</DialogTitle>
        <DialogDescription>{t("templates.description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          {t("templates.rows")}
          <input type="number" min={4} value={rows} placeholder={t("common:placeholders.rows")} onChange={(e) => setRows(Math.max(4, Number.parseInt(e.target.value, 10) || 4))} className={cn(fieldClass, "h-8 w-20")} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-primary" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          {t("templates.replace")}
        </label>
      </div>

      <div className="mt-4 max-h-[58vh] space-y-5 overflow-y-auto pr-1">
        {/* Les modèles de l'auteur */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("templates.mine")}</h3>
            {!draft && (
              <div className="flex gap-1.5">
                {hasActs && (
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ id: "", name: "", steps: actsInOrder(data).join("\n") })}>
                    {t("templates.fromActs")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setDraft({ id: "", name: "", steps: "" })}>
                  <Plus />
                  {t("templates.create")}
                </Button>
              </div>
            )}
          </div>

          {draft && (
            <div className="mb-3 rounded-lg border bg-muted/30 p-3">
              <label className="block text-xs font-semibold text-muted-foreground">
                {t("templates.name")}
                <input autoFocus value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("templates.namePlaceholder")} className={cn(fieldClass, "mt-1 h-8")} />
              </label>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                {t("templates.stepsLabel")}
                <textarea rows={6} value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} placeholder={t("templates.stepsPlaceholder")} className={cn(fieldClass, "mt-1 resize-y py-2 leading-6 font-normal")} />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">{t("templates.stepsHint", { count: draftSteps.length })}</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  {t("dialogs.cancel")}
                </Button>
                <Button size="sm" disabled={!draft.name.trim() || !draftSteps.length} onClick={saveDraft}>
                  {t("templates.save")}
                </Button>
              </div>
            </div>
          )}

          {data.templates.length === 0 && !draft ? (
            <p className="text-xs text-muted-foreground">{t("templates.mineEmpty")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.templates.map((tpl) => (
                <li key={tpl.id} className="group/tpl relative">
                  <button type="button" onClick={() => applyNamed(tpl.name, customBeats(tpl.steps), tpl.steps)} className={cn(card, "pr-16")}>
                    <span className="flex w-full items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{tpl.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("templates.steps", { count: tpl.steps.length })}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{tpl.steps.join(" · ")}</span>
                  </button>
                  <span className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover/tpl:opacity-100 focus-within:opacity-100">
                    <Button variant="ghost" size="icon-xs" aria-label={t("templates.edit", { name: tpl.name })} title={t("templates.edit", { name: tpl.name })} onClick={() => setDraft({ id: tpl.id, name: tpl.name, steps: tpl.steps.join("\n") })}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="hover:text-destructive" aria-label={t("templates.remove", { name: tpl.name })} title={t("templates.remove", { name: tpl.name })} onClick={() => removeTemplate(tpl.id)}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Les modèles connus */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("templates.known")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PLOT_TEMPLATES.map((tpl) => (
              <li key={tpl.id}>
                <button type="button" onClick={() => apply(tpl.id, tpl.beats)} className={card}>
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="font-semibold">{t(`templates.${tpl.id}.name`)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("templates.steps", { count: tpl.beats.length })}</span>
                  </span>
                  <span className="mt-1 text-xs leading-5 text-muted-foreground">{t(`templates.${tpl.id}.description`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <DialogFooter className="mt-4 flex-wrap gap-2">
        {hasActs && (
          <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={clearActs}>
            {t("templates.clear")}
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          {t("templates.none")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function PlotStructureImportDialog({ open, projectId, data, links, onClose }: { open: boolean; projectId: string; data: PlotData; links: PlotLinks; onClose: () => void }) {
  const { t } = useTranslation(["plot", "common"]);
  const { levels } = useProjectStructure(projectId);
  const mutate = usePlotStore((s) => s.mutate);
  const [level, setLevel] = useState(1);
  const [laneId, setLaneId] = useState(data.lanes.find((l) => l.main)?.id ?? data.lanes[0]?.id ?? "");
  const [skip, setSkip] = useState(true);

  useEffect(() => {
    if (!open) return;
    const counts = levels.map((_, i) => links.nodes.filter((n) => n.level === i).length);
    // Par défaut : le deuxième niveau (chapitres, séquences…) s'il existe.
    setLevel(counts[1] ? 1 : Math.max(0, counts.findIndex((c) => c > 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const linked = new Set(data.events.map((e) => e.nodeId).filter(Boolean));
  const candidates = links.nodes.filter((n) => n.level === level && (!skip || !linked.has(n.id)));

  function run() {
    if (!candidates.length) return;
    mutate(projectId, (d) => {
      const rows = d.events.filter((e) => e.laneId === laneId).map((e) => e.row);
      let row = rows.length ? Math.max(...rows) + 1 : 0;
      for (const node of candidates) {
        const event = blankEvent(laneId, links.nodeLabel(node.id) ?? t("untitled"));
        event.note = node.summary ?? "";
        event.nodeId = node.id;
        event.row = row++;
        d.events.push(event);
      }
    });
    toast({ message: t("import.done", { count: candidates.length }), tone: "success" });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("import.title")}</DialogTitle>
        <DialogDescription>{t("import.description")}</DialogDescription>
      </DialogHeader>
      {links.nodes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("import.noStructure")}</p>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("import.level")}</span>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={cn(fieldClass, "h-9")}>
              {levels.map((l, i) => (
                <option key={l.id} value={i}>
                  {l.other} ({links.nodes.filter((n) => n.level === i).length})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("import.lane")}</span>
            <select value={laneId} onChange={(e) => setLaneId(e.target.value)} className={cn(fieldClass, "h-9")}>
              {data.lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
            {t("import.skip")}
          </label>
          <p className="text-muted-foreground">{t("import.count", { count: candidates.length })}</p>
        </div>
      )}
      <DialogFooter className="mt-5 gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("dialogs.cancel")}
        </Button>
        <Button disabled={!candidates.length} onClick={run}>
          {t("import.confirm", { count: candidates.length })}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
