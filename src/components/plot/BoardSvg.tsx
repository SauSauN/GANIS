import { linkPath, metrics, rowTop } from "@/components/plot/geometry";
import { type PlotView } from "@/components/plot/PlotViewMenu";
import { computeFocus, eventOf, type PlotData, type PlotEvent } from "@/lib/plot";
import { usePlotStore } from "@/stores/plotStore";

/** Fond du plateau de la trame : grille, actes, trames, tension et liens. */
interface BoardSvgProps {
  data: PlotData;
  m: ReturnType<typeof metrics>;
  lanes: PlotData["lanes"];
  rows: number;
  width: number;
  height: number;
  view: PlotView;
  selection: ReturnType<typeof usePlotStore.getState>["selection"];
  focus: ReturnType<typeof computeFocus>;
  geometryOf: (event: PlotEvent) => { cx: number; cy: number; column: number; color: string } | null;
  dimmed: (event: PlotEvent) => boolean;
}

export function BoardSvg({ data, m, lanes, rows, width, height, view, selection, focus, geometryOf, dimmed }: BoardSvgProps) {
  const select = usePlotStore((s) => s.select);
  const acts = Object.keys(data.acts).map(Number).sort((a, b) => a - b);
  const colors = new Set<string>();

  const linkPaths = data.links.flatMap((link) => {
    if (!view.kinds[link.kind]) return [];
    const a = eventOf(data, link.from);
    const b = eventOf(data, link.to);
    const ga = a && geometryOf(a);
    const gb = b && geometryOf(b);
    if (!a || !b || !ga || !gb) return [];
    colors.add(ga.color);
    colors.add(gb.color);
    const path = linkPath(m, ga, gb);
    const dim = (focus && !focus.links.has(link.id)) || dimmed(a) || dimmed(b);
    const selected = selection?.type === "link" && selection.id === link.id;
    const gradient = !path.sameColumn && path.x1 !== path.x2 && ga.color !== gb.color;
    return [{ link, path, ga, gb, dim, selected, gradient }];
  });

  const hex = (c: string) => c.replace("#", "");

  return (
    <svg className="pointer-events-none absolute top-0 left-0 z-[1] overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        {[...colors].map((c) => (
          <g key={c}>
            <marker id={`plot-arr-${hex(c)}`} viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M1,1.5 L11.5,6 L1,10.5Z" fill={c} />
            </marker>
            <marker id={`plot-dot-${hex(c)}`} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="4.4" fill={c} />
            </marker>
          </g>
        ))}
        {linkPaths
          .filter((l) => l.gradient)
          .map(({ link, path, ga, gb }) => (
            <linearGradient key={link.id} id={`plot-g-${link.id}`} gradientUnits="userSpaceOnUse" x1={path.x1} y1={path.y1} x2={path.x2} y2={path.y2}>
              <stop offset="0" stopColor={ga.color} />
              <stop offset="1" stopColor={gb.color} />
            </linearGradient>
          ))}
      </defs>

      {/* Passé narratif : zone teintée au-dessus du début de l'histoire */}
      {m.past > 0 && <rect x={0} y={0} width={width} height={m.past * m.row} className="fill-muted" opacity={0.55} />}
      {selection?.type === "row" && <rect x={0} y={rowTop(m, selection.id)} width={width} height={m.row} className="fill-foreground" opacity={0.06} />}
      {acts.map((row, i) =>
        i % 2 === 1 ? <rect key={`band-${row}`} x={0} y={rowTop(m, row)} width={width} height={((acts[i + 1] ?? rows - m.past) - row) * m.row} className="fill-foreground" opacity={0.045} /> : null,
      )}
      {view.rowLines &&
        Array.from({ length: rows + 1 }, (_, r) => <line key={`grid-${r}`} x1={0} x2={width} y1={r * m.row} y2={r * m.row} className="stroke-border" strokeWidth={1} />)}
      {acts.map((row) => (
        <line key={`act-${row}`} x1={0} x2={width} y1={rowTop(m, row)} y2={rowTop(m, row)} className="stroke-foreground" strokeWidth={1.6} opacity={0.5} />
      ))}
      {/* Début de l'histoire principale */}
      {m.past > 0 && <line x1={0} x2={width} y1={m.past * m.row} y2={m.past * m.row} className="stroke-primary" strokeWidth={2} strokeDasharray="6 5" opacity={0.7} />}

      {lanes.map((lane, i) => {
        const x = i * m.lane + m.lane / 2;
        const laneRows = data.events.filter((e) => e.laneId === lane.id).map((e) => e.row);
        return (
          <g key={lane.id}>
            {lane.main && <rect x={i * m.lane} y={0} width={m.lane} height={height} fill={lane.color} opacity={0.07} />}
            <line x1={x} x2={x} y1={0} y2={height} stroke={lane.color} strokeOpacity={0.3} strokeWidth={2} strokeDasharray="1 8" strokeLinecap="round" />
            {laneRows.length > 0 && (
              <line
                x1={x}
                x2={x}
                y1={rowTop(m, Math.min(...laneRows)) + m.row / 2}
                y2={rowTop(m, Math.max(...laneRows)) + m.row / 2}
                stroke={lane.color}
                strokeWidth={lane.main ? 7 : 4}
                strokeLinecap="round"
                strokeOpacity={0.8}
              />
            )}
          </g>
        );
      })}


      {linkPaths.map(({ link, path, ga, gb, dim, selected, gradient }) => {
        const width = link.kind === "impact" ? 3.2 : link.kind === "influence" ? 2.4 : 2.8;
        const end = link.kind === "meeting" ? `plot-dot-${hex(gb.color)}` : `plot-arr-${hex(gb.color)}`;
        return (
          <g key={link.id} className="group/link" opacity={dim ? 0.13 : 1} data-link={link.id}>
            <path
              d={path.d}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              className="cursor-pointer"
              style={{ pointerEvents: "stroke" }}
              onClick={() => select({ type: "link", id: link.id })}
            />
            <path
              d={path.d}
              fill="none"
              stroke={gradient ? `url(#plot-g-${link.id})` : ga.color}
              strokeWidth={selected ? 4.5 : width}
              strokeDasharray={link.kind === "influence" ? "7 6" : undefined}
              strokeLinecap="round"
              markerStart={`url(#plot-dot-${hex(ga.color)})`}
              markerEnd={`url(#${end})`}
              className="group-hover/link:[stroke-width:4.5px]"
            />
          </g>
        );
      })}
    </svg>
  );
}
