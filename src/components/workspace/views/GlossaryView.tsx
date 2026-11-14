import { useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  BookA,
  Drama,
  Flag,
  Loader2,
  MapPinned,
  Package,
  PawPrint,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { categoriesOf, filterTerms, groupByLetter } from "@/lib/glossary";
import { itemTabId } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectGlossary, useGlossaryStore } from "@/stores/glossaryStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useWorldEntries } from "@/stores/worldStore";
import type { GlossaryInput, GlossaryLink, GlossaryLinkKind, GlossaryTerm } from "@/types";

/** Limites appliquées aussi côté Rust (voir `glossary_service.rs`). */
const MAX_TERM = 200;
const MAX_CATEGORY = 100;
const MAX_DEFINITION = 20_000;
const MAX_LINKS = 50;

const KINDS: GlossaryLinkKind[] = ["character", "location", "item", "species", "faction", "people", "magic"];

const KIND_ICONS: Record<GlossaryLinkKind, LucideIcon> = {
  character: UserRound,
  location: MapPinned,
  item: Package,
  species: PawPrint,
  faction: Flag,
  people: Drama,
  magic: Zap,
};

/** Filtre « sans catégorie » de la liste déroulante. */
const NO_CATEGORY = "\u0000none";

interface Sheet {
  kind: GlossaryLinkKind;
  id: string;
  name: string;
}

/** Toutes les fiches du projet que le glossaire peut citer, par sorte. */
function useSheets(projectId: string): Record<GlossaryLinkKind, Sheet[]> {
  const { characters } = useProjectCharacters(projectId);
  const { locations } = useProjectLocations(projectId);
  const item = useWorldEntries(projectId, "item").entries;
  const species = useWorldEntries(projectId, "species").entries;
  const faction = useWorldEntries(projectId, "faction").entries;
  const people = useWorldEntries(projectId, "people").entries;
  const magic = useWorldEntries(projectId, "magic").entries;

  return useMemo(() => {
    const byName = (a: Sheet, b: Sheet) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const world = (kind: GlossaryLinkKind, list: Array<{ id: string; name: string }>) =>
      list.map((entry) => ({ kind, id: entry.id, name: entry.name })).sort(byName);
    return {
      character: characters.map((c) => ({ kind: "character" as const, id: c.id, name: fullName(c) })).sort(byName),
      location: world("location", locations),
      item: world("item", item),
      species: world("species", species),
      faction: world("faction", faction),
      people: world("people", people),
      magic: world("magic", magic),
    };
  }, [characters, locations, item, species, faction, people, magic]);
}

const sheetKey = (link: GlossaryLink) => `${link.kind}:${link.id}`;

interface GlossaryViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Glossaire du projet (Détails › Glossaire) : les termes propres à
 * l'histoire, par ordre alphabétique et regroupés par lettre. Recherche
 * dans le terme, la définition et la catégorie ; filtre par catégorie.
 * Chaque terme peut citer des fiches, qui s'ouvrent d'un clic.
 */
export function GlossaryView({ projectId, feature, onOpenFeature }: GlossaryViewProps) {
  const { t } = useTranslation("glossary");
  const { terms, loaded, error, reload } = useProjectGlossary(projectId);
  const deleteTerm = useGlossaryStore((state) => state.deleteTerm);
  const sheets = useSheets(projectId);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  /** Terme ouvert dans la fenêtre : `null` pour un nouveau, absent si fermée. */
  const [editing, setEditing] = useState<GlossaryTerm | null | undefined>(undefined);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const groupRefs = useRef(new Map<string, HTMLElement>());

  const categories = useMemo(() => categoriesOf(terms), [terms]);
  const filter = category === NO_CATEGORY ? "" : category;
  const visible = useMemo(() => filterTerms(terms, query, filter), [terms, query, filter]);
  const groups = useMemo(() => groupByLetter(visible), [visible]);

  /** Nom d'une fiche liée ; `null` si elle n'existe plus (supprimée depuis). */
  const sheetName = (link: GlossaryLink) => sheets[link.kind].find((sheet) => sheet.id === link.id)?.name ?? null;

  async function remove(term: GlossaryTerm) {
    setDeleteError(null);
    try {
      await deleteTerm(projectId, term.id);
    } catch (cause) {
      setDeleteError(errorText(cause));
    }
  }

  const createButton = (
    <Button onClick={() => setEditing(null)}>
      <Plus />
      {t("add")}
    </Button>
  );

  return (
    <PageShell title={feature.label} info={t("description")} actions={createButton}>
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">
          {error}
          <Button size="sm" variant="outline" onClick={() => void reload()}>
            <RefreshCw />
            {t("retry")}
          </Button>
        </div>
      )}
      {deleteError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {!loaded && error ? null : !loaded ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("loading")}
        </p>
      ) : loaded && terms.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BookA className="size-7" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
          <p className="mt-2 mb-6 max-w-md text-sm text-muted-foreground">{t("empty.text")}</p>
          {createButton}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="pl-8"
              />
            </div>

            <select
              aria-label={t("categoryFilter")}
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value || null)}
              className={cn(fieldClass, "h-9 w-52")}
            >
              <option value="">{t("allCategories")}</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              {terms.some((term) => !term.category.trim()) && <option value={NO_CATEGORY}>{t("noCategory")}</option>}
            </select>

            <span className="text-sm text-muted-foreground" aria-live="polite">
              {t("count", { count: visible.length })}
            </span>
          </div>

          {groups.length > 1 && (
            <nav aria-label={t("letters")} className="mb-6 flex flex-wrap gap-1">
              {groups.map((group) => (
                <button
                  key={group.letter}
                  type="button"
                  onClick={() => groupRefs.current.get(group.letter)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="flex size-7 items-center justify-center rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {group.letter}
                </button>
              ))}
            </nav>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <section
                  key={group.letter}
                  aria-labelledby={`glossary-letter-${group.letter}`}
                  ref={(node) => {
                    if (node) groupRefs.current.set(group.letter, node);
                    else groupRefs.current.delete(group.letter);
                  }}
                  className="scroll-mt-4"
                >
                  <h2 id={`glossary-letter-${group.letter}`} className="mb-3 border-b pb-1 text-xl font-semibold text-primary">
                    {group.letter}
                  </h2>
                  <dl className="flex flex-col divide-y">
                    {group.terms.map((term) => (
                      <div key={term.id} className="group flex gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <dt className="flex flex-wrap items-baseline gap-2">
                            <span className="font-semibold">{term.term}</span>
                            {term.category && (
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{term.category}</span>
                            )}
                          </dt>
                          <dd className="mt-1 text-sm leading-6 whitespace-pre-line text-muted-foreground">
                            {term.definition || <span className="italic">{t("noDefinition")}</span>}
                          </dd>
                          {term.links.some((link) => sheetName(link) !== null) && (
                            <dd className="mt-2 flex flex-wrap gap-1.5">
                              {term.links.map((link) => {
                                const name = sheetName(link);
                                const tab = itemTabId(link.kind, link.id);
                                if (name === null || !tab) return null;
                                const Icon = KIND_ICONS[link.kind];
                                return (
                                  <button
                                    key={sheetKey(link)}
                                    type="button"
                                    onClick={() => onOpenFeature(tab)}
                                    title={t("openSheet", { kind: t(`kinds.${link.kind}`), name })}
                                    className="inline-flex max-w-60 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  >
                                    <Icon className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{name}</span>
                                  </button>
                                );
                              })}
                            </dd>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditing(term)}
                            aria-label={t("edit", { name: term.term })}
                            title={t("edit", { name: term.term })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void remove(term)}
                            aria-label={t("delete", { name: term.term })}
                            title={t("delete", { name: term.term })}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {editing !== undefined && (
        <TermDialog
          projectId={projectId}
          term={editing}
          categories={categories}
          sheets={sheets}
          onClose={() => setEditing(undefined)}
        />
      )}
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Fenêtre d'ajout et de modification
// ----------------------------------------------------------------------------

interface TermDialogProps {
  projectId: string;
  /** `null` : nouveau terme. */
  term: GlossaryTerm | null;
  categories: string[];
  sheets: Record<GlossaryLinkKind, Sheet[]>;
  onClose: () => void;
}

function TermDialog({ projectId, term, categories, sheets, onClose }: TermDialogProps) {
  const { t } = useTranslation("glossary");
  const { t: tc } = useTranslation("common");
  const createTerm = useGlossaryStore((state) => state.createTerm);
  const updateTerm = useGlossaryStore((state) => state.updateTerm);

  const [name, setName] = useState(term?.term ?? "");
  const [category, setCategory] = useState(term?.category ?? "");
  const [definition, setDefinition] = useState(term?.definition ?? "");
  // Les fiches supprimées depuis disparaissent à l'enregistrement.
  const [links, setLinks] = useState<GlossaryLink[]>(
    () => term?.links.filter((link) => sheets[link.kind].some((sheet) => sheet.id === link.id)) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = new Set(links.map(sheetKey));
  const nameOf = (link: GlossaryLink) => sheets[link.kind].find((sheet) => sheet.id === link.id)?.name ?? "?";
  const available = KINDS.filter((kind) => sheets[kind].some((sheet) => !linked.has(sheetKey(sheet))));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("form.termRequired"));
      return;
    }
    const input: GlossaryInput = { term: name.trim(), category: category.trim(), definition: definition.trim(), links };
    setBusy(true);
    setError(null);
    try {
      if (term) await updateTerm(projectId, term.id, input);
      else await createTerm(projectId, input);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      className="max-w-xl"
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogHeader>
          <DialogTitle>{term ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <div className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="glossary-term">{t("form.term")}</Label>
              <Input
                id="glossary-term"
                value={name}
                maxLength={MAX_TERM}
                autoFocus
                required
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.termPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="glossary-category">{t("form.category")}</Label>
              <Input
                id="glossary-category"
                value={category}
                maxLength={MAX_CATEGORY}
                list="glossary-categories"
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("form.categoryPlaceholder")}
              />
              <datalist id="glossary-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="glossary-definition">{t("form.definition")}</Label>
            <textarea
              id="glossary-definition"
              value={definition}
              maxLength={MAX_DEFINITION}
              rows={5}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder={t("form.definitionPlaceholder")}
              className={cn(fieldClass, "min-h-28 resize-y py-2 leading-6")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="glossary-link">{t("form.links")}</Label>
            {links.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {links.map((link) => {
                  const Icon = KIND_ICONS[link.kind];
                  const label = nameOf(link);
                  return (
                    <li key={sheetKey(link)} className="inline-flex max-w-60 items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
                      <Icon className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{label}</span>
                      <button
                        type="button"
                        onClick={() => setLinks((list) => list.filter((item) => sheetKey(item) !== sheetKey(link)))}
                        aria-label={t("form.removeLink", { name: label })}
                        title={t("form.removeLink", { name: label })}
                        className="rounded-full p-0.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {available.length > 0 && links.length < MAX_LINKS ? (
              <select
                id="glossary-link"
                value=""
                onChange={(e) => {
                  const [kind, ...rest] = e.target.value.split(":");
                  const id = rest.join(":");
                  if (kind && id) setLinks((list) => [...list, { kind: kind as GlossaryLinkKind, id }]);
                }}
                className={cn(fieldClass, "h-9")}
              >
                <option value="">{t("form.addLink")}</option>
                {available.map((kind) => (
                  <optgroup key={kind} label={t(`kinds.${kind}`)}>
                    {sheets[kind]
                      .filter((sheet) => !linked.has(sheetKey(sheet)))
                      .map((sheet) => (
                        <option key={sheet.id} value={sheetKey(sheet)}>
                          {sheet.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              links.length === 0 && <p className="text-sm text-muted-foreground">{t("form.noSheets")}</p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? tc("actions.saving") : tc("actions.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
