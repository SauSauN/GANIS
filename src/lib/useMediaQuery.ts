import { useSyncExternalStore } from "react";

/** Suit une requête média (largeur de fenêtre, zoom…). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      // Aussi au redimensionnement : certains moteurs ne signalent pas
      // toujours le changement (fenêtre glissée en demi-écran…).
      window.addEventListener("resize", onChange);
      return () => {
        list.removeEventListener("change", onChange);
        window.removeEventListener("resize", onChange);
      };
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : true),
    () => true,
  );
}
