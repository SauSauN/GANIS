import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { TitleBar } from "@/components/layout/TitleBar";

import Welcome from "@/pages/Welcome";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Diagnostics from "@/pages/Diagnostics";

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Barre de titre                                                       */}
      {/* ------------------------------------------------------------------ */}

      <TitleBar />

      {/* ------------------------------------------------------------------ */}
      {/* Contenu principal                                                    */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          {/* ================================================================ */}
          {/* Routes publiques                                                  */}
          {/* ================================================================ */}

          <Route
            path="/"
            element={<Welcome />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/register"
            element={<Register />}
          />

          {/* ================================================================ */}
          {/* Routes privées                                                     */}
          {/* ================================================================ */}

          <Route element={<ProtectedRoute />}>
            {/* Tableau de bord */}
            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            {/* Espace de travail d'un projet */}
            <Route
              path="/workspace/:projectId"
              element={<Workspace />}
            />

            {/* Paramètres (compte, apparence) */}
            <Route
              path="/settings"
              element={<Settings />}
            />

            {/* Ancienne adresse du profil : redirigée vers les paramètres */}
            <Route
              path="/profile"
              element={<Navigate to="/settings" replace />}
            />

            {/* Administration : rôle administrateur uniquement */}
            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route
                path="/admin"
                element={<Admin />}
              />
            </Route>

            {/* Diagnostics : rôles administrateur et développeur */}
            <Route
              element={
                <ProtectedRoute roles={["admin", "developer"]} />
              }
            >
              <Route
                path="/diagnostics"
                element={<Diagnostics />}
              />
            </Route>
          </Route>

          {/* ================================================================ */}
          {/* Route inconnue                                                     */}
          {/* ================================================================ */}

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      </div>
    </div>
  );
}