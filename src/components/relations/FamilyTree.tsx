import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CircleHelp, ExternalLink, GitFork, Plus, TriangleAlert, X } from "lucide-react";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import { Button } from "@/components/ui/button";
import { fullName } from "@/lib/characters";
import { buildFamilyTree, familyOf, ghostAnchor, isGhost, withGhosts } from "@/lib/familyTree";
import { CARD_H, CARD_W, kinOf, layoutFamilyTree, type FamilyLine, type Kin } from "@/lib/familyTreeLayout";
import { emptyRelation } from "@/lib/relations";
import { cn } from "@/lib/utils";
import type { Character, FamilyLink, Relation, RelationInput } from "@/types";

/*
 * Arbre d'un personnage (Relations › Graphe › Arbre) : sa famille seulement,
 * génération par génération, d'après les relations « Famille » qui précisent
 * leur lien. Un parent jamais mentionné entre deux membres (grand-père sans
 * père, cousin sans parents…) apparaît en « fantôme ».
 * Un clic sur une personne montre sa famille et permet d'en ajouter ; un
 * double clic ouvre sa fiche ; un clic sur un trait modifie le lien.
 */

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Toile : bandes des générations et traits (sous les cartes)
// ----------------------------------------------------------------------------

type CanvasData = {
  width: number;
  height: number;
  rows: number[];
  lines: FamilyLine[];
  activeId: string | null;
  generationLabel: (n: number) => string;
  lineTitle: (line: FamilyLine) => string;
  onLine: (line: FamilyLine) => void;
};
type CanvasNodeType = Node<CanvasData, "canvas">;

const LINE_STYLE: Record<FamilyLine["kind"], { stroke: string; width: number; dash?: string }> = {
  parent: { stroke: "var(--muted-foreground)", width: 1.75 },
  partner: { stroke: "var(--primary)", width: 3 },
  sibling: { stroke: "var(--muted-foreground)", width: 1.5, dash: "5 5" },
  direct: { stroke: "var(--primary)", width: 2, dash: "1 5" },
  cousin: { stroke: "var(--muted-foreground)", width: 2, dash: "1 5" },
};

const CanvasNode = memo(function CanvasNode({ data }: NodeProps<CanvasNodeType>) {
  const { width, height, rows, lines, activeId } = data;
  return (
    <div style={{ width, height }} className="relative">
      {/* Bandes des générations, une sur deux teintée. */}
      {rows.map((y, g) => (
        <div
          key={g}
          className={cn("absolute right-0 left-0 rounded-2xl", g % 2 === 0 ? "bg-muted/40" : "bg-transparent")}
          style={{ top: y - 24, height: CARD_H + 48 }}
        >
          <span className="absolute top-1/2 left-5 -translate-y-1/2 text-[0.7rem] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
            {data.generationLabel(g + 1)}
          </span>
        </div>
      ))}
      <svg width={width} height={height} className="absolute inset-0 overflow-visible" aria-hidden="true">
        {lines.map((line) => {
          const style = LINE_STYLE[line.kind];
          const active = activeId !== null && line.ids.includes(activeId);
          const dimmed = activeId !== null && !active;
          // Trait vers un membre fantôme : discret, et sans relation à modifier.
          const ghostly = line.ids.some(isGhost);
          return (
            <g key={line.key} className="group/line">
              <path
                d={line.d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={active ? style.width + 1 : style.width}
                strokeDasharray={ghostly ? "6 4" : style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dimmed ? 0.2 : ghostly ? 0.55 : 1}
                className={cn("transition-opacity", !ghostly && "group-hover/line:stroke-[var(--primary)]")}
              />
              {/* Zone de clic large, invisible : modifier le lien. */}
              {!ghostly && (
                <path
                  d={line.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="nopan cursor-pointer"
                  style={{ pointerEvents: "stroke" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onLine(line);
                  }}
                >
                  <title>{data.lineTitle(line)}</title>
                </path>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

// Carte d'une personne
// ----------------------------------------------------------------------------

type PersonData = {
  projectId: string;
  character: Character;
  role: string;
  dead: boolean;
  deadLabel: string;
  root: boolean;
  selected: boolean;
  related: boolean;
  dimmed: boolean;
};
type PersonNodeType = Node<PersonData, "person">;

const PersonNode = memo(function PersonNode({ data }: NodeProps<PersonNodeType>) {
  const { character, selected, related, dimmed, root } = data;
  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-card px-3 text-center shadow-sm transition-[opacity,box-shadow,border-color]",
        "hover:border-primary/60 hover:shadow-md",
        root && "border-2 border-primary/70",
        selected && "border-primary shadow-lg ring-2 ring-primary/30",
        related && !selected && "border-primary/50",
        dimmed && "opacity-35",
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", selected || root ? "bg-primary" : related ? "bg-primary/50" : "bg-border")} />
      <CharacterAvatar projectId={data.projectId} character={character} size="lg" className={cn(data.dead && "grayscale")} />
      <span className="line-clamp-2 w-full text-sm leading-tight font-semibold">{fullName(character)}</span>
      {(data.role || data.dead) && (
        <span className="flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
          {data.dead && <span title={data.deadLabel}>†</span>}
          <span className="truncate">{data.role}</span>
        </span>
      )}
    </div>
  );
});

/** Membre de la famille jamais mentionné dans l'histoire. */
type GhostData = { title: string; subtitle: string; hint: string; dimmed: boolean };
type GhostNodeType = Node<GhostData, "ghost">;

const GhostNode = memo(function GhostNode({ data }: NodeProps<GhostNodeType>) {
  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      title={data.hint}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-background/60 px-3 text-center text-muted-foreground transition-opacity",
        data.dimmed ? "opacity-25" : "opacity-80",
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-xl font-semibold">
        ?
      </span>
      <span className="text-sm leading-tight font-medium italic">{data.title}</span>
      <span className="line-clamp-2 w-full text-xs leading-tight">{data.subtitle}</span>
    </div>
  );
});

const nodeTypes = { canvas: CanvasNode, person: PersonNode, ghost: GhostNode };

// Vue
// ----------------------------------------------------------------------------

const LEGEND_KEY = "ganis.familyTree.legend";

type KinToAdd = "parent" | "child" | "partner" | "sibling";

export interface FamilyTreeProps {
  projectId: string;
  characters: Character[];
  /** Relations affichables (filtres de la vue déjà appliqués). */
  relations: Relation[];
  /** Personnage dont on montre l'arbre. */
  rootId: string;
  /** Change quand la place disponible change (plein écran…) : recadrage. */
  fitKey: string;
  onRoot: (id: string) => void;
  onOpenCharacter: (id: string) => void;
  onEditRelation: (relationId: string) => void;
  onCreate: (initial: RelationInput) => void;
}

export function FamilyTree(props: FamilyTreeProps) {
  return (
    <ReactFlowProvider>
      <FamilyTreeCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FamilyTreeCanvas({
  projectId,
  characters,
  relations,
  rootId,
  fitKey,
  onRoot,
  onOpenCharacter,
  onEditRelation,
  onCreate,
}: FamilyTreeProps) {
  const { t } = useTranslation("relations");
  const listLabel = useListLabel();
  const dark = useDarkMode();
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [legendOpen, setLegendOpenState] = useState(() => {
    try {
      return localStorage.getItem(LEGEND_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setLegendOpen = (open: boolean) => {
    setLegendOpenState(open);
    try {
      localStorage.setItem(LEGEND_KEY, open ? "1" : "0");
    } catch {
      /* préférence non retenue */
    }
  };

  // Autre personnage : la sélection repart de zéro.
  useEffect(() => {
    setSelectedId(null);
    setOthersOpen(false);
  }, [rootId]);

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const nameOf = (id: string) => {
    if (isGhost(id)) return t("tree.ghost.title");
    const c = byId.get(id);
    return c ? fullName(c) : "…";
  };

  // Sa famille seulement : de proche en proche par les liens familiaux précis.
  const familyRelations = useMemo(() => {
    const all = relations.filter((r) => r.type === "family" && byId.has(r.sourceId) && byId.has(r.targetId));
    const members = familyOf(all, rootId);
    return all.filter((r) => members.has(r.sourceId) && members.has(r.targetId));
  }, [relations, byId, rootId]);
  const tree = useMemo(
    () => buildFamilyTree(withGhosts(familyRelations), nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [familyRelations],
  );
  const layout = useMemo(() => layoutFamilyTree(tree), [tree]);
  const selected = selectedId && layout.pos.has(selectedId) && !isGhost(selectedId) ? selectedId : null;
  const kin = useMemo(() => (selected ? kinOf(tree, selected) : null), [tree, selected]);
  const relatedIds = useMemo(() => new Set(kin ? Object.values(kin).flat() : []), [kin]);

  // La relation derrière un trait (pour la modifier d'un clic).
  const relationOf = (line: FamilyLine): Relation | undefined => {
    const link: FamilyLink[] =
      line.kind === "direct" ? ["grandparent", "auntUncle"] : line.kind === "cousin" ? ["cousin"] : [line.kind];
    if (line.kind === "parent") {
      const [child, ...parents] = line.ids;
      return familyRelations.find((r) => r.familyLink === "parent" && r.targetId === child && parents.includes(r.sourceId));
    }
    const [a, b] = line.ids;
    return familyRelations.find(
      (r) => r.familyLink && link.includes(r.familyLink) && ((r.sourceId === a && r.targetId === b) || (r.sourceId === b && r.targetId === a)),
    );
  };
  const lineTitle = (line: FamilyLine) => {
    const names =
      line.kind === "parent" ? `${line.ids.slice(1).map(nameOf).join(" & ")} → ${nameOf(line.ids[0])}` : line.ids.map(nameOf).join(" · ");
    return `${t(`tree.legend.${line.kind}`)} : ${names} — ${t("tree.editLink")}`;
  };

  const nodes = useMemo<Node[]>(() => {
    const canvas: CanvasNodeType = {
      id: "canvas",
      type: "canvas",
      position: { x: 0, y: 0 },
      width: layout.width,
      height: layout.height,
      data: {
        width: layout.width,
        height: layout.height,
        rows: layout.rows,
        lines: layout.lines,
        activeId: selected,
        generationLabel: (n) => t("tree.generation", { n }),
        lineTitle,
        onLine: (line) => {
          const r = relationOf(line);
          if (r) onEditRelation(r.id);
        },
      },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      style: { pointerEvents: "none" },
    };
    const dimmedFor = (id: string) => selected !== null && selected !== id && !relatedIds.has(id);
    const people: Array<PersonNodeType | GhostNodeType> = [...layout.pos].flatMap(([id, p]): Array<PersonNodeType | GhostNodeType> => {
      if (isGhost(id)) {
        const { childId, depth } = ghostAnchor(id);
        const of = t(depth <= 1 ? "tree.ghost.of1" : depth === 2 ? "tree.ghost.of2" : "tree.ghost.of3", { name: nameOf(childId) });
        return [
          {
            id,
            type: "ghost",
            position: p,
            width: CARD_W,
            height: CARD_H,
            data: { title: t("tree.ghost.title"), subtitle: of, hint: `${of} — ${t("tree.ghost.hint")}`, dimmed: dimmedFor(id) },
            draggable: false,
            focusable: false,
          },
        ];
      }
      const character = byId.get(id);
      if (!character) return [];
      return [
        {
          id,
          type: "person",
          position: p,
          width: CARD_W,
          height: CARD_H,
          data: {
            projectId,
            character,
            role: character.role ? listLabel("role", character.role) : "",
            dead: character.status === "dead",
            deadLabel: listLabel("status", "dead"),
            root: id === rootId,
            selected: selected === id,
            related: relatedIds.has(id),
            dimmed: dimmedFor(id),
          },
          draggable: false,
          ariaLabel: t("tree.open", { name: fullName(character) }),
        },
      ];
    });
    return [canvas, ...people];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, byId, selected, relatedIds, projectId, rootId, t]);

  // Recadrer quand l'arbre change de forme ou de personnage.
  const initialized = useNodesInitialized();
  const shapeKey = `${rootId}|${layout.width}x${layout.height}|${layout.pos.size}|${fitKey}`;
  useEffect(() => {
    if (!initialized) return;
    const timer = window.setTimeout(() => void fitView({ padding: 0.12, duration: 300, maxZoom: 1.1 }), 30);
    return () => window.clearTimeout(timer);
  }, [initialized, shapeKey, fitView]);

  const focusOn = (id: string) => {
    setSelectedId(id);
    void fitView({ nodes: [{ id }], padding: 1.4, duration: 400, maxZoom: 1.2 });
  };

  const create = (familyLink: FamilyLink, sourceId: string, targetId: string) =>
    onCreate({
      ...emptyRelation(sourceId, targetId),
      type: "family",
      familyLink,
      directed: familyLink === "parent" || familyLink === "grandparent" || familyLink === "auntUncle",
    });

  const addKin = (what: KinToAdd, id: string) => {
    if (what === "parent") create("parent", "", id);
    else if (what === "child") create("parent", id, "");
    else create(what, id, "");
  };

  // Liens de famille à préciser qui touchent cette famille.
  const members = new Set([rootId, ...[...layout.pos.keys()].filter((id) => !isGhost(id))]);
  const others = relations.filter(
    (r) =>
      r.type === "family" &&
      !r.familyLink &&
      (members.has(r.sourceId) || members.has(r.targetId)) &&
      byId.has(r.sourceId) &&
      byId.has(r.targetId),
  );
  const alone = layout.pos.size <= 1;

  return (
    <div className="absolute inset-0">
      {alone ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border bg-card/95 px-8 py-7 text-center shadow-lg">
            <GitFork className="mx-auto mb-3 size-8 text-muted-foreground opacity-50" aria-hidden="true" />
            <p className="text-lg font-semibold">{t("tree.emptyFor", { name: nameOf(rootId) })}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("tree.emptyHint")}</p>
            <div className="mt-5 grid grid-cols-2 gap-1.5">
              {(["parent", "child", "partner", "sibling"] as const).map((what) => (
                <Button key={what} variant="outline" size="sm" onClick={() => addKin(what, rootId)}>
                  <Plus />
                  {t(`tree.addKin.${what}`)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => node.type === "person" && setSelectedId(node.id === selected ? null : node.id)}
          onNodeDoubleClick={(_, node) => node.type === "person" && onOpenCharacter(node.id)}
          onPaneClick={() => setSelectedId(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          colorMode={dark ? "dark" : "light"}
          minZoom={0.1}
          maxZoom={2.5}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={null}
          className="bg-background"
        >
          <Background gap={24} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(node) => (node.type === "person" ? "var(--primary)" : node.type === "ghost" ? "var(--muted-foreground)" : "transparent")}
            nodeStrokeColor="transparent"
            className="!rounded-md !border"
            style={{ width: 160, height: 104 }}
          />
        </ReactFlow>
      )}

      {/* Légende et liens à préciser, sous le choix de la disposition */}
      <div className="absolute top-[4.5rem] left-4 z-10 flex w-72 max-w-[calc(100%-2rem)] flex-col items-start gap-2">
        {!alone && (
          <div className="w-full rounded-xl border bg-card/95 text-xs shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setLegendOpen(!legendOpen)}
              aria-expanded={legendOpen}
              className="flex w-full items-center gap-1.5 px-3 py-2 font-semibold"
            >
              <CircleHelp className="size-3.5 text-muted-foreground" />
              {t("tree.legendTitle")}
            </button>
            {legendOpen && (
              <div className="space-y-1.5 border-t px-3 py-2 text-muted-foreground">
                {(Object.keys(LINE_STYLE) as FamilyLine["kind"][]).map((kind) => (
                  <span key={kind} className="flex items-center gap-2">
                    <svg width="28" height="8" aria-hidden="true" className="shrink-0">
                      <path
                        d="M 2 4 H 26"
                        stroke={LINE_STYLE[kind].stroke}
                        strokeWidth={LINE_STYLE[kind].width}
                        strokeDasharray={LINE_STYLE[kind].dash}
                        strokeLinecap="round"
                      />
                    </svg>
                    {t(`tree.legend.${kind}`)}
                  </span>
                ))}
                <span className="flex items-center gap-2">
                  <span className="h-3 w-7 shrink-0 rounded-sm border-2 border-dashed border-muted-foreground/50" aria-hidden="true" />
                  {t("tree.legend.ghost")}
                </span>
                <p className="pt-1 leading-snug">{t("tree.hint")}</p>
              </div>
            )}
          </div>
        )}

        {others.length > 0 && (
          <div className="relative">
            <Button
              variant={othersOpen ? "secondary" : "outline"}
              size="sm"
              className="bg-card shadow-sm"
              aria-expanded={othersOpen}
              onClick={() => setOthersOpen((o) => !o)}
            >
              <TriangleAlert className="text-amber-500" />
              {t("tree.toSpecify", { count: others.length })}
            </Button>
            {othersOpen && (
              <div className="absolute top-full left-0 z-20 mt-2 w-80 rounded-xl border bg-popover p-2 shadow-lg">
                <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">{t("tree.othersHint")}</p>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {others.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOthersOpen(false);
                          onEditRelation(r.id);
                        }}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{nameOf(r.sourceId)}</span> · <span className="font-medium">{nameOf(r.targetId)}</span>
                        {r.label && <span className="text-muted-foreground"> — {r.label}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && kin && (
        <KinPanel
          id={selected}
          kin={kin}
          nameOf={nameOf}
          isRoot={selected === rootId}
          onClose={() => setSelectedId(null)}
          onGo={focusOn}
          onRoot={() => onRoot(selected)}
          onOpen={() => onOpenCharacter(selected)}
          onAdd={(what) => addKin(what, selected)}
        />
      )}
    </div>
  );
}

// Famille de la personne choisie
// ----------------------------------------------------------------------------

const KIN_ORDER: Array<keyof Kin> = ["parents", "partners", "children", "siblings", "grandparents", "grandchildren", "auntsUncles", "nephews", "cousins"];

function KinPanel({
  id,
  kin,
  nameOf,
  isRoot,
  onClose,
  onGo,
  onRoot,
  onOpen,
  onAdd,
}: {
  id: string;
  kin: Kin;
  nameOf: (id: string) => string;
  isRoot: boolean;
  onClose: () => void;
  onGo: (id: string) => void;
  onRoot: () => void;
  onOpen: () => void;
  onAdd: (what: KinToAdd) => void;
}) {
  const { t } = useTranslation("relations");
  // Les fantômes ne sont pas listés : ils ne sont pas des personnages.
  const real = (key: keyof Kin) => kin[key].filter((other) => !isGhost(other));
  const groups = KIN_ORDER.filter((key) => real(key).length > 0);
  return (
    <aside
      className="absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] w-72 flex-col rounded-xl border bg-card/95 shadow-lg backdrop-blur"
      aria-label={t("tree.kinTitle", { name: nameOf(id) })}
    >
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t("tree.kinOf")}</p>
          <p className="truncate font-semibold">{nameOf(id)}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("tree.close")} title={t("tree.close")}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {groups.length === 0 ? (
          <p className="text-muted-foreground">{t("tree.noKin")}</p>
        ) : (
          groups.map((key) => (
            <div key={key}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`tree.kin.${key}`)}</p>
              <div className="flex flex-wrap gap-1.5">
                {real(key).map((other) => (
                  <button
                    key={other}
                    type="button"
                    onClick={() => onGo(other)}
                    className="rounded-full border px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary"
                  >
                    {nameOf(other)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        <div className="grid grid-cols-2 gap-1.5">
          {(["parent", "child", "partner", "sibling"] as const).map((what) => (
            <Button key={what} variant="outline" size="sm" onClick={() => onAdd(what)}>
              <Plus />
              {t(`tree.addKin.${what}`)}
            </Button>
          ))}
        </div>
        {!isRoot && (
          <Button variant="outline" size="sm" className="w-full" onClick={onRoot}>
            <GitFork />
            {t("tree.showTree")}
          </Button>
        )}
        <Button variant="secondary" size="sm" className="w-full" onClick={onOpen}>
          <ExternalLink />
          {t("tree.openSheet")}
        </Button>
      </div>
    </aside>
  );
}
