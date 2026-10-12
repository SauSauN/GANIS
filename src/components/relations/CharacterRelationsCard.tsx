import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Network, Plus, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { RelationDialog } from "@/components/relations/RelationDialog";
import { useRelationColors } from "@/components/relations/useRelationColors";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { emptyRelation, inputFromRelation, otherEnd, relationsOf } from "@/lib/relations";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectRelations } from "@/stores/relationStore";
import type { RelationInput } from "@/types";

interface CharacterRelationsCardProps {
  projectId: string;
  characterId: string;
  onOpenGraph: () => void;
}

/** Carte repliée ou non, mémorisée sur l'appareil (pour toutes les fiches). */
const COLLAPSED_KEY = "ganis.characterSheet.relationsCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Stockage indisponible : le choix vaut pour cette fiche seulement.
  }
}

/** Relations d'un personnage, dans sa fiche : liste, ajout, modification. */
export function CharacterRelationsCard({ projectId, characterId, onOpenGraph }: CharacterRelationsCardProps) {
  const { t } = useTranslation(["relations", "characters"]);
  const { characters } = useProjectCharacters(projectId);
  const { relations } = useProjectRelations(projectId);
  const relationColors = useRelationColors();
  const [dialog, setDialog] = useState<{ relationId: string | null; initial: RelationInput } | null>(null);

  const [open, setOpenState] = useState(() => !loadCollapsed());

  function setOpen(next: boolean) {
    setOpenState(next);
    saveCollapsed(!next);
  }

  const mine = relationsOf(relations, characterId);
  const toggleTitle = open ? t("characters:levels.collapse") : t("characters:levels.expand");

  return (
    <Card className={cardClass}>
      {/* En-tête cliquable, comme les niveaux de la fiche : replie ou déplie la carte. */}
      <CardHeader
        className={cn(
          cardHeaderClass,
          "flex flex-row items-center gap-2 rounded-t-xl p-0 transition-colors hover:bg-muted/40",
          !open && "border-b-0",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls="character-relations-content"
          title={toggleTitle}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-tl-xl py-5 pl-6 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Waypoints className="size-5" aria-hidden="true" />
          </span>

          <CardTitle className="min-w-0 flex-1 truncate">{t("sheet.title")}</CardTitle>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onOpenGraph}>
            <Network />
            <span className="hidden sm:inline">{t("sheet.graph")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={characters.length < 2}
            onClick={() => {
              setOpen(true);
              setDialog({ relationId: null, initial: emptyRelation(characterId) });
            }}
          >
            <Plus />
            <span className="hidden sm:inline">{t("sheet.add")}</span>
          </Button>
        </div>

        {/* Compteur + chevron : même place que sur les cartes des niveaux. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title={toggleTitle}
          onClick={() => setOpen(!open)}
          className="flex shrink-0 items-center gap-4 self-stretch rounded-tr-xl py-5 pr-6 pl-2"
        >
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
            {mine.length}
          </span>
          <ChevronDown
            className={cn(
              "size-5 text-muted-foreground transition-transform duration-300",
              !open && "-rotate-90",
            )}
          />
        </button>
      </CardHeader>

      {/* Repli animé : la hauteur passe de 0 à « auto » (grille 0fr → 1fr). */}
      <div
        id="character-relations-content"
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <CardContent className={cardContentClass}>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sheet.empty")}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {mine.map((relation) => {
                  const other = characters.find((c) => c.id === otherEnd(relation, characterId));
                  if (!other) return null;
                  const outgoing = relation.sourceId === characterId;

                  return (
                    <li key={relation.id}>
                      <button
                        type="button"
                        onClick={() => setDialog({ relationId: relation.id, initial: inputFromRelation(relation) })}
                        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        style={{ borderLeftColor: relationColors[relation.type], borderLeftWidth: 3 }}
                      >
                        <CharacterAvatar projectId={projectId} character={other} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{fullName(other)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {relation.directed ? (outgoing ? "→ " : "← ") : "↔ "}
                            {relation.label || t(`types.${relation.type}`)}
                            {relation.label && ` · ${t(`types.${relation.type}`)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </div>
      </div>

      <RelationDialog
        projectId={projectId}
        open={dialog !== null}
        relationId={dialog?.relationId ?? null}
        initial={dialog?.initial ?? null}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}
