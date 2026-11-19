import { call } from "./client";
import type { SheetDisplay, SheetModule } from "@/types";

/** Affichage des fiches (voir `commands/sheets.rs`). */
export const sheetsApi = {
  /** Sections « Récit » et « Trame » visibles ou non, pour chaque module. */
  getSheetDisplay: (projectId: string) => call<SheetDisplay[]>("get_sheet_display", { projectId }),

  setSheetDisplay: (projectId: string, module: SheetModule, showStory: boolean, showPlot: boolean) =>
    call<SheetDisplay>("set_sheet_display", { projectId, module, showStory, showPlot }),

  /** Panneau du milieu en arborescence ou en simple liste (lieux, objets…). */
  setPanelTree: (projectId: string, module: SheetModule, tree: boolean) => call<SheetDisplay>("set_panel_tree", { projectId, module, tree }),
};
