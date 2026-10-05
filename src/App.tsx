import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { TitleBar } from "@/components/layout/TitleBar";
import Welcome from "@/pages/Welcome";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Barre de titre unique, présente sur toutes les pages */}
      <TitleBar />


      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          {/* Routes publiques */}
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Routes privées (le contrôle réel des droits est fait côté Rust) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workspace/:projectId" element={<Workspace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
