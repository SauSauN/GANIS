/**
 * Clé de récupération : six groupes de six caractères (lettres et
 * chiffres), par exemple `7KQ2MD-X94HTR-B3NW0C-PZ6EAJ-18VYGF-RM5S2K`.
 *
 * Mêmes règles que Rust (`src-tauri/src/security/recovery_key.rs`) :
 * alphabet sans I, L, O ni U ; la saisie accepte minuscules, espaces ou
 * tirets, et corrige les confusions courantes (O → 0, I et L → 1).
 *
 * La vérification réelle est faite par Rust : ces fonctions ne servent
 * qu'au confort de saisie.
 */

/**
 * Clés de récupération proposées à l'utilisateur.
 *
 * **Désactivées pour l'instant** : pas de clé à l'inscription, pas de lien
 * « Mot de passe oublié ? », pas de carte « Clé de récupération » dans les
 * paramètres du compte. Tout le reste est en place et testé (écran de la
 * clé, page de récupération, création depuis les paramètres).
 *
 * Pour les réactiver : passer cette valeur à `true`, et
 * `RECOVERY_KEY_ON_SIGNUP` à `true` côté Rust
 * (`src-tauri/src/services/keyring_service.rs`).
 */
export const RECOVERY_KEY_ENABLED = false;

export const RECOVERY_KEY_GROUPS = 6;
export const RECOVERY_KEY_GROUP_LENGTH = 6;

const ALPHABET = /^[0-9A-HJKMNP-TV-Z]+$/;

/** Majuscules, sans espaces ni tirets, confusions corrigées. */
function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** Normalise un groupe saisi pour le comparer au groupe affiché. */
export function normalizeRecoveryGroup(input: string): string {
  return normalize(input);
}

/** Découpe une clé en ses six groupes. */
export function splitRecoveryKey(key: string): string[] {
  const raw = normalize(key);
  const groups: string[] = [];

  for (let i = 0; i < raw.length; i += RECOVERY_KEY_GROUP_LENGTH) {
    groups.push(raw.slice(i, i + RECOVERY_KEY_GROUP_LENGTH));
  }

  return groups;
}

/** Vrai si la saisie a la forme d'une clé de récupération. */
export function isRecoveryKeyFormat(input: string): boolean {
  const raw = normalize(input);

  return (
    raw.length === RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH &&
    ALPHABET.test(raw)
  );
}
