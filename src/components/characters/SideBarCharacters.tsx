import { useTranslation } from "react-i18next";
import { CharacterItemMenu } from "@/components/common/PanelItemMenus";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { characterTabId, fullName } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { TrendingUp } from "lucide-react";
import { arcCharacterOf, useArcStore } from "@/stores/arcStore";

interface SideBarCharactersProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Personnages du projet dans le panneau du module « Personnages » : un clic
 * ouvre la fiche dans son onglet (comme un fichier dans l'explorateur de
 * VS Code).
 */
export function SideBarCharacters({ projectId, activeTab, onOpenFeature }: SideBarCharactersProps) {
  const { t } = useTranslation("characters");
  const { characters, loaded } = useProjectCharacters(projectId);

  // Onglet « Arcs » ouvert : la liste choisit le personnage dont on voit
  // l'arc (au lieu d'ouvrir sa fiche), et marque ceux qui en ont un.
  const inArcs = activeTab === "characters.arcs";
  const arcs = useArcStore((s) => (s.projectId === projectId ? s.arcs : null));
  const selectedArc = useArcStore((s) => s.selectedCharacterId);
  const selectCharacter = useArcStore((s) => s.selectCharacter);
  const arcCharacter = inArcs ? arcCharacterOf(characters, selectedArc) : undefined;

  return (
    <section aria-labelledby="sidebar-characters" className="mt-4 flex min-h-0 flex-1 flex-col">
      <h3
        id="sidebar-characters"
        className="px-4 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {t("sidebar.title")}
        {loaded && characters.length > 0 && ` (${characters.length})`}
      </h3>

      {!loaded ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.loading")}</p>
      ) : characters.length === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {characters.map((character) => {
            const tabId = characterTabId(character.id);
            const active = inArcs ? arcCharacter?.id === character.id : activeTab === tabId;
            const steps = inArcs ? (arcs?.[character.id]?.beats.length ?? 0) : 0;

            return (
              <CharacterItemMenu key={character.id} projectId={projectId} character={character} onOpen={() => onOpenFeature(tabId)}>
                {(onContextMenu) => (
                  <li onContextMenu={onContextMenu}>
                    <button
                      type="button"
                      aria-current={active ? (inArcs ? "true" : "page") : undefined}
                      onClick={() => (inArcs ? selectCharacter(character.id) : onOpenFeature(tabId))}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent font-medium",
                        // Arc affiché : un trait de la couleur principale à gauche.
                        active && inArcs && "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                      )}
                    >
                      <CharacterAvatar projectId={projectId} character={character} size="panel" />
                      <span className="flex-1 truncate text-left">{fullName(character)}</span>
                      {/* Nombre d'étapes de son arc, pour chaque personnage (0 : pas encore d'arc, en gris). */}
                      {inArcs && (
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums",
                            steps > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}
                          title={steps > 0 ? t("arcs.hasArc", { count: steps }) : t("arcs.noArcYet")}
                        >
                          <TrendingUp className="size-3" aria-hidden="true" />
                          {steps}
                        </span>
                      )}
                    </button>
                  </li>
                )}
              </CharacterItemMenu>
            );
          })}
        </ul>
      )}
    </section>
  );
}