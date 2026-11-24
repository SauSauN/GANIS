import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@/lib/api";

/** Envoyé par Rust quand un `.ganix` est ouvert depuis Windows pendant que GANIS tourne. */
const OPENED_EVENT = "ganix-opened";

/** Relais vers le tableau de bord quand il est déjà affiché. */
export const GANIX_OPENED_HERE = "ganis:ganix-opened";

/**
 * Fichier `.ganix` ouvert par double-clic alors que GANIS est déjà lancé :
 * le tableau de bord est affiché, et c'est lui qui montre l'aperçu de
 * l'import (`Dashboard`, `api.takeOpenedGanix`). Au lancement, le tableau
 * de bord le trouve tout seul en s'ouvrant.
 */
export function GanixOpenListener() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isTauri()) return;

    const stop = listen(OPENED_EVENT, () => {
      if (pathname === "/dashboard") window.dispatchEvent(new Event(GANIX_OPENED_HERE));
      else navigate("/dashboard");
    });

    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, [navigate, pathname]);

  return null;
}
