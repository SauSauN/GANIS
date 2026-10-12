/**
 * Disposition des onglets de l'espace de travail : leur ordre et ceux
 * qui sont épinglés.
 *
 * Toutes les fonctions sont pures (elles renvoient une nouvelle
 * disposition sans modifier l'ancienne), ce qui les rend faciles à tester.
 *
 * Règle d'or : les onglets épinglés sont toujours regroupés au début,
 * avant les autres.
 */

export interface TabLayout {
  /** Identifiants des onglets, dans l'ordre d'affichage. */
  tabs: string[];

  /** Onglets épinglés (toujours un sous-ensemble de `tabs`). */
  pinned: string[];
}

/** Nombre maximal d'onglets épinglés mémorisés par projet. */
const MAX_PINNED = 50;

function unique(ids: string[]): string[] {
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

/**
 * Remet la disposition dans un état valide : pas de doublon, épinglés
 * d'abord (l'ordre relatif de chaque groupe est conservé), et aucun
 * épinglé absent de la liste des onglets.
 */
export function normalize(layout: TabLayout): TabLayout {
  const tabs = unique(layout.tabs);
  const pinnedSet = new Set(layout.pinned);

  const pinned = tabs.filter((id) => pinnedSet.has(id));
  const others = tabs.filter((id) => !pinnedSet.has(id));

  return { tabs: [...pinned, ...others], pinned };
}

/** Déplace un élément d'un tableau vers une autre position. */
function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);

  copy.splice(to, 0, item);

  return copy;
}

/**
 * Disposition de départ d'un projet : ses onglets épinglés mémorisés,
 * suivis
 * - des onglets laissés ouverts plus tôt dans la session (on revient du
 *   tableau de bord, des paramètres…), s'il y en a ;
 * - sinon de l'onglet d'accueil (s'il n'est pas déjà épinglé).
 */
export function initialLayout(
  projectId: string,
  homeTab: string,
  isValid: (id: string) => boolean,
): TabLayout {
  const pinned = loadPinnedTabs(projectId, isValid);
  const session = loadOpenTabs(projectId, isValid);

  if (session) {
    return normalize({ tabs: [...pinned, ...session.tabs], pinned });
  }

  return normalize({
    tabs: pinned.includes(homeTab) ? pinned : [...pinned, homeTab],
    pinned,
  });
}

/** Ouvre un onglet : il se place à la fin, après les autres onglets libres. */
export function addTab(layout: TabLayout, id: string): TabLayout {
  if (layout.tabs.includes(id)) {
    return layout;
  }

  return normalize({ ...layout, tabs: [...layout.tabs, id] });
}

/**
 * Ferme un onglet. Un onglet épinglé ne se ferme pas : il faut d'abord
 * le désépingler.
 */
export function closeTab(layout: TabLayout, id: string): TabLayout {
  if (layout.pinned.includes(id) || !layout.tabs.includes(id)) {
    return layout;
  }

  return normalize({
    ...layout,
    tabs: layout.tabs.filter((tab) => tab !== id),
  });
}

/**
 * Portée d'une fermeture demandée depuis le menu d'un onglet :
 * - `this`   : cet onglet ;
 * - `others` : tous les autres ;
 * - `left`   : ceux à sa gauche ;
 * - `right`  : ceux à sa droite ;
 * - `all`    : tous.
 */
export type CloseScope = "this" | "others" | "left" | "right" | "all";

/**
 * Onglets qu'une fermeture fermerait réellement, relativement à l'onglet
 * `id`. Les onglets épinglés ne sont jamais concernés : il faut d'abord
 * les désépingler.
 */
export function tabsToClose(
  layout: TabLayout,
  id: string,
  scope: CloseScope,
): string[] {
  const index = layout.tabs.indexOf(id);

  if (index < 0) {
    return [];
  }

  let candidates: string[];

  switch (scope) {
    case "this":
      candidates = [id];
      break;
    case "others":
      candidates = layout.tabs.filter((tab) => tab !== id);
      break;
    case "left":
      candidates = layout.tabs.slice(0, index);
      break;
    case "right":
      candidates = layout.tabs.slice(index + 1);
      break;
    case "all":
      candidates = layout.tabs;
      break;
  }

  const pinned = new Set(layout.pinned);

  return candidates.filter((tab) => !pinned.has(tab));
}

/** Ferme plusieurs onglets d'un coup (les épinglés sont ignorés). */
export function closeTabs(layout: TabLayout, ids: string[]): TabLayout {
  const pinned = new Set(layout.pinned);
  const closing = new Set(ids.filter((id) => !pinned.has(id)));

  if (![...closing].some((id) => layout.tabs.includes(id))) {
    return layout;
  }

  return normalize({
    ...layout,
    tabs: layout.tabs.filter((tab) => !closing.has(tab)),
  });
}

/**
 * Épingle un onglet libre (il rejoint la fin du groupe des épinglés)
 * ou désépingle un onglet épinglé (il retrouve la tête des onglets libres).
 */
export function togglePin(layout: TabLayout, id: string): TabLayout {
  if (!layout.tabs.includes(id)) {
    return layout;
  }

  if (layout.pinned.includes(id)) {
    const pinned = layout.pinned.filter((tab) => tab !== id);
    const rest = layout.tabs.filter((tab) => tab !== id);

    // Le premier emplacement libre est juste après les épinglés restants.
    return normalize({
      tabs: [...rest.slice(0, pinned.length), id, ...rest.slice(pinned.length)],
      pinned,
    });
  }

  const rest = layout.tabs.filter((tab) => tab !== id);
  const at = layout.pinned.length;

  return normalize({
    tabs: [...rest.slice(0, at), id, ...rest.slice(at)],
    pinned: [...layout.pinned, id],
  });
}

/**
 * Glisser-déposer : `activeId` prend la place de `overId`.
 *
 * L'onglet déplacé adopte l'état de la zone où il est déposé : déposé
 * parmi les épinglés, il est épinglé ; déposé parmi les autres, il est
 * désépinglé.
 */
export function moveTab(
  layout: TabLayout,
  activeId: string,
  overId: string,
): TabLayout {
  const from = layout.tabs.indexOf(activeId);
  const to = layout.tabs.indexOf(overId);

  if (from < 0 || to < 0 || from === to) {
    return layout;
  }

  const pinned = new Set(layout.pinned);

  if (pinned.has(overId)) {
    pinned.add(activeId);
  } else {
    pinned.delete(activeId);
  }

  return normalize({
    tabs: arrayMove(layout.tabs, from, to),
    pinned: [...pinned],
  });
}

/**
 * Déplacement au clavier : décale un onglet d'une place, sans quitter
 * son groupe (épinglés ou non). Rien ne se passe au bord du groupe.
 */
export function shiftTab(
  layout: TabLayout,
  id: string,
  delta: -1 | 1,
): TabLayout {
  const from = layout.tabs.indexOf(id);

  if (from < 0) {
    return layout;
  }

  const pinnedCount = layout.pinned.length;
  const isPinned = layout.pinned.includes(id);

  const first = isPinned ? 0 : pinnedCount;
  const last = isPinned ? pinnedCount - 1 : layout.tabs.length - 1;
  const to = from + delta;

  if (to < first || to > last) {
    return layout;
  }

  return { ...layout, tabs: arrayMove(layout.tabs, from, to) };
}

// ----------------------------------------------------------------------------
// Mémorisation des onglets épinglés (par projet, sur cet appareil)
// ----------------------------------------------------------------------------

const KEY_PREFIX = "ganis-pinned-tabs:";

/**
 * Onglets épinglés mémorisés pour un projet. Les identifiants qui n'existent
 * plus (fonctionnalité retirée ou renommée) sont ignorés.
 */
export function loadPinnedTabs(
  projectId: string,
  isValid: (id: string) => boolean,
): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + projectId);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return unique(
      parsed.filter(
        (id): id is string => typeof id === "string" && isValid(id),
      ),
    ).slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

/** Mémorise les onglets épinglés d'un projet (rien n'est gardé s'il n'y en a pas). */
export function savePinnedTabs(projectId: string, pinned: string[]): void {
  try {
    if (pinned.length === 0) {
      localStorage.removeItem(KEY_PREFIX + projectId);
    } else {
      localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(pinned));
    }
  } catch {
    /* stockage indisponible : les onglets ne seront simplement pas mémorisés */
  }
}

// ----------------------------------------------------------------------------
// Onglets ouverts pendant la session (par projet)
//
// Quitter l'espace de travail (tableau de bord, paramètres généraux,
// extensions…) ne ferme pas les onglets : on les retrouve en revenant.
// Ils ne sont oubliés qu'à la déconnexion (`clearOpenTabs`). Les onglets
// épinglés, eux, restent toujours (voir plus haut).
// ----------------------------------------------------------------------------

const SESSION_PREFIX = "ganis-open-tabs:";

/** Nombre maximal d'onglets ouverts mémorisés par projet. */
const MAX_OPEN = 100;

export interface OpenTabs {
  /** Onglets ouverts, dans l'ordre d'affichage. */
  tabs: string[];
  /** Onglet actif (`null` : aucun onglet ouvert). */
  active: string | null;
}

/**
 * Onglets laissés ouverts dans ce projet pendant la session, ou `null` si
 * le projet n'a pas encore été ouvert depuis la connexion.
 */
export function loadOpenTabs(
  projectId: string,
  isValid: (id: string) => boolean,
): OpenTabs | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + projectId);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<OpenTabs> | null;

    if (!parsed || !Array.isArray(parsed.tabs)) {
      return null;
    }

    const tabs = unique(
      parsed.tabs.filter(
        (id): id is string => typeof id === "string" && isValid(id),
      ),
    ).slice(0, MAX_OPEN);

    const active =
      typeof parsed.active === "string" && tabs.includes(parsed.active)
        ? parsed.active
        : null;

    return { tabs, active };
  } catch {
    return null;
  }
}

/** Mémorise les onglets ouverts d'un projet jusqu'à la déconnexion. */
export function saveOpenTabs(projectId: string, open: OpenTabs): void {
  try {
    sessionStorage.setItem(SESSION_PREFIX + projectId, JSON.stringify(open));
  } catch {
    /* stockage indisponible : les onglets seront rouverts comme au départ */
  }
}

/** Oublie les onglets ouverts de tous les projets (déconnexion). */
export function clearOpenTabs(): void {
  try {
    const keys: string[] = [];

    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);

      if (key?.startsWith(SESSION_PREFIX)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* stockage indisponible : rien à oublier */
  }
}
