import { useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Replace, Search } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { toast } from "@/stores/toastStore";
import { notifyNovelTextChanged } from "@/lib/novelEvents";
import { adaptCase, groupMatches, matchKey } from "@/lib/novelReplace";
import { buildStructureTree, flattenVisible, STRUCTURE_NODE_TAB_PREFIX, structureNodeTabId } from "@/lib/structure";
import { saveEntries, useUnsavedStore } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import { refreshWriting } from "@/stores/writingStore";
import type { FindOptions, FindResult, Project, ReplaceResult } from "@/types";

interface ReplaceViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Rechercher et remplacer dans le texte de toutes les scènes (roman).
 * Chaque occurrence se coche ; le remplacement garde une version de chaque
 * scène modifiée et peut être annulé tout de suite.
 */
export function ReplaceView({ project, feature, onOpenFeature }: ReplaceViewProps) {
  const { t } = useTranslation(["novel", "common"]);
  const { structure, labelOf } = useProjectStructure(project.id);
  const applyNode = useStructureStore((s) => s.applyNode);

  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  /** Résultat et options de la dernière recherche. */
  const [result, setResult] = useState<{ options: FindOptions; found: FindResult } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"search" | "replace" | null>(null);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "novel:replace");
  };
  const [done, setDone] = useState<{ result: ReplaceResult; undone: boolean } | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  // Ordre du plan, pour lister les scènes comme dans le livre.
  const order = useMemo(() => {
    const map = new Map<string, number>();
    flattenVisible(buildStructureTree(structure?.nodes ?? []), new Set()).forEach((node, index) => map.set(node.id, index));
    return map;
  }, [structure]);
  const nodeOf = (id: string) => structure?.nodes.find((n) => n.id === id);
  const groups = useMemo(() => (result ? groupMatches(result.found.matches, order) : []), [result, order]);

  /** Enregistre d'abord les textes de scène en cours d'écriture. */
  async function saveOpenScenes(): Promise<boolean> {
    const entries = useUnsavedStore.getState().entries;
    const ids = Object.keys(entries).filter((id) => id.startsWith(STRUCTURE_NODE_TAB_PREFIX));
    const failed = await saveEntries(ids);
    if (failed.length) {
      setError(t("replace.unsaved", { names: failed.map((id) => entries[id]?.label ?? id).join(", ") }));
      return false;
    }
    return true;
  }

  async function search(options: FindOptions, keepMessage = false) {
    setBusy("search");
    setError(null);
    if (!keepMessage) setDone(null);
    try {
      if (!(await saveOpenScenes())) return;
      const found = await api.findInManuscript(project.id, options);
      setResult({ options, found });
      setSelected(new Set(found.matches.map(matchKey)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      queryRef.current?.focus();
      return;
    }
    void search({ query, caseSensitive, wholeWord });
  }

  async function replace() {
    if (!result) return;
    setBusy("replace");
    setError(null);
    try {
      if (!(await saveOpenScenes())) return;
      const targets = result.found.nodes
        .map((node) => ({
          nodeId: node.id,
          updatedAt: node.updatedAt,
          indices: result.found.matches.filter((m) => m.nodeId === node.id && selected.has(matchKey(m))).map((m) => m.index),
        }))
        .filter((target) => target.indices.length > 0);
      const versionName = t("replace.versionName", { from: result.options.query, to: replacement || t("replace.empty") });
      const outcome = await api.replaceInManuscript(project.id, result.options, replacement, targets, versionName);
      outcome.nodes.forEach(({ node }) => applyNode(project.id, node));
      notifyNovelTextChanged(project.id, outcome.nodes.map(({ node }) => node.id));
      refreshWriting(project.id);
      setDone({ result: outcome, undone: false });
      // Résultat en notification (rien ne bouge dans la page), avec « Annuler ».
      toast({
        tone: "success",
        key: `replace:${project.id}`,
        duration: 15000,
        message: t("replace.done", { count: outcome.replaced, scenes: t("replace.scenes", { count: outcome.nodes.length }) }),
        action: { label: t("replace.undo"), run: () => undo(outcome) },
      });
      setBusy(null);
      await search(result.options, true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function undo(replaced: ReplaceResult | undefined = done && !done.undone ? done.result : undefined) {
    if (!replaced) return;
    setBusy("replace");
    setError(null);
    try {
      for (const { node, before } of replaced.nodes) {
        applyNode(project.id, await api.setStructureNodeContent(project.id, node.id, before));
      }
      notifyNovelTextChanged(project.id, replaced.nodes.map(({ node }) => node.id));
      refreshWriting(project.id);
      setDone({ result: replaced, undone: true });
      toast({ tone: "success", key: `replace:${project.id}`, message: t("replace.undone") });
      setBusy(null);
      if (result) await search(result.options, true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const toggle = (keys: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
      return next;
    });

  const allKeys = result?.found.matches.map(matchKey) ?? [];
  const count = allKeys.filter((key) => selected.has(key)).length;
  const preview = (text: string) => (result && !result.options.caseSensitive ? adaptCase(text, replacement) : replacement);

  return (
    <PageShell title={feature.label} description={t("replace.hint")}>
      <div className="space-y-5">
        <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              {t("replace.find")}
              <input ref={queryRef} value={query} maxLength={500} placeholder={t("common:placeholders.find")} onChange={(e) => setQuery(e.target.value)} className={fieldClass} autoFocus />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              {t("replace.replaceWith")}
              <input value={replacement} maxLength={500} placeholder={t("common:placeholders.replaceWith")} onChange={(e) => setReplacement(e.target.value)} className={fieldClass} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="size-4 accent-primary" />
              {t("replace.caseSensitive")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="size-4 accent-primary" />
              {t("replace.wholeWord")}
            </label>
            <Button type="submit" className="ml-auto" disabled={busy !== null}>
              {busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}
              {busy === "search" ? t("replace.searching") : t("replace.search")}
            </Button>
          </div>
        </form>



        {result && (
          <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
              <p className="text-sm font-medium tabular-nums">
                {result.found.total === 0
                  ? t("replace.none")
                  : t("replace.results", { count: result.found.total, scenes: t("replace.scenes", { count: result.found.nodes.length }) })}
              </p>
              {result.found.total > 0 && (
                <>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelected(new Set(count === allKeys.length ? [] : allKeys))}>
                    {count === allKeys.length ? t("replace.selectNone") : t("replace.selectAll")}
                  </Button>
                  <Button className="ml-auto" disabled={count === 0 || busy !== null} onClick={() => void replace()}>
                    {busy === "replace" ? <Loader2 className="animate-spin" /> : <Replace />}
                    {busy === "replace" ? t("replace.applying") : t("replace.apply", { count })}
                  </Button>
                </>
              )}
            </header>
            {result.found.truncated && <p className="border-b px-5 py-2 text-xs text-muted-foreground">{t("replace.truncated", { count: result.found.matches.length })}</p>}
            <div className="divide-y">
              {groups.map((group) => {
                const node = nodeOf(group.nodeId);
                const keys = group.matches.map(matchKey);
                const checked = keys.filter((key) => selected.has(key)).length;
                return (
                  <div key={group.nodeId} className="px-5 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={node ? labelOf(node) : group.nodeId}
                        checked={checked === keys.length}
                        ref={(el) => {
                          if (el) el.indeterminate = checked > 0 && checked < keys.length;
                        }}
                        onChange={(e) => toggle(keys, e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      <button
                        type="button"
                        className="min-w-0 truncate text-sm font-medium hover:underline"
                        onClick={() => onOpenFeature(structureNodeTabId(group.nodeId))}
                      >
                        {node ? labelOf(node) : "—"}
                      </button>
                      <span className="text-xs text-muted-foreground tabular-nums">{group.matches.length}</span>
                    </div>
                    <ul className="space-y-1 pl-6">
                      {group.matches.map((match) => {
                        const key = matchKey(match);
                        const on = selected.has(key);
                        return (
                          <li key={key}>
                            <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60">
                              <input type="checkbox" checked={on} onChange={(e) => toggle([key], e.target.checked)} className="mt-1 size-3.5 shrink-0 accent-primary" />
                              <span className={cn("min-w-0 font-serif leading-6", !on && "opacity-60")}>
                                <span className="text-muted-foreground">{match.before}</span>
                                <mark className={cn("rounded-sm px-0.5 text-foreground", on ? "bg-destructive/15 line-through decoration-destructive/70" : "bg-warning/25")}>
                                  {match.text}
                                </mark>
                                {on && replacement && <ins className="rounded-sm bg-success/20 px-0.5 text-foreground no-underline">{preview(match.text)}</ins>}
                                <span className="text-muted-foreground">{match.after}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
