import i18n from "@/i18n";
import { ApiError } from "@/lib/api";

/*
 * Message d'erreur à montrer à l'utilisateur, dans sa langue.
 *
 * Les erreurs du moteur (ApiError) ont déjà un message traduit et une piste
 * de solution. Une erreur inattendue de l'interface ne montre pas son détail
 * technique (gardé dans la console) : un message clair et une piste.
 */
export function errorText(error: unknown, fallbackKey = "errors:unexpected"): string {
  if (error instanceof ApiError) return error.message;
  console.error(error);
  return (i18n.t as unknown as (key: string) => string)(fallbackKey);
}
