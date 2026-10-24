/*
 * Texte de scènes modifié hors de leur fiche (rechercher et remplacer,
 * annulation) : les fiches ouvertes relisent leur texte.
 */

const EVENT = "ganis:novel-text-changed";

interface Detail {
  projectId: string;
  nodeIds: string[];
}

export function notifyNovelTextChanged(projectId: string, nodeIds: string[]) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { projectId, nodeIds } }));
}

/** Écoute les changements d'un projet ; renvoie la fonction pour arrêter. */
export function onNovelTextChanged(projectId: string, listener: (nodeIds: string[]) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Detail>).detail;
    if (detail?.projectId === projectId) listener(detail.nodeIds);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
