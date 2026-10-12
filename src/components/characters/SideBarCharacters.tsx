import { useTranslation } from "react-i18next";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { characterTabId, fullName } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";

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
            const active = activeTab === tabId;

            return (
              <li key={character.id}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenFeature(tabId)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent font-medium",
                  )}
                >
                  <CharacterAvatar projectId={projectId} character={character} size="xs" />
                  <span className="flex-1 truncate text-left">{fullName(character)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
