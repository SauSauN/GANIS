/**
 * Ligne de guidage à marquer pour chaque rangée d'une arborescence : celle du
 * dossier qui contient l'élément actif, sur toute la hauteur de son contenu.
 * Renvoie, pour une rangée, le niveau de la ligne à marquer (ou `null`).
 *
 * `depths` : profondeur de chaque rangée, dans l'ordre d'affichage.
 */
export function activeGuide(depths: number[], activeIndex: number): (index: number) => number | null {
  const depth = depths[activeIndex];
  if (activeIndex < 0 || depth === undefined || depth === 0) return () => null;

  let start = activeIndex;
  while (start > 0 && depths[start - 1] >= depth) start -= 1;
  let end = activeIndex;
  while (end < depths.length - 1 && depths[end + 1] >= depth) end += 1;

  return (index) => (index >= start && index <= end ? depth - 1 : null);
}
