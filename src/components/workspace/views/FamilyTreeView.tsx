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
import { CircleHelp, ExternalLink, GitFork, Loader2, Maximize2, Minimize2, Plus, TriangleAlert, X } from "lucide-react";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import { RelationDialog } from "@/components/relations/RelationDialog";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { characterTabId, fullName } from "@/lib/characters";
import { buildFamilyTree } from "@/lib/familyTree";
import { CARD_H, CARD_W, kinOf, layoutFamilyTree, type FamilyLine, type Kin } from "@/lib/familyTreeLayout";
import { emptyRelation, inputFromRelation } from "@/lib/relations";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectRelations } from "@/stores/relationStore";
import type { Character, FamilyLink, Relation, RelationInput } from "@/types";

/*
 * Arbre généalogique (Personnages › Arbre généalogique) : les relations
 * « Famille » qui précisent leur lien, génération par génération, sur une
 * toile qu'on zoome et qu'on déplace comme le graphe des relations.
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
          return (
            <g key={line.key} className="group/line">
              <path
                d={line.d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={active ? style.width + 1 : style.width}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dimmed ? 0.2 : 1}
                className="transition-opacity group-hover/line:stroke-[var(--primary)]"
              />
              {/* Zone de clic large, invisible : modifier le lien. */}
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
  selected: boolean;
  related: boolean;
  dimmed: boolean;
};
type PersonNodeType = Node<PersonData, "person">;

const PersonNode = memo(function PersonNode({ data }: NodeProps<PersonNodeType>) {
  const { character, selected, related, dimmed } = data;
  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-card px-3 text-center shadow-sm transition-[opacity,box-shadow,border-color]",
        "hover:border-primary/60 hover:shadow-md",
        selected && "border-primary shadow-lg ring-2 ring-primary/30",
        related && !selected && "border-primary/50",
        dimmed && "opacity-35",
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", selected ? "bg-primary" : related ? "bg-primary/50" : "bg-border")} />
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

const nodeTypes = { canvas: CanvasNode, person: PersonNode };

// Vue
// ----------------------------------------------------------------------------

const LEGEND_KEY = "ganis.familyTree.legend";

type DialogState = { relationId: string | null; initial: RelationInput | null };

export function FamilyTreeView(props: { projectId: string; feature: WorkspaceFeature; onOpenFeature: (featureId: string) => void }) {
  return (
    <ReactFlowProvider>
      <FamilyTreeCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FamilyTreeCanvas({
  projectId,
  feature,
  onOpenFeature,
}: {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation("relations");
  const listLabel = useListLabel();
  const dark = useDarkMode();
  const { fitView } = useReactFlow();
  const { characters, loaded: charactersLoaded } = useProjectCharacters(projectId);
  const { relations, loaded } = useProjectRelations(projectId);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
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

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const nameOf = (id: string) => {
    const c = byId.get(id);
    return c ? fullName(c) : "…";
  };
  const familyRelations = useMemo(
    () => relations.filter((r) => r.type === "family" && byId.has(r.sourceId) && byId.has(r.targetId)),
    [relations, byId],
  );
  const tree = useMemo(
    () => buildFamilyTree(familyRelations, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [familyRelations],
  );
  const layout = useMemo(() => layoutFamilyTree(tree), [tree]);
  const selected = selectedId && layout.pos.has(selectedId) ? selectedId : null;
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
    const names = line.kind === "parent" ? `${line.ids.slice(1).map(nameOf).join(" & ")} → ${nameOf(line.ids[0])}` : line.ids.map(nameOf).join(" · ");
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
          if (r) setDialog({ relationId: r.id, initial: inputFromRelation(r) });
        },
      },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      style: { pointerEvents: "none" },
    };
    const people: PersonNodeType[] = [...layout.pos].flatMap(([id, p]) => {
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
            selected: selected === id,
            related: relatedIds.has(id),
            dimmed: selected !== null && selected !== id && !relatedIds.has(id),
          },
          draggable: false,
          ariaLabel: t("tree.open", { name: fullName(character) }),
        },
      ];
    });
    return [canvas, ...people];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, byId, selected, relatedIds, projectId, t]);

  // Recadrer quand l'arbre change de forme.
  const initialized = useNodesInitialized();
  const shapeKey = `${layout.width}x${layout.height}|${layout.pos.size}|${fullscreen}`;
  useEffect(() => {
    if (!initialized) return;
    const timer = window.setTimeout(() => void fitView({ padding: 0.12, duration: 300, maxZoom: 1.1 }), 30);
    return () => window.clearTimeout(timer);
  }, [initialized, shapeKey, fitView]);

  // Échap : quitter le plein écran, sinon désélectionner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || dialog) return;
      if (fullscreen) setFullscreen(false);
      else setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, dialog]);

  const focusOn = (id: string) => {
    setSelectedId(id);
    void fitView({ nodes: [{ id }], padding: 1.4, duration: 400, maxZoom: 1.2 });
  };

  const create = (familyLink: FamilyLink, sourceId: string, targetId: string) =>
    setDialog({
      relationId: null,
      initial: {
        ...emptyRelation(sourceId, targetId),
        type: "family",
        familyLink,
        directed: familyLink === "parent" || familyLink === "grandparent" || familyLink === "auntUncle",
      },
    });

  const ready = loaded && charactersLoaded;
  const members = [...layout.pos.keys()].filter((id) => byId.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const placedLinks = familyRelations.length - tree.others.length;

  return (
    <main className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-background", fullscreen && "fixed inset-0 z-40")}>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
        <h1 className="sr-only">{feature.label}</h1>
        {ready && members.length > 0 && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {t("tree.people", { count: members.length })} · {t("tree.links", { count: placedLinks })}
          </span>
        )}

        <div className="mx-auto" />

        {ready && members.length > 0 && (
          <>
            <select
              aria-label={t("tree.find")}
              value=""
              onChange={(e) => e.target.value && focusOn(e.target.value)}
              className="h-9 max-w-56 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("tree.find")}</option>
              {members.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>

            {tree.others.length > 0 && (
              <div className="relative">
                <Button variant={othersOpen ? "secondary" : "ghost"} size="lg" aria-expanded={othersOpen} onClick={() => setOthersOpen((o) => !o)}>
                  <TriangleAlert className="text-amber-500" />
                  {t("tree.toSpecify", { count: tree.others.length })}
                </Button>
                {othersOpen && (
                  <div className="absolute top-full right-0 z-20 mt-2 w-80 rounded-xl border bg-popover p-2 shadow-lg">
                    <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">{t("tree.othersHint")}</p>
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                      {tree.others.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setOthersOpen(false);
                              setDialog({ relationId: r.id, initial: inputFromRelation(r) });
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

            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? t("view.exitFullscreen") : t("view.fullscreen")}
              aria-label={fullscreen ? t("view.exitFullscreen") : t("view.fullscreen")}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </>
        )}

        <Button size="lg" onClick={() => create("parent", "", selected ?? "")}>
          <Plus />
          {t("tree.add")}
        </Button>
      </header>

      {!ready ? (
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("tree.loading")}
        </p>
      ) : members.length === 0 ? (
        <div className="m-6 max-w-xl rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <GitFork className="mx-auto mb-3 size-8 opacity-40" aria-hidden="true" />
          <p className="font-medium text-foreground">{t("tree.empty")}</p>
          <p className="mt-1">{t("tree.emptyHint")}</p>
          {tree.others.length > 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setOthersOpen(true)}>
              {t("tree.toSpecify", { count: tree.others.length })}
            </Button>
          )}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => node.type === "person" && setSelectedId(node.id === selected ? null : node.id)}
            onNodeDoubleClick={(_, node) => node.type === "person" && onOpenFeature(characterTabId(node.id))}
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
              nodeColor={(node) => (node.type === "person" ? "var(--primary)" : "transparent")}
              nodeStrokeColor="transparent"
              className="!rounded-md !border"
              style={{ width: 160, height: 104 }}
            />
          </ReactFlow>

          {/* Légende, posée sur la toile */}
          <div className="absolute top-4 left-4 z-10 max-w-72 rounded-xl border bg-card/95 text-xs shadow-sm backdrop-blur">
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
                <p className="pt-1 leading-snug">{t("tree.hint")}</p>
              </div>
            )}
          </div>

          {selected && kin && (
            <KinPanel
              id={selected}
              kin={kin}
              nameOf={nameOf}
              onClose={() => setSelectedId(null)}
              onGo={focusOn}
              onOpen={() => onOpenFeature(characterTabId(selected))}
              onAdd={(what) => {
                if (what === "parent") create("parent", "", selected);
                else if (what === "child") create("parent", selected, "");
                else create(what, selected, "");
              }}
            />
          )}
        </div>
      )}

      <RelationDialog
        projectId={projectId}
        open={dialog !== null}
        relationId={dialog?.relationId ?? null}
        initial={dialog?.initial ?? null}
        onClose={() => setDialog(null)}
      />
    </main>
  );
}

// Famille de la personne choisie
// ----------------------------------------------------------------------------

const KIN_ORDER: Array<keyof Kin> = ["parents", "partners", "children", "siblings", "grandparents", "grandchildren", "auntsUncles", "nephews", "cousins"];

function KinPanel({
  id,
  kin,
  nameOf,
  onClose,
  onGo,
  onOpen,
  onAdd,
}: {
  id: string;
  kin: Kin;
  nameOf: (id: string) => string;
  onClose: () => void;
  onGo: (id: string) => void;
  onOpen: () => void;
  onAdd: (what: "parent" | "child" | "partner" | "sibling") => void;
}) {
  const { t } = useTranslation("relations");
  const groups = KIN_ORDER.filter((key) => kin[key].length > 0);
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
                {kin[key].map((other) => (
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
        <Button variant="secondary" size="sm" className="w-full" onClick={onOpen}>
          <ExternalLink />
          {t("tree.openSheet")}
        </Button>
      </div>
    </aside>
  );
}
