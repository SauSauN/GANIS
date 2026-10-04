import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import "./index.css";

// Applique le thème avant le premier rendu pour éviter un flash
applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
