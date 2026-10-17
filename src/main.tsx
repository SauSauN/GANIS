import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
// Initialise la traduction avant le premier rendu (langue enregistrée).
import "@/i18n";
import App from "./App";
import { initColorTheme } from "@/lib/colorTheme";
import { initNativeGuards } from "@/lib/nativeGuards";
import { initTextSize } from "@/lib/preferences";
import { initAutoHideScrollbars } from "@/lib/scrollbars";
import { initTheme } from "@/lib/theme";
import "./index.css";

// Applique le thème (mode et couleurs) et la taille du texte avant le
// premier rendu pour éviter un flash.
initTheme();
initColorTheme();
initTextSize();

// Les barres de défilement n'apparaissent que pendant un défilement.
initAutoHideScrollbars();

// Pas de menu contextuel natif ni de raccourcis de navigation du
// navigateur (Actualiser, Retour, Imprimer…) dans l'application.
initNativeGuards();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);