import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route } from "lucide-react";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { fullName } from "@/lib/characters";
import { characterAppearances } from "@/lib/continuity";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { useStructureStore } from "@/stores/structureStore";
import type { Character, NodeCharacterLink, StructureLinks, StructureNode } from "@/types";

interface CharacterStatesCardProps {
  projectId: string;
  node: StructureNode;
  nodes: StructureNode[];
  links: StructureLinks | null;
  characters: Character[];
}

/**
 * Continuité d'un élément : l'état de chaque personnage lié (blessure,
 * tenue, objet porté, ce qu'il sait…), avec l'état noté juste avant dans
 * l'ordre du plan. Enregistré à la sortie du champ. Alimente la vue
 * Continuité.
 */
export function CharacterStatesCard({ projectId, node, nodes, links, characters }: CharacterStatesCardProps) {
  const { t } = useTranslation("structure");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.continuity.collapsed");
  const mine = useMemo(() => (links?.characters ?? []).filter((l) => l.nodeId === node.id && characters.some((c) => c.id === l.characterId)), [links, node.id, characters]);

  // État noté avant cet élément, pour chaque personnage lié.
  const previous = useMemo(() => {
    const map = new Map<string, string>();
    if (!links) return map;
    for (const link of mine) {
      const rows = characterAppearances(nodes, links, link.characterId);
      const index = rows.findIndex((r) => r.node.id === node.id);
      const before = rows.slice(0, Math.max(0, index)).reverse().find((r) => r.state);
      if (before) map.set(link.characterId, before.state);
    }
    return map;
  }, [links, mine, nodes, node.id]);

  return (
    <CollapsibleCard open={open} onOpenChange={setOpen} icon={Route} title={t("continuity.sheet.title")} description={t("continuity.sheet.description")} count={mine.length}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("continuity.sheet.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {mine.map((link) => (
            <StateRow
              key={link.characterId}
              projectId={projectId}
              link={link}
              name={fullName(characters.find((c) => c.id === link.characterId)!) || "—"}
              previous={previous.get(link.characterId) ?? ""}
            />
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

function StateRow({ projectId, link, name, previous }: { projectId: string; link: NodeCharacterLink; name: string; previous: string }) {
  const { t } = useTranslation("structure");
  const setCharacterState = useStructureStore((s) => s.setCharacterState);
  const [value, setValue] = useState(link.state);
  useEffect(() => setValue(link.state), [link.state]);

  async function commit() {
    if (value.trim() === link.state) return;
    try {
      await setCharacterState(projectId, link.nodeId, link.characterId, value);
    } catch (e) {
      notifyError(errorText(e), "structure:continuity");
      setValue(link.state);
    }
  }

  return (
    <li className="grid gap-1.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
      <span className="pt-2 text-sm font-medium">
        {name} <span className="font-normal text-muted-foreground">· {t(`node.roles.character.${link.role}`)}</span>
      </span>
      <div className="space-y-1">
        <input
          aria-label={t("continuity.sheet.stateOf", { name })}
          value={value}
          maxLength={300}
          placeholder={t("continuity.sheet.placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === "Enter" && void commit()}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {previous && <p className="text-xs text-muted-foreground">{t("continuity.sheet.previous", { state: previous })}</p>}
      </div>
    </li>
  );
}
