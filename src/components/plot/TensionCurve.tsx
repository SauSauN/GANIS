import { smoothPath } from "@/components/plot/geometry";
import { type PlotData } from "@/lib/plot";

/** Courbe de tension, moment par moment (0 à gauche, 10 à droite). */
export function TensionCurve({ data, rows, past, rowHeight, width, rowLines }: { data: PlotData; rows: number; past: number; rowHeight: number; width: number; rowLines: boolean }) {
  // `rows` : lignes affichées, passé narratif compris (`past` lignes en haut).
  const height = rows * rowHeight;
  const x0 = 8;
  const xw = width - 16;
  const points = Object.keys(data.tension)
    .map(Number)
    .filter((r) => r >= -past && r < rows - past)
    .sort((a, b) => a - b)
    .map((r) => ({ x: x0 + (data.tension[r] / 10) * xw, y: (r + past) * rowHeight + rowHeight / 2, row: r }));
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
      {rowLines && Array.from({ length: rows + 1 }, (_, r) => <line key={r} x1={0} x2={width} y1={r * rowHeight} y2={r * rowHeight} className="stroke-border" strokeWidth={1} />)}
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={x0 + f * xw} x2={x0 + f * xw} y1={0} y2={height} className="stroke-foreground" opacity={0.12} strokeDasharray="3 5" />
      ))}
      {points.length > 1 && (
        <>
          <path d={`M${x0},${points[0].y} L${points.map((p) => `${p.x},${p.y}`).join(" L")} L${x0},${points[points.length - 1].y} Z`} className="fill-primary" opacity={0.12} />
          <path d={smoothPath(points)} fill="none" className="stroke-primary" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {points.map((p) => (
        <circle key={p.row} cx={p.x} cy={p.y} r={4} className="fill-primary" />
      ))}
    </svg>
  );
}
