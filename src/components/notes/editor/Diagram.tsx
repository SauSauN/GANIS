import { memo, useEffect, useRef, useState } from "react";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import { ArrowRight, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { isStickyColor, STICKY_COLORS, STICKY_STYLES } from "@/lib/notes";
import { cn } from "@/lib/utils";
import type { StickyColor } from "@/types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diagram: {
      /** Insère un schéma (deux boîtes reliées par une flèche). */
      insertDiagram: () => ReturnType;
    };
  }
}

// ----------------------------------------------------------------------------
// Données enregistrées dans la note
// ----------------------------------------------------------------------------

interface DiagramBox {
  id: string;
  x: number;
  y: number;
  label: string;
  color: StickyColor | null;
}

interface DiagramLink {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string;
}

export interface DiagramData {
  boxes: DiagramBox[];
  links: DiagramLink[];
}

const MAX_LABEL = 300;
const HEIGHTS = { small: 320, large: 560 } as const;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const str = (value: unknown, max = MAX_LABEL) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * Relit les données d'un schéma. Elles viennent du fichier de la note
 * (peut-être importé) : tout ce qui n'a pas la forme attendue est écarté.
 */
export function readDiagram(value: unknown): DiagramData {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const boxes: DiagramBox[] = (Array.isArray(raw.boxes) ? raw.boxes : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: str(item.id, 64) || newId(),
      x: num(item.x),
      y: num(item.y),
      label: str(item.label),
      color: isStickyColor(item.color) ? item.color : null,
    }));

  const ids = new Set(boxes.map((box) => box.id));
  const links: DiagramLink[] = (Array.isArray(raw.links) ? raw.links : [])
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: str(item.id, 64) || newId(),
      source: str(item.source, 64),
      target: str(item.target, 64),
      sourceHandle: str(item.sourceHandle, 16) || null,
      targetHandle: str(item.targetHandle, 16) || null,
      label: str(item.label),
    }))
    .filter((link) => ids.has(link.source) && ids.has(link.target));

  return { boxes, links };
}

function starterDiagram(): DiagramData {
  const a = newId();
  const b = newId();
  return {
    boxes: [
      { id: a, x: 40, y: 100, label: "", color: null },
      { id: b, x: 320, y: 100, label: "", color: null },
    ],
    links: [{ id: newId(), source: a, target: b, sourceHandle: "r", targetHandle: "l", label: "" }],
  };
}

// ----------------------------------------------------------------------------
// Conversion vers React Flow
// ----------------------------------------------------------------------------

type BoxNode = Node<{ label: string; color: StickyColor | null; placeholder: string }, "box">;

const edgeStyle = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
} as const;

function toNodes(data: DiagramData, placeholder: string): BoxNode[] {
  return data.boxes.map((box) => ({
    id: box.id,
    type: "box",
    position: { x: box.x, y: box.y },
    data: { label: box.label, color: box.color, placeholder },
  }));
}

function toEdges(data: DiagramData): Edge[] {
  return data.links.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
    sourceHandle: link.sourceHandle,
    targetHandle: link.targetHandle,
    label: link.label || undefined,
    ...edgeStyle,
  }));
}

function fromFlow(nodes: BoxNode[], edges: Edge[]): DiagramData {
  return {
    boxes: nodes.map((node) => ({
      id: node.id,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      label: node.data.label,
      color: node.data.color,
    })),
    links: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      label: typeof edge.label === "string" ? edge.label : "",
    })),
  };
}

// ----------------------------------------------------------------------------
// Boîte
// ----------------------------------------------------------------------------

const SIDES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

const BoxNodeView = memo(function BoxNodeView({ data, selected }: NodeProps<BoxNode>) {
  const style = data.color ? STICKY_STYLES[data.color] : null;

  return (
    <div
      className={cn(
        "min-w-28 max-w-56 rounded-lg border-2 px-3 py-2 text-center text-sm whitespace-pre-wrap shadow-sm",
        !style && "border-border bg-card text-card-foreground",
        selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
      style={style ? { background: style.paper, borderColor: style.border, color: "#1f2937" } : undefined}
    >
      {data.label || <span className="text-muted-foreground italic">{data.placeholder}</span>}

      {/* Une poignée par côté ; chacune peut commencer ou recevoir une flèche. */}
      {SIDES.map((side) => (
        <Handle
          key={side.id}
          id={side.id}
          type="source"
          position={side.position}
          className="!size-3.5 !border-2 !border-background !bg-primary opacity-0 transition-opacity group-hover/diagram:opacity-100"
        />
      ))}
    </div>
  );
});

const NODE_TYPES = { box: BoxNodeView };

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
// Schéma dans la note
// ----------------------------------------------------------------------------

function DiagramCanvas({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const { t } = useTranslation("notes");
  const dark = useDarkMode();
  const flow = useReactFlow();
  const editable = editor.isEditable;
  const placeholder = t("editor.diagram.boxPlaceholder");

  const [nodes, setNodes] = useState<BoxNode[]>(() => toNodes(readDiagram(node.attrs.data), placeholder));
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(readDiagram(node.attrs.data)));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  /** Dernière version écrite dans la note : évite de relire ce qu'on vient d'écrire. */
  const written = useRef(JSON.stringify(readDiagram(node.attrs.data)));

  // Annuler / rétablir (ou tout changement venu de l'éditeur) : le schéma est relu.
  useEffect(() => {
    const data = readDiagram(node.attrs.data);
    const serialized = JSON.stringify(data);
    if (serialized === written.current) return;
    written.current = serialized;
    setNodes(toNodes(data, placeholder));
    setEdges(toEdges(data));
  }, [node.attrs.data, placeholder]);

  function persist(nextNodes: BoxNode[], nextEdges: Edge[]) {
    const data = fromFlow(nextNodes, nextEdges);
    written.current = JSON.stringify(data);
    updateAttributes({ data });
  }

  function onNodesChange(changes: NodeChange<BoxNode>[]) {
    const next = applyNodeChanges(changes, nodesRef.current);
    nodesRef.current = next;
    setNodes(next);

    const removed = changes.some((change) => change.type === "remove");
    const moved = changes.some((change) => change.type === "position" && change.dragging === false);

    if (removed) {
      // Les flèches des boîtes supprimées disparaissent avec elles.
      const ids = new Set(next.map((item) => item.id));
      const keptEdges = edgesRef.current.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      edgesRef.current = keptEdges;
      setEdges(keptEdges);
      persist(next, keptEdges);
    } else if (moved) {
      persist(next, edgesRef.current);
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    const next = applyEdgeChanges(changes, edgesRef.current);
    edgesRef.current = next;
    setEdges(next);
    if (changes.some((change) => change.type === "remove")) persist(nodesRef.current, next);
  }

  function onConnect(connection: Connection) {
    if (connection.source === connection.target) return;
    const next = [
      ...edgesRef.current,
      {
        id: newId(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        ...edgeStyle,
      },
    ];
    edgesRef.current = next;
    setEdges(next);
    persist(nodesRef.current, next);
  }

  function addBox() {
    // Au centre de la partie visible du schéma.
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const center = bounds
      ? flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 0, y: 0 };
    const box: BoxNode = {
      id: newId(),
      type: "box",
      position: { x: center.x - 60 + Math.random() * 20, y: center.y - 20 + Math.random() * 20 },
      data: { label: "", color: null, placeholder },
      selected: true,
    };
    const next = [...nodesRef.current.map((item) => ({ ...item, selected: false })), box];
    nodesRef.current = next;
    setNodes(next);
    persist(next, edgesRef.current);
    window.setTimeout(() => labelRef.current?.focus(), 0);
  }

  const selectedNode = nodes.find((item) => item.selected) ?? null;
  const selectedEdge = selectedNode ? null : (edges.find((item) => item.selected) ?? null);

  function setNodeData(id: string, patch: Partial<BoxNode["data"]>) {
    const next = nodesRef.current.map((item) =>
      item.id === id ? { ...item, data: { ...item.data, ...patch } } : item,
    );
    nodesRef.current = next;
    setNodes(next);
    persist(next, edgesRef.current);
  }

  function setEdgeLabel(id: string, label: string) {
    const next = edgesRef.current.map((item) =>
      item.id === id ? { ...item, label: label || undefined } : item,
    );
    edgesRef.current = next;
    setEdges(next);
    persist(nodesRef.current, next);
  }

  function removeSelection() {
    const nodeIds = new Set(nodesRef.current.filter((item) => item.selected).map((item) => item.id));
    const nextNodes = nodesRef.current.filter((item) => !nodeIds.has(item.id));
    const nextEdges = edgesRef.current.filter(
      (edge) => !edge.selected && !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
    );
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    persist(nextNodes, nextEdges);
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLTextAreaElement>(null);
  const large = node.attrs.height === "large";
  const height = large ? HEIGHTS.large : HEIGHTS.small;

  return (
    <div className="group/diagram overflow-hidden rounded-lg border bg-background">
      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5 text-xs">
          <button type="button" onClick={addBox} className="note-diagram-btn">
            <Plus className="size-3.5" />
            {t("editor.diagram.addBox")}
          </button>

          {selectedNode && (
            <>
              <textarea
                ref={labelRef}
                rows={1}
                value={selectedNode.data.label}
                maxLength={MAX_LABEL}
                placeholder={t("editor.diagram.boxLabel")}
                aria-label={t("editor.diagram.boxLabel")}
                onChange={(event) => setNodeData(selectedNode.id, { label: event.target.value })}
                className="h-7 min-w-40 flex-1 resize-none rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center">
                <button
                  type="button"
                  title={t("editor.diagram.noColor")}
                  aria-label={t("editor.diagram.noColor")}
                  aria-pressed={!selectedNode.data.color}
                  onClick={() => setNodeData(selectedNode.id, { color: null })}
                  className="flex size-6 items-center justify-center rounded-full hover:bg-muted"
                >
                  <span
                    className={cn(
                      "size-4 rounded-full border bg-card",
                      !selectedNode.data.color && "ring-2 ring-ring ring-offset-1",
                    )}
                  />
                </button>
                {STICKY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={t(`colors.${color}`)}
                    aria-label={t(`colors.${color}`)}
                    aria-pressed={selectedNode.data.color === color}
                    onClick={() => setNodeData(selectedNode.id, { color })}
                    className="flex size-6 items-center justify-center rounded-full hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "size-4 rounded-full border border-black/10",
                        selectedNode.data.color === color && "ring-2 ring-ring ring-offset-1",
                      )}
                      style={{ background: STICKY_STYLES[color].swatch }}
                    />
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedEdge && (
            <label className="flex flex-1 items-center gap-1.5">
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <input
                value={typeof selectedEdge.label === "string" ? selectedEdge.label : ""}
                maxLength={MAX_LABEL}
                placeholder={t("editor.diagram.linkLabel")}
                aria-label={t("editor.diagram.linkLabel")}
                onChange={(event) => setEdgeLabel(selectedEdge.id, event.target.value)}
                className="h-7 min-w-40 flex-1 rounded border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}

          {(selectedNode || selectedEdge) && (
            <button type="button" onClick={removeSelection} className="note-diagram-btn hover:text-destructive">
              <Trash2 className="size-3.5" />
              {t("editor.diagram.removeSelection")}
            </button>
          )}

          {!selectedNode && !selectedEdge && (
            <span className="flex-1 text-muted-foreground">{t("editor.diagram.hint")}</span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateAttributes({ height: large ? "small" : "large" })}
              title={large ? t("editor.diagram.smaller") : t("editor.diagram.larger")}
              aria-label={large ? t("editor.diagram.smaller") : t("editor.diagram.larger")}
              className="note-diagram-btn"
            >
              {large ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              title={t("editor.diagram.remove")}
              aria-label={t("editor.diagram.remove")}
              className="note-diagram-btn hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <div ref={wrapperRef} style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={() => window.setTimeout(() => labelRef.current?.select(), 0)}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={edgeStyle}
          colorMode={dark ? "dark" : "light"}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          deleteKeyCode={editable ? ["Delete", "Backspace"] : null}
          // La molette fait défiler la note ; le zoom passe par les boutons.
          zoomOnScroll={false}
          preventScrolling={false}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}

function DiagramView(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="note-diagram my-4" data-drag-handle={false}>
      <ReactFlowProvider>
        <DiagramCanvas {...props} />
      </ReactFlowProvider>
    </NodeViewWrapper>
  );
}

/**
 * Schéma dans une note : des boîtes reliées par des flèches, que l'on
 * déplace, relie (en tirant depuis le bord d'une boîte) et nomme.
 * Les données sont enregistrées dans le document de la note (attribut
 * `data`), relues et vérifiées à l'ouverture (`readDiagram`).
 */
export const Diagram = TiptapNode.create({
  name: "diagram",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      data: {
        default: { boxes: [], links: [] },
        parseHTML: (element) => {
          try {
            return readDiagram(JSON.parse(element.getAttribute("data-diagram") ?? "{}"));
          } catch {
            return { boxes: [], links: [] };
          }
        },
        renderHTML: (attributes) => ({ "data-diagram": JSON.stringify(attributes.data) }),
      },
      height: {
        default: "small",
        parseHTML: (element) => (element.getAttribute("data-height") === "large" ? "large" : "small"),
        renderHTML: (attributes) => ({ "data-height": attributes.height }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-diagram]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertDiagram:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { data: starterDiagram() } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView, {
      // Souris et clavier dans le schéma appartiennent à React Flow, pas à l'éditeur.
      stopEvent: () => true,
      ignoreMutation: () => true,
    });
  },
});
