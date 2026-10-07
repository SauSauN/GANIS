import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { initTextSize } from "@/lib/preferences";
import { initTheme } from "@/lib/theme";
import "./index.css";

// Applique le thème et la taille du texte avant le premier rendu
// pour éviter un flash.
initTheme();
initTextSize();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);