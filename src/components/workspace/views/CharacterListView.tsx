import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownAZ,
  LayoutGrid,
  Loader2,
  Plus,
  Rows3,
  Search,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarFace, CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import {
  PageShell,
  fieldClass,
} from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import {
  characterTabId,
  draftFromCharacter,
  fullName,
  levelProgress,
  levelsUpTo,
  listValues,
  parseList,
} from "@/lib/characters";
import { cn } from "@/lib/utils";
import { usePortraitUrl, useProjectCharacters } from "@/stores/characterStore";
import { useProjectRelations } from "@/stores/relationStore";
import type { Character, CharacterDetailLevel } from "@/types";

interface CharacterListViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

type Layout = "grid" | "table";
type Sort = "name" | "recent" | "completion" | "role";

/** Réglages d'affichage mémorisés sur l'appareil. */
const PREFS_KEY = "ganis.characterList.view";

interface Prefs {
  layout: Layout;
  sort: Sort;
}

function loadPrefs(): Prefs {
  try {
    return { layout: "grid", sort: "name", ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { layout: "grid", sort: "name" };
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage indisponible : réglages pour cette session seulement.
  }
}

/** Texte sans accents ni majuscules, pour la recherche. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/** Recherche dans le nom, l'alias, la profession, l'origine et la description. */
function matches(character: Character, query: string): boolean {
  if (!query.trim()) return true;

  const f = character.fields;
  const haystack = normalize(
    [fullName(character), f.nickname, f.occupation, f.origin, f.description].filter(Boolean).join(" "),
  );

  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Part de la fiche remplie (0 à 1), sur les niveaux du projet. */
function completion(character: Character, level: CharacterDetailLevel): number {
  const draft = draftFromCharacter(character);
  const images = { portrait: character.portraitUpdatedAt !== null, gallery: character.galleryCount };
  let filled = 0;
  let total = 0;

  for (const item of levelsUpTo(level)) {
    const progress = levelProgress(draft, item, images);
    filled += progress.filled;
    total += progress.total;
  }

  return total > 0 ? filled / total : 0;
}

/**
 * Liste des personnages.
 *
 * - Chiffres clés par rôle (cliquables pour filtrer).
 * - Recherche (nom, alias, profession, origine, description), filtre par
 *   statut, tri (nom, récents, fiche la plus remplie, rôle).
 * - Deux affichages : grandes cartes ou tableau compact.
 */
export function CharacterListView({ projectId, feature, onOpenFeature }: CharacterListViewProps) {
  const { t } = useTranslation(["characters", "relations"]);
  const listLabel = useListLabel();
  const { characters, lists, detailLevel, loaded, error, reload } = useProjectCharacters(projectId);
  const { relations } = useProjectRelations(projectId);

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const level = detailLevel ?? "basic";

  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });

  /** Nombre de relations de chaque personnage. */
  const relationCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of relations) {
      count.set(r.sourceId, (count.get(r.sourceId) ?? 0) + 1);
      count.set(r.targetId, (count.get(r.targetId) ?? 0) + 1);
    }
    return count;
  }, [relations]);

  const completionOf = useMemo(
    () => new Map(characters.map((c) => [c.id, completion(c, level)])),
    [characters, level],
  );

  // Rôles et statuts présents, dans l'ordre des listes du projet.
  const ordered = (list: "role" | "status", used: string[]) => {
    const known = listValues(lists, list);
    return [...known.filter((v) => used.includes(v)), ...used.filter((v) => !known.includes(v))];
  };
  const roles = ordered("role", [...new Set(characters.map((c) => c.role))]);
  const statuses = ordered("status", [...new Set(characters.map((c) => c.status))]);

  const visible = useMemo(() => {
    const roleOrder = listValues(lists, "role");
    const filtered = characters.filter(
      (c) => (!role || c.role === role) && (!status || c.status === status) && matches(c, query),
    );

    return [...filtered].sort((a, b) => {
      switch (prefs.sort) {
        case "recent":
          return b.updatedAt.localeCompare(a.updatedAt);
        case "completion":
          return (completionOf.get(b.id) ?? 0) - (completionOf.get(a.id) ?? 0);
        case "role": {
          const ra = roleOrder.indexOf(a.role) + 1 || 99;
          const rb = roleOrder.indexOf(b.role) + 1 || 99;
          if (ra !== rb) return ra - rb;
          break;
        }
      }
      return fullName(a).localeCompare(fullName(b), undefined, { sensitivity: "base" });
    });
  }, [characters, role, status, query, prefs.sort, lists, completionOf]);

  const filtering = query.trim() !== "" || role !== null || status !== "";
  const open = (id: string) => onOpenFeature(characterTabId(id));

  const createButton = (
    <Button size="lg" onClick={() => onOpenFeature("characters.create")}>
      <Plus />
      {t("list.create")}
    </Button>
  );

  // ---------------------------------------------------------------------------
  // Chargement, liste vide
  // ---------------------------------------------------------------------------

  if (!loaded) {
    return (
      <PageShell title={feature.label}>
        {error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void reload()}>{t("list.retry")}</Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("list.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  if (characters.length === 0) {
    return (
      <PageShell title={feature.label}>
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-8 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="size-8" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">{t("list.emptyTitle")}</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("list.emptyDescription")}</p>
          <div className="mt-6">{createButton}</div>
        </div>
      </PageShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Liste
  // ---------------------------------------------------------------------------

  return (
    <PageShell title={feature.label} description={t("list.count", { count: characters.length })} actions={createButton}>
      {/* Chiffres clés : un bloc par rôle, cliquable pour filtrer */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t("fields.role")}>
        <StatTile
          label={t("list.allRoles")}
          value={characters.length}
          active={role === null}
          onClick={() => setRole(null)}
        />
        {roles.map((value) => (
          <StatTile
            key={value}
            label={listLabel("role", value)}
            value={characters.filter((c) => c.role === value).length}
            active={role === value}
            onClick={() => setRole(role === value ? null : value)}
          />
        ))}
      </div>

      {/* Recherche, statut, tri, affichage */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
            aria-label={t("list.search")}
            className="h-10 pl-9"
          />
        </div>

        <select
          aria-label={t("fields.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={cn(fieldClass, "h-10 w-44")}
        >
          <option value="">{t("list.allStatuses")}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>{listLabel("status", value)}</option>
          ))}
        </select>

        <label className="relative">
          <span className="sr-only">{t("list.sortLabel")}</span>
          <ArrowDownAZ className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={prefs.sort}
            onChange={(e) => updatePrefs({ sort: e.target.value as Sort })}
            className={cn(fieldClass, "h-10 w-52 pl-9")}
          >
            {(["name", "recent", "completion", "role"] as const).map((value) => (
              <option key={value} value={value}>{t(`list.sort.${value}`)}</option>
            ))}
          </select>
        </label>

        <div role="radiogroup" aria-label={t("list.layoutLabel")} className="flex rounded-lg border bg-card p-1">
          {([
            ["grid", LayoutGrid],
            ["table", Rows3],
          ] as const).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={prefs.layout === value}
              title={t(`list.layout.${value}`)}
              aria-label={t(`list.layout.${value}`)}
              onClick={() => updatePrefs({ layout: value })}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors",
                prefs.layout === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {filtering && (
        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          <span aria-live="polite">{t("list.results", { count: visible.length })}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setRole(null);
              setStatus("");
            }}
          >
            <X />
            {t("list.clearFilters")}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          {t("list.noMatch")}
        </div>
      ) : prefs.layout === "grid" ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((character) => (
            <li key={character.id}>
              <CharacterCard
                projectId={projectId}
                character={character}
                completion={completionOf.get(character.id) ?? 0}
                relations={relationCount.get(character.id) ?? 0}
                onOpen={() => open(character.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <CharacterTable
          projectId={projectId}
          characters={visible}
          completionOf={completionOf}
          relationCount={relationCount}
          onOpen={open}
        />
      )}
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Chiffre clé
// ----------------------------------------------------------------------------

function StatTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2.5 rounded-full border px-4 text-sm transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/60",
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "min-w-6 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
        )}
      >
        {value}
      </span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Carte
// ----------------------------------------------------------------------------

/** Barre de remplissage de la fiche. */
function CompletionBar({ value }: { value: number }) {
  const { t } = useTranslation("characters");
  const percent = Math.round(value * 100);

  return (
    <span className="flex items-center gap-2" title={t("list.completion", { percent })}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{percent} %</span>
    </span>
  );
}

function CharacterCard({
  projectId,
  character,
  completion,
  relations,
  onOpen,
}: {
  projectId: string;
  character: Character;
  completion: number;
  relations: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation(["characters", "relations"]);
  const listLabel = useListLabel();
  const url = usePortraitUrl(projectId, character);
  const name = fullName(character);
  const { nickname, occupation, description } = character.fields;
  const palette = parseList(character.fields.colorPalette);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      {/* Bandeau derrière la photo : les couleurs de la palette en priorité,
          sinon la photo floutée, sinon la couleur du thème. */}
      <span className="relative block h-24 overflow-hidden bg-muted">
        {palette.length > 0 ? (
          <span
            className="block size-full"
            style={{
              background:
                palette.length === 1
                  ? palette[0]
                  : `linear-gradient(120deg, ${palette.join(", ")})`,
            }}
          />
        ) : url ? (
          <img src={url} alt="" className="size-full scale-125 object-cover opacity-60 blur-xl" />
        ) : (
          <span className="block size-full bg-gradient-to-br from-primary/15 to-primary/5" />
        )}

        <span className="absolute top-3 right-3 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium shadow-sm">
          {listLabel("role", character.role)}
        </span>
      </span>

      <span className="-mt-10 flex flex-1 flex-col gap-3 px-5 pb-5">
        <AvatarFace
          colorKey={character.id}
          name={name}
          url={url}
          size="lg"
          className="relative z-10 size-20 border-4 border-card text-2xl ring-0 shadow-sm"
        />

        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold group-hover:text-primary">{name}</span>
          {(nickname || occupation) && (
            <span className="block truncate text-sm text-muted-foreground">
              {[nickname && `« ${nickname} »`, occupation].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>

        {description ? (
          <span className="line-clamp-3 text-sm leading-6 text-muted-foreground">{description}</span>
        ) : (
          <span className="text-sm text-muted-foreground/60 italic">{t("list.noDescription")}</span>
        )}

        <span className="mt-auto space-y-3 pt-1">
          <CompletionBar value={completion} />

          <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {character.status !== "alive" && (
                <span className="rounded-full border px-2 py-0.5">{listLabel("status", character.status)}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <Waypoints className="size-3.5" aria-hidden="true" />
                {t("relations:view.count", { count: relations })}
              </span>
            </span>

            {palette.length > 0 && (
              <span className="flex -space-x-1">
                {palette.slice(0, 5).map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="size-4 rounded-full border-2 border-card"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Tableau compact
// ----------------------------------------------------------------------------

function CharacterTable({
  projectId,
  characters,
  completionOf,
  relationCount,
  onOpen,
}: {
  projectId: string;
  characters: Character[];
  completionOf: Map<string, number>;
  relationCount: Map<string, number>;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation("characters");
  const listLabel = useListLabel();

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-5 py-3 font-medium">{t("list.columns.character")}</th>
            <th className="px-4 py-3 font-medium">{t("fields.role")}</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">{t("fields.occupation")}</th>
            <th className="px-4 py-3 font-medium">{t("fields.status")}</th>
            <th className="hidden w-40 px-4 py-3 font-medium lg:table-cell">{t("list.columns.completion")}</th>
            <th className="w-24 px-4 py-3 text-right font-medium">{t("list.columns.relations")}</th>
          </tr>
        </thead>
        <tbody>
          {characters.map((character) => (
            <tr
              key={character.id}
              tabIndex={0}
              onClick={() => onOpen(character.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(character.id))}
              className="cursor-pointer border-b last:border-0 hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
            >
              <td className="px-5 py-3">
                <span className="flex items-center gap-3">
                  <CharacterAvatar projectId={projectId} character={character} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{fullName(character)}</span>
                    {character.fields.nickname && (
                      <span className="block truncate text-xs text-muted-foreground italic">
                        {character.fields.nickname}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {listLabel("role", character.role)}
                </span>
              </td>
              <td className="hidden max-w-48 truncate px-4 py-3 text-muted-foreground md:table-cell">
                {character.fields.occupation || "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{listLabel("status", character.status)}</td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <CompletionBar value={completionOf.get(character.id) ?? 0} />
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                {relationCount.get(character.id) ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
