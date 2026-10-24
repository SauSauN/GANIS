/*
 * Scénario de manga modifié ailleurs (case déplacée, restaurée de la
 * corbeille…) : les pages ouvertes et les vues du scénario se relisent.
 */

const EVENT = "ganis:manga-script-changed";

export function notifyMangaScriptChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: projectId }));
}

/** Écoute les changements d'un projet ; renvoie la fonction pour arrêter. */
export function onMangaScriptChanged(projectId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<string>).detail === projectId) listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
