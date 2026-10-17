import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import type { Role } from "@/types";

/**
 * Garde de navigation (confort d'utilisation uniquement).
 *
 * Sans connexion, seules les pages marquées `allowGuest` sont ouvertes, et
 * seulement en mode invité (après « Commencer »).
 * La sécurité réelle repose sur la vérification de session dans chaque commande Rust.
 */
export function ProtectedRoute({
  roles,
  allowGuest = false,
}: {
  roles?: Role[];
  /**
   * Pages ouvertes aussi sans connexion, après « Commencer » (tableau de
   * bord et espace de travail des projets publics).
   */
  allowGuest?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const guest = useAuthStore((s) => s.guest);
  const pendingRecoveryKey = useAuthStore((s) => s.pendingRecoveryKey);
  const location = useLocation();

  if (!user) {
    if (allowGuest && guest) {
      return <Outlet />;
    }

    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Une clé de récupération attend d'être notée (compte tout juste
  // chiffré) : elle est affichée par la page de connexion.
  if (pendingRecoveryKey) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}