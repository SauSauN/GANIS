import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { SetupGate } from "@/components/layout/SetupGate";
import { TitleBar } from "@/components/layout/TitleBar";
import { UnsavedChangesGuard } from "@/components/layout/UnsavedChangesGuard";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { HelpDialogs } from "@/components/layout/HelpDialogs";
import { IdleLock } from "@/components/layout/IdleLock";
import { GanixProgress } from "@/components/projects/GanixProgress";
import { ShortcutHandler } from "@/components/layout/ShortcutHandler";
import { Toaster } from "@/components/layout/Toaster";

import Welcome from "@/pages/Welcome";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Recover from "@/pages/Recover";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";
import Packages from "@/pages/Packages";
import Activity from "@/pages/Activity";
import ThemeEditor from "@/pages/ThemeEditor";

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Barre de titre                                                       */}
      {/* ------------------------------------------------------------------ */}

      <TitleBar />

      {/* Modifications non enregistrées : question avant de quitter */}
      <UnsavedChangesGuard />

      {/* Raccourcis clavier, fenêtres d'aide et messages temporaires */}
      <ShortcutHandler />
      <HelpDialogs />
      <Toaster />

      {/* Avancement de l'export / import .ganix */}
      <GanixProgress />

      {/* Verrouillage après inactivité (option des paramètres du compte) */}
      <IdleLock />

      {/* ------------------------------------------------------------------ */}
      {/* Contenu principal                                                    */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Une erreur d'affichage montre un écran de secours, pas une fenêtre vide. */}
        <ErrorBoundary scope="app">
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

              {/* Mot de passe oublié : clé de récupération */}
              <Route
                path="/recover"
                element={<Recover />}
              />

              {/* ============================================================ */}
              {/* Projets : avec ou sans connexion                              */}
              {/* ============================================================ */}
              {/* Sans connexion (« Commencer ») : projets publics seulement.   */}
              {/* Connecté : projets privés du compte et projets publics.       */}

              <Route element={<ProtectedRoute allowGuest />}>
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
              </Route>

              {/* ============================================================ */}
              {/* Routes privées (connexion nécessaire)                         */}
              {/* ============================================================ */}

              <Route element={<ProtectedRoute />}>
                {/* Paramètres (compte, apparence) */}
                <Route
                  path="/settings"
                  element={<Settings />}
                />

                {/* Packages : thèmes système et créations de l'utilisateur */}
                <Route
                  path="/packages"
                  element={<Packages />}
                />

                {/* Rythme de travail (bouton de la barre du haut, sur le tableau de bord) */}
                <Route
                  path="/activity"
                  element={<Activity />}
                />

                {/* Éditeur de thème (mode développeur, vérifié par Rust) */}
                <Route
                  path="/packages/themes/new"
                  element={<ThemeEditor />}
                />

                <Route
                  path="/packages/themes/:packageId"
                  element={<ThemeEditor />}
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
        </ErrorBoundary>
      </div>
    </div>
  );
}