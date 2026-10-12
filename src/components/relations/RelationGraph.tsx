import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useInternalNode,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { fullName } from "@/lib/characters";
import { useRelationColors } from "@/components/relations/useRelationColors";
import { parallelOffsets, type Point, type Positions } from "@/lib/relations";
import { cn } from "@/lib/utils";
import type { Character, Relation } from "@/types";

/*
 * Graphe des relations (React Flow).
 *
 * - Un nœud par personnage : son avatar et son nom. Les positions données
 *   sont celles du centre de l'avatar.
 * - Un lien par relation, du centre d'un avatar à l'autre (lien
 *   « flottant ») : couleur du type, épaisseur selon l'intensité, pointillés
 *   si la relation est négative, flèche si elle est à sens unique. Plusieurs
 *   relations entre deux personnages sont dessinées en arcs écartés.
 */

/** Largeur d'un nœud et rayon de son avatar (px). */
const NODE_WIDTH = 168;
const AVATAR_RADIUS = 40;

// ----------------------------------------------------------------------------
// Thème clair / sombre de React Flow
// ----------------------------------------------------------------------------

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

// ----------------------------------------------------------------------------
// Nœud : un personnage
// ----------------------------------------------------------------------------

type CharacterNodeData = {
  projectId: string;
  character: Character;
  dimmed: boolean;
  highlighted: boolean;
  selected: boolean;
  /** Distance au personnage central (disposition « centré »). */
  ring?: number;
};

type CharacterNodeType = Node<CharacterNodeData, "character">;

const CharacterNode = memo(function CharacterNode({ data }: NodeProps<CharacterNodeType>) {
  return (
    <div
      className={cn(
        "group flex flex-col items-center gap-2 transition-opacity",
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH }}
    >
      <div
        className={cn(
          "relative rounded-full bg-background p-1 shadow-md ring-[3px] transition-shadow",
          data.selected ? "ring-primary" : data.highlighted ? "ring-amber-400" : "ring-border",
        )}
      >
        <CharacterAvatar projectId={data.projectId} character={data.character} size="xl" className="size-20 text-2xl ring-0" />

        {/* Toute la surface reçoit une relation… */}
        <Handle
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          className="!absolute !inset-0 !size-full !translate-0 !rounded-full !border-0 !bg-transparent"
        />
        {/* …et la pastille « + » en démarre une. */}
        <Handle
          type="source"
          position={Position.Right}
          className="!size-6 !rounded-full !border-[3px] !border-background !bg-primary opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <span
        className={cn(
          "max-w-full truncate rounded-md bg-background/90 px-2 py-0.5 text-center text-sm font-semibold shadow-sm",
          data.selected && "text-primary",
        )}
      >
        {fullName(data.character)}
      </span>
    </div>
  );
});

// ----------------------------------------------------------------------------
// Fond d'un groupe (disposition « par rôle »)
// ----------------------------------------------------------------------------

type GroupNodeType = Node<{ label: string; size: number }, "group-bg">;

function GroupNode({ data }: NodeProps<GroupNodeType>) {
  return (
    <div
      className="pointer-events-none relative rounded-full border-2 border-dashed border-border/80 bg-muted/30"
      style={{ width: data.size, height: data.size }}
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border bg-background px-3 py-0.5 text-xs font-semibold whitespace-nowrap text-muted-foreground">
        {data.label}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Lien : une relation
// ----------------------------------------------------------------------------

type RelationEdgeData = {
  relation: Relation;
  offset: number;
  label: string;
  showLabel: boolean;
  dimmed: boolean;
};

type RelationEdgeType = Edge<RelationEdgeData, "relation">;

/** Centre de l'avatar d'un nœud mesuré. */
function avatarCenter(node: ReturnType<typeof useInternalNode>): Point | null {
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  return { x: x + (node.measured.width ?? NODE_WIDTH) / 2, y: y + AVATAR_RADIUS + 4 };
}

function RelationEdge({ id, source, target, data, markerEnd, selected }: EdgeProps<RelationEdgeType>) {
  const from = avatarCenter(useInternalNode(source));
  const to = avatarCenter(useInternalNode(target));
  const colors = useRelationColors();

  if (!from || !to || !data) return null;

  const { relation } = data;
  const color = colors[relation.type];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const ux = dx / length;
  const uy = dy / length;

  // Point de contrôle : écarté perpendiculairement selon le rang de l'arc.
  const bend = data.offset * 90;
  const control = { x: (from.x + to.x) / 2 - uy * bend, y: (from.y + to.y) / 2 + ux * bend };

  // Extrémités au bord des avatars (la flèche reste visible).
  const towards = (p: Point, q: Point, distance: number) => {
    const l = Math.max(Math.hypot(q.x - p.x, q.y - p.y), 1);
    return { x: p.x + ((q.x - p.x) / l) * distance, y: p.y + ((q.y - p.y) / l) * distance };
  };
  const start = towards(from, control, AVATAR_RADIUS + 4);
  const end = towards(to, control, AVATAR_RADIUS + (relation.directed ? 8 : 4));

  const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  const mid = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={relation.directed ? markerEnd : undefined}
        interactionWidth={24}
        style={{
          stroke: color,
          strokeWidth: 1.5 + relation.intensity * 0.9 + (selected ? 2 : 0),
          strokeDasharray: relation.sentiment === "negative" ? "6 5" : undefined,
          opacity: data.dimmed ? 0.12 : 0.9,
          transition: "opacity 150ms",
        }}
      />

      {data.showLabel && !data.dimmed && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-full border-2 bg-background/95 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
              borderColor: color,
              color,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { character: CharacterNode, "group-bg": GroupNode };
const edgeTypes = { relation: RelationEdge };

// ----------------------------------------------------------------------------
// Graphe
// ----------------------------------------------------------------------------

export interface GraphGroup {
  key: string;
  label: string;
  center: Point;
  radius: number;
}

interface RelationGraphProps {
  projectId: string;
  characters: Character[];
  relations: Relation[];
  /** Centre de l'avatar de chaque personnage. */
  positions: Positions;
  groups?: GraphGroup[];
  /** Change quand la disposition change : le graphe est recadré. */
  layoutKey: string;
  selectedId: string | null;
  highlightIds: Set<string>;
  /** Personnages estompés (pas dans le voisinage du personnage choisi…). */
  dimmedIds: Set<string>;
  showLabels: boolean;
  labelOf: (relation: Relation) => string;
  onSelect: (characterId: string | null) => void;
  onOpenCharacter: (characterId: string) => void;
  onEditRelation: (relationId: string) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  /** Fin d'un déplacement à la main (centre de l'avatar). */
  onMoved: (characterId: string, center: Point) => void;
}

function toNodePosition(center: Point): Point {
  return { x: center.x - NODE_WIDTH / 2, y: center.y - AVATAR_RADIUS - 4 };
}

function GraphCanvas(props: RelationGraphProps) {
  const {
    projectId,
    characters,
    relations,
    positions,
    groups,
    layoutKey,
    selectedId,
    highlightIds,
    dimmedIds,
    showLabels,
    labelOf,
    onSelect,
    onOpenCharacter,
    onEditRelation,
    onConnect,
    onMoved,
  } = props;

  const dark = useDarkMode();
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);

  // Nœuds reconstruits quand les données changent (les positions données
  // remplacent celles d'un déplacement non enregistré).
  useEffect(() => {
    const groupNodes: GroupNodeType[] = (groups ?? []).map((group) => ({
      id: `group:${group.key}`,
      type: "group-bg",
      position: { x: group.center.x - group.radius, y: group.center.y - group.radius },
      data: { label: group.label, size: group.radius * 2 },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
    }));

    const characterNodes: CharacterNodeType[] = characters.map((character) => ({
      id: character.id,
      type: "character",
      position: toNodePosition(positions[character.id] ?? { x: 0, y: 0 }),
      data: {
        projectId,
        character,
        dimmed: dimmedIds.has(character.id),
        highlighted: highlightIds.has(character.id),
        selected: selectedId === character.id,
      },
    }));

    setNodes([...groupNodes, ...characterNodes]);
  }, [characters, positions, groups, projectId, dimmedIds, highlightIds, selectedId]);

  // Recadrage une fois les nœuds mesurés, puis quand la disposition ou le
  // nombre de personnages change.
  const initialized = useNodesInitialized();

  useEffect(() => {
    if (!initialized) return;
    const timer = window.setTimeout(() => void fitView({ padding: 0.25, duration: 300 }), 30);
    return () => window.clearTimeout(timer);
  }, [initialized, layoutKey, characters.length, fitView]);

  const relationColors = useRelationColors();

  const edges = useMemo<RelationEdgeType[]>(() => {
    const offsets = parallelOffsets(relations);

    return relations.map((relation) => ({
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      type: "relation",
      markerEnd: { type: MarkerType.ArrowClosed, color: relationColors[relation.type], width: 16, height: 16 },
      data: {
        relation,
        offset: offsets.get(relation.id) ?? 0,
        label: labelOf(relation),
        showLabel: showLabels,
        dimmed: dimmedIds.has(relation.sourceId) || dimmedIds.has(relation.targetId),
      },
    }));
  }, [relations, showLabels, labelOf, dimmedIds, relationColors]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => node.type === "character" && onSelect(node.id === selectedId ? null : node.id)}
      onNodeDoubleClick={(_, node) => node.type === "character" && onOpenCharacter(node.id)}
      onNodeDragStop={(_, node) =>
        node.type === "character" &&
        onMoved(node.id, {
          x: node.position.x + NODE_WIDTH / 2,
          y: node.position.y + AVATAR_RADIUS + 4,
        })
      }
      onEdgeClick={(_, edge) => onEditRelation(edge.id)}
      onPaneClick={() => onSelect(null)}
      onConnect={(connection: Connection) =>
        connection.source &&
        connection.target &&
        connection.source !== connection.target &&
        onConnect(connection.source, connection.target)
      }
      connectionMode={ConnectionMode.Loose}
      connectionLineStyle={{ strokeWidth: 2, strokeDasharray: "4 4" }}
      colorMode={dark ? "dark" : "light"}
      minZoom={0.15}
      maxZoom={2.5}
      fitView
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
        nodeColor={(node) => (node.type === "character" ? "var(--primary)" : "transparent")}
        className="!rounded-md !border"
        style={{ width: 150, height: 100 }}
      />
    </ReactFlow>
  );
}

/** Graphe des relations (fournit son propre contexte React Flow). */
export function RelationGraph(props: RelationGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
