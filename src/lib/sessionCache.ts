/**
 * Données de la session gardées en mémoire côté interface : caches d'images
 * déchiffrées, stores d'un projet… Chacun s'inscrit ici pour être vidé :
 *
 * - **à la fin de la session** (déconnexion, connexion d'un autre compte,
 *   sortie du mode invité) : tout est vidé, rien de déchiffré ne survit ;
 * - **au verrouillage** (inactivité) : seuls les caches inscrits avec
 *   `onLock` sont vidés. Les stores restent, car l'application reste en
 *   place derrière l'écran de verrouillage pour reprendre où l'on en était.
 */

type Reason = "end" | "lock";

const cleanups = new Map<() => void, { onLock: boolean }>();

/**
 * Inscrit une fonction qui vide des données de la session ; renvoie de quoi
 * la désinscrire. `onLock` : la vider aussi au verrouillage.
 */
export function onSessionEnd(clear: () => void, options: { onLock?: boolean } = {}): () => void {
  cleanups.set(clear, { onLock: options.onLock ?? false });
  return () => {
    cleanups.delete(clear);
  };
}

/**
 * `Map` vidée à la fin de la session et au verrouillage. `drop` est appelé
 * sur chaque valeur retirée (par exemple pour libérer une URL `blob:`).
 *
 * Réservée aux caches : une vue affichée garde sa propre copie de ce
 * qu'elle montre, et redemande le reste au besoin.
 */
export function sessionMap<K, V>(drop?: (value: V) => void): Map<K, V> {
  const map = new Map<K, V>();
  onSessionEnd(
    () => {
      if (drop) map.forEach((value) => drop(value));
      map.clear();
    },
    { onLock: true },
  );
  return map;
}

/** Vide les données de la session : toutes (`end`), ou les caches seulement (`lock`). */
export function forgetSessionCaches(reason: Reason = "end"): void {
  for (const [clear, { onLock }] of cleanups) {
    if (reason === "lock" && !onLock) continue;
    try {
      clear();
    } catch {
      // Un cache qui échoue n'empêche pas de vider les autres.
    }
  }
}
