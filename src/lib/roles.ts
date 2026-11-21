import type { User } from "@/types";

/**
 * Vrai si le compte a accès aux outils de développement (§8.3) :
 * rôle développeur.
 *
 * Simple reflet pour l'interface : Rust vérifie les droits à chaque commande.
 */
export function canDevelop(user: User | null | undefined): boolean {
  return user?.role === "developer";
}
