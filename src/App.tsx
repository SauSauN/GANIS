import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { SetupGate } from "@/components/layout/SetupGate";
import { TitleBar } from "@/components/layout/TitleBar";

import Welcome from "@/pages/Welcome";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";

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
        {/* Impose la configuration initiale tant qu'aucun compte n'existe */}
        <SetupGate>
          <Routes>
            {/* ============================================================ */}
            {/* Configuration initiale (premier lancement)                    */}
            {/* ============================================================ */}

            <Route
              path="/setup"
              element={<Setup />}
            />

            {/* ============================================================ */}
            {/* Routes publiques                                              */}
            {/* ============================================================ */}

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

            {/* ============================================================ */}
            {/* Routes privées                                                */}
            {/* ============================================================ */}

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
            </Route>

            {/* ============================================================ */}
            {/* Route inconnue                                                */}
            {/* ============================================================ */}

            <Route
              path="*"
              element={<Navigate to="/" replace />}
            />
          </Routes>
        </SetupGate>
      </div>
    </div>
  );
}
