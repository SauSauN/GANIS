import { clampZoom } from "@/components/plot/geometry";
import { type PlotView } from "@/components/plot/PlotViewMenu";

/** Réglages d'affichage du plateau, mémorisés sur l'appareil. */
// v2 : la colonne de tension est désormais cachée par défaut.
const VIEW_KEY = "ganis.plot.view.v2";
export const PANEL_KEY = "ganis.plot.panel";

const DEFAULT_VIEW: PlotView = {
  zoom: 1,
  kinds: { impact: true, influence: true, meeting: true },
  labels: true,
  notes: true,
  tension: false,
  rowLines: true,
};

export function readView(): PlotView {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<PlotView> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_VIEW;
    return {
      zoom: typeof raw.zoom === "number" ? clampZoom(raw.zoom) : 1,
      kinds: { ...DEFAULT_VIEW.kinds, ...(raw.kinds ?? {}) },
      labels: raw.labels !== false,
      notes: raw.notes !== false,
      tension: raw.tension === true,
      rowLines: raw.rowLines !== false,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function writeView(view: PlotView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Préférence gardée pour cette séance.
  }
}
