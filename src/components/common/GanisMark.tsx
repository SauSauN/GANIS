import { cn } from "@/lib/utils";

/**
 * Le logo de GANIS au trait, d'une seule couleur (`currentColor`), comme les
 * icônes de l'interface. Mêmes formes que le vrai logo
 * (`src/assets/ganis-logo.png`) : le carré aux trois coins arrondis et au
 * coin droit en bas à droite, le bandeau du haut, et le « G » relevé sur
 * l'image. Sert de filigrane discret (espace sans onglet ouvert) ; il suit
 * le thème clair ou sombre par la couleur du texte qui l'entoure.
 *
 * Pour l'estomper, donner une opacité à tout le dessin (`opacity-25`) plutôt
 * qu'une couleur transparente : les traits qui se croisent gardent alors la
 * même teinte au lieu de foncer.
 */
export function GanisMark({ className, letter = true }: { className?: string; /** Faux : sans le « G » (carré et bandeau seuls). */ letter?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {/* Carré : trois coins arrondis, le coin en bas à droite droit. */}
      <path d="M20.1 9.6H79.6A11 11 0 0 1 90.6 20.6V89.5H20.1A11 11 0 0 1 9.1 78.5V20.6A11 11 0 0 1 20.1 9.6Z" />
      {/* Bandeau du haut. */}
      <path d="M9.1 31.2H90.6" />
      {/* « G », relevé sur le logo ; ses bords qui longent le carré et le
          bandeau sont posés exactement dessus (un seul trait, pas deux). */}
      {letter && <path d="M80.2 31.2C82.2 31.2 84.6 31.2 85.8 31.2C86.9 31.2 86.7 31.2 86.9 32.4C87.1 34.7 87.0 42.9 87.0 45.2C87.0 47.6 87.8 45.9 86.7 46.2C85.5 46.6 81.9 47.1 80.0 47.5C78.1 48.0 76.7 48.5 75.0 49.1C73.3 49.7 71.9 50.2 70.0 51.2C68.1 52.1 65.5 53.5 63.5 54.8C61.5 56.1 59.5 57.5 57.8 58.8C56.0 60.1 54.5 61.5 53.2 62.8C52.0 64.0 51.0 65.2 50.1 66.5C49.3 67.8 48.4 69.3 48.2 70.5C47.9 71.7 48.4 72.8 48.6 73.5C48.9 74.2 49.3 74.4 49.8 74.8C50.2 75.2 50.4 75.5 51.5 75.9C52.6 76.2 54.7 76.7 56.5 76.8C58.3 76.8 60.2 76.5 62.2 76.1C64.2 75.8 66.3 75.3 68.5 74.6C70.7 73.9 73.2 72.9 75.5 71.8C77.8 70.7 80.5 69.2 82.2 68.1C84.0 67.0 85.4 65.7 85.8 65.2C86.2 64.6 87.6 64.3 84.8 64.8C81.9 65.4 71.4 67.9 68.6 68.4C65.8 68.9 68.1 68.2 68.0 67.9C67.9 67.5 67.8 67.2 67.8 66.2C67.7 65.3 67.7 62.9 67.8 62.0C67.8 61.1 64.8 60.9 68.2 61.1C71.6 61.3 84.8 62.7 90.6 63.2C90.6 63.6 90.6 63.4 90.6 63.6C90.6 63.8 90.6 60.6 90.6 64.5C90.6 68.4 90.6 83.3 90.6 87.2C90.6 89.5 90.6 89.5 90.6 89.5C90.6 89.5 90.6 89.5 90.6 89.5C84.6 89.5 71.7 89.5 67.2 89.5C62.8 89.5 63.6 87.2 61.8 86.5C59.9 85.7 57.8 84.7 56.0 83.7C54.2 82.6 52.4 81.3 51.0 80.1C49.6 78.9 48.5 77.7 47.5 76.5C46.6 75.3 45.8 74.2 45.2 72.8C44.5 71.3 43.9 69.6 43.6 68.0C43.2 66.4 43.1 64.7 43.1 63.0C43.1 61.3 43.3 59.6 43.8 57.8C44.2 55.9 45.2 53.5 45.9 51.8C46.7 50.0 47.5 48.9 48.4 47.5C49.4 46.1 50.4 44.8 51.8 43.5C53.1 42.2 54.6 40.9 56.2 39.7C57.9 38.5 59.5 37.4 61.5 36.4C63.5 35.4 65.9 34.4 68.0 33.7C70.1 32.9 72.0 32.5 74.0 32.1C76.0 31.7 78.3 31.4 80.2 31.2Z" />}
    </svg>
  );
}
