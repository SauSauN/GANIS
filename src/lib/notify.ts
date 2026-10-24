import { errorText } from "@/lib/errors";
import { toast } from "@/stores/toastStore";

/*
 * Retours d'enregistrement, sous forme de notification (petite fenêtre en
 * bas de l'écran) plutôt que de texte dans la page : la mise en page ne
 * bouge pas quand un message apparaît ou disparaît.
 *
 * `key` identifie la source (ex. `note:<id>`) : un enregistrement suivant
 * remplace la notification précédente au lieu d'en ajouter une.
 */

/** Durée d'une confirmation d'enregistrement (courte : c'est fréquent). */
export const SAVED_DURATION = 2500;

/** « … enregistré » : confirmation discrète. */
export function notifySaved(message: string, key?: string) {
  toast({ tone: "success", message, key: key && `saved:${key}`, duration: SAVED_DURATION });
}

/** Échec d'un enregistrement : message clair (et piste de solution). */
export function notifySaveFailed(error: unknown, key?: string, fallbackKey?: string) {
  toast({ tone: "error", message: errorText(error, fallbackKey), key: key && `saved:${key}` });
}

/** Échec avec un message déjà rédigé. */
export function notifyError(message: string, key?: string) {
  toast({ tone: "error", message, key: key && `saved:${key}` });
}

/** Information neutre (ex. « Notes système activées »). */
export function notifyInfo(message: string, key?: string) {
  // Plus long : ces messages sont plus longs à lire (chemin d'export…).
  toast({ tone: "success", message, key: key && `saved:${key}`, duration: 8000 });
}
