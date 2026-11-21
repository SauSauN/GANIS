import { create } from "zustand";
import { getSheetPreviewEach, useSheetPreviewEach } from "@/lib/preferences";
import { characterIdOfTab } from "@/lib/characters";
import { locationIdOfTab } from "@/lib/locations";
import { worldEntryOfTab } from "@/lib/world";

/*
 * Aperçu des fiches (bouton livre / crayon de la barre d'onglets) :
 * l'essentiel en lecture, à la place des panneaux du formulaire, dans le
 * même onglet. Vaut pour les fiches personnage, lieu et monde (objets,
 * faune et flore, factions, peuples, magie).
 *
 * Par défaut, un seul état pour toutes les fiches : passer en aperçu sur
 * une fiche y met aussi les autres (et revenir au formulaire de même).
 * Paramètres généraux › Apparence › « Aperçu fiche par fiche » : chaque
 * fiche garde alors son propre état. Le temps de la session.
 *
 * Une fiche est désignée par l'identifiant de son onglet.
 */

interface SheetPreviewState {
  /** État commun à toutes les fiches (réglage par défaut). */
  all: boolean;
  /** État de chaque fiche (réglage « fiche par fiche »), par onglet. */
  each: Record<string, true>;
  /** Bascule l'aperçu de cette fiche, ou de toutes, selon le réglage. */
  toggle: (sheetId: string) => void;
}

export const useSheetPreviewStore = create<SheetPreviewState>((set) => ({
  all: false,
  each: {},
  toggle: (sheetId) =>
    set((state) => {
      if (!getSheetPreviewEach()) return { all: !state.all };
      const next = { ...state.each };
      if (next[sheetId]) delete next[sheetId];
      else next[sheetId] = true;
      return { each: next };
    }),
}));

/** Vrai si cette fiche (identifiant de son onglet) est affichée en aperçu. */
export function useSheetPreview(sheetId: string | null): boolean {
  const each = useSheetPreviewEach();
  return useSheetPreviewStore((state) => (sheetId ? (each ? !!state.each[sheetId] : state.all) : false));
}

/** Vrai si cet onglet est une fiche qui a un aperçu (personnage, lieu, monde). */
export function hasSheetPreview(tabId: string | null): boolean {
  return tabId !== null && (characterIdOfTab(tabId) !== null || locationIdOfTab(tabId) !== null || worldEntryOfTab(tabId) !== null);
}
