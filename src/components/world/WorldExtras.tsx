import { CharacterAnimalCard } from "@/components/world/AnimalCharacterCards";
import { WorldLinksCard } from "@/components/world/WorldLinksCard";
import { useEnabledWorldModules } from "@/stores/worldStore";

/**
 * Cartes « monde » sur la fiche d'un personnage ou d'un lieu, montrées
 * seulement si l'auteur a activé les objets, la faune et la flore ou les factions :
 * - personnage : l'animal qu'il est peut-être (faune et flore) ;
 * - liens avec des objets, des espèces et des factions (« possède Excalibur »,
 *   « fait partie de l'Ordre d'Aval »).
 */
export function WorldExtras({
  projectId,
  kind,
  id,
  onOpenFeature,
}: {
  projectId: string;
  kind: "character" | "location";
  id: string;
  onOpenFeature: (featureId: string) => void;
}) {
  const enabled = useEnabledWorldModules(projectId);

  if (!enabled.item && !enabled.species && !enabled.faction) return null;

  return (
    <>
      {kind === "character" && enabled.species && (
        <CharacterAnimalCard projectId={projectId} characterId={id} onOpenFeature={onOpenFeature} />
      )}
      <WorldLinksCard projectId={projectId} self={{ kind, id }} onOpenFeature={onOpenFeature} />
    </>
  );
}
