import { useEffect } from "react";
import i18n from "@/i18n";
import { api } from "@/lib/api";
import { useDocumentStore } from "@/lib/documents";
import { toast } from "@/stores/toastStore";

/** Intervalle entre deux vérifications d'un document ouvert ailleurs. */
const POLL_MS = 2500;

const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;

/**
 * Documents ouverts dans une autre application (Word, Acrobat, Clip
 * Studio…) : dès que le fichier y est enregistré, son contenu est repris
 * dans le projet (l'ancien devient une version). Monté une fois dans
 * l'espace de travail, pour continuer quand on change d'onglet.
 */
export function ExternalDocumentsWatcher({ projectId }: { projectId: string }) {
  const external = useDocumentStore((state) => state.external);
  const ids = Object.entries(external)
    .filter(([, edit]) => edit.projectId === projectId)
    .map(([id]) => id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!ids) return;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        for (const id of ids.split(",")) {
          try {
            const result = await api.syncStructureDocumentExternal(projectId, id);
            const store = useDocumentStore.getState();
            if (!result.status.open) {
              store.stopExternal(id);
            } else if (result.document) {
              store.upsert(projectId, result.document);
              toast({ message: t("documents:external.synced", { name: result.document.name }), tone: "success" });
            }
          } catch {
            // Document supprimé, projet fermé… : on arrête de le suivre.
            useDocumentStore.getState().stopExternal(id);
          }
        }
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(() => void tick(), POLL_MS);
    // Retour dans GANIS (après avoir enregistré ailleurs) : vérification immédiate.
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [ids, projectId]);

  return null;
}
