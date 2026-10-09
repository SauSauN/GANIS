/**
 * Barres de défilement qui n'apparaissent que pendant un défilement.
 *
 * Le style se trouve dans `index.css` : la barre est invisible tant que
 * l'élément qui défile ne porte pas l'attribut `data-scrolling`. Ce module
 * pose cet attribut à chaque défilement (molette, glissement de la barre,
 * clavier, tactile) et le retire peu après l'arrêt.
 */

/** Durée pendant laquelle la barre reste visible après le dernier défilement. */
export const SCROLLBAR_HIDE_DELAY_MS = 800;

const ATTRIBUTE = "data-scrolling";

/** Élément qui défile pour un événement `scroll` donné. */
function scrollingElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  // Le défilement de la page elle-même a pour cible `document`.
  if (target instanceof Document) {
    return target.documentElement;
  }

  return null;
}

/**
 * Active l'affichage de la barre pendant le défilement, pour toute
 * l'application. Retourne une fonction qui désactive le comportement.
 *
 * Les événements `scroll` ne remontent pas dans le DOM : on les écoute en
 * phase de capture sur `document`, ce qui couvre tous les éléments, y
 * compris ceux créés plus tard.
 */
export function initAutoHideScrollbars(): () => void {
  const timers = new Map<Element, number>();

  function onScroll(event: Event) {
    const element = scrollingElement(event.target);

    if (!element) {
      return;
    }

    // N'écrit dans le DOM qu'au premier événement d'une série.
    if (!element.hasAttribute(ATTRIBUTE)) {
      element.setAttribute(ATTRIBUTE, "");
    }

    const previous = timers.get(element);

    if (previous !== undefined) {
      window.clearTimeout(previous);
    }

    timers.set(
      element,
      window.setTimeout(() => {
        element.removeAttribute(ATTRIBUTE);
        timers.delete(element);
      }, SCROLLBAR_HIDE_DELAY_MS),
    );
  }

  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });

  return () => {
    document.removeEventListener("scroll", onScroll, { capture: true });

    for (const [element, timer] of timers) {
      window.clearTimeout(timer);
      element.removeAttribute(ATTRIBUTE);
    }

    timers.clear();
  };
}