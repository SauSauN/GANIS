import { useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, Flag, Link2, Loader2, Trash2 } from "lucide-react";
import { ReferenceField } from "@/components/characters/fields/SpecialFields";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { LinkList, LinkMark, LinkRow } from "@/components/links/LinkRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardContentClass, fieldClass } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { buildStructureTree, flattenVisible, structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectStructureLinks, useStructureStore } from "@/stores/structureStore";
import type { NodeCharacterRole, NodeEntryRole, NodeLocationRole, StructureNode, WorldModule } from "@/types";

/** Rôles d'une fiche du monde dans un élément du plan. */
const ENTRY_ROLES: NodeEntryRole[] = ["central", "present", "mentioned"];

interface StoryLinksCardProps {
  projectId: string;
  /** Sorte de la fiche : personnage, lieu ou fiche du monde. */
  side: "character" | "location" | WorldModule;
  /** Identifiant de la fiche. */
  id: string;
  /** Élément du plan choisi comme « première apparition » (champ de la fiche). */
  firstAppearance?: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Récit » : les éléments du plan (chapitres, scènes…) auxquels la fiche
 * est liée, avec son rôle, dans l'ordre du plan. Un clic ouvre la fiche de
 * l'élément. Les personnages et les lieux se lient depuis la fiche de
 * l'élément ; une fiche du monde (objet, faction…) aussi, ou d'ici avec
 * « Lier à un élément du plan ».
 */
export function StoryLinksCard({ projectId, side, id, firstAppearance, onOpenFeature }: StoryLinksCardProps) {
  const { t } = useTranslation("structure");
  const { structure, headingOf, colorOf } = useProjectStructure(projectId);
  const links = useProjectStructureLinks(projectId);
  const [open, setOpen] = useCollapsible(`ganis.storyLinks.${side}.collapsed`);
  /** Lien d'une fiche du monde ouvert dans la fenêtre (`nodeId` vide : nouveau). */
  const [editing, setEditing] = useState<{ nodeId: string; role: NodeEntryRole } | null>(null);
  const isEntry = side !== "character" && side !== "location";

  const rows = useMemo(() => {
    if (!structure || !links) return [];

    const roles = new Map<string, string>(
      side === "character"
        ? links.characters.filter((l) => l.characterId === id).map((l) => [l.nodeId, l.role])
        : side === "location"
          ? links.locations.filter((l) => l.locationId === id).map((l) => [l.nodeId, l.role])
          : (links.entries ?? []).filter((l) => l.kind === side && l.entryId === id).map((l) => [l.nodeId, l.role]),
    );

    return flattenVisible(buildStructureTree(structure.nodes), new Set())
      .filter((node) => roles.has(node.id))
      .map((node) => ({ node, role: roles.get(node.id)! }));
  }, [structure, links, side, id]);

  const first = firstAppearance ? structure?.nodes.find((node) => node.id === firstAppearance) : undefined;

  /** Élément parent, pour situer « Scène 1 » (« · Chapitre 3 »). */
  const parentOf = (parentId: string | null) => {
    const parent = parentId ? structure?.nodes.find((node) => node.id === parentId) : undefined;
    return parent ? headingOf(parent).label : null;
  };

  /** Ligne d'un élément du plan : sa couleur de niveau, son titre, son parent. */
  const nodeRow = (node: StructureNode, label: string, mark?: ReactNode, onEdit?: () => void) => {
    const heading = headingOf(node);
    return (
      <LinkRow
        key={`${node.id}-${label}`}
        thumb={<LinkMark color={colorOf(node)}>{mark ?? heading.number ?? <BookOpen />}</LinkMark>}
        label={label}
        name={heading.label}
        onOpen={() => onOpenFeature(structureNodeTabId(node.id))}
        detail={parentOf(node.parentId) ?? undefined}
        hint={node.summary.trim() || undefined}
        onEdit={onEdit}
        editLabel={t("story.editLink")}
      />
    );
  };

  const roleLabel = (role: string) =>
    side === "character"
      ? t(`node.roles.character.${role as NodeCharacterRole}`)
      : side === "location"
        ? t(`node.roles.location.${role as NodeLocationRole}`)
        : t(`node.roles.entry.${role as NodeEntryRole}`);

  const description =
    side === "character" ? t("story.characterDescription") : side === "location" ? t("story.locationDescription") : t("story.entryDescription");

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={BookOpen}
      title={t("story.title")}
      description={description}
      count={rows.length}
      contentClassName={`${cardContentClass} space-y-4`}
      actions={
        isEntry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!structure?.nodes.length}
            title={t("story.link")}
            aria-label={t("story.link")}
            onClick={() => {
              setOpen(true);
              setEditing({ nodeId: "", role: "present" });
            }}
          >
            <Link2 />
            <span className="hidden sm:inline">{t("story.link")}</span>
          </Button>
        ) : undefined
      }
    >
      {!first && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{isEntry ? t("story.entryEmpty") : t("story.empty")}</p>
      ) : (
        <LinkList>
          {first && nodeRow(first, t("story.firstAppearance"), <Flag />)}
          {rows.map(({ node, role }) =>
            nodeRow(node, roleLabel(role), undefined, isEntry ? () => setEditing({ nodeId: node.id, role: role as NodeEntryRole }) : undefined),
          )}
        </LinkList>
      )}

      {editing && isEntry && (
        <EntryLinkDialog projectId={projectId} kind={side} entryId={id} initial={editing} onClose={() => setEditing(null)} />
      )}
    </CollapsibleCard>
  );
}

/**
 * Lien entre une fiche du monde et un élément du plan : l'élément et le
 * rôle de la fiche (au cœur de l'élément, présente, citée).
 */
function EntryLinkDialog({
  projectId,
  kind,
  entryId,
  initial,
  onClose,
}: {
  projectId: string;
  kind: WorldModule;
  entryId: string;
  /** `nodeId` vide : nouveau lien. */
  initial: { nodeId: string; role: NodeEntryRole };
  onClose: () => void;
}) {
  const { t } = useTranslation(["structure", "common"]);
  const nodeFieldId = useId();
  const roleFieldId = useId();
  const linkEntry = useStructureStore((s) => s.linkEntry);
  const unlinkEntry = useStructureStore((s) => s.unlinkEntry);
  const [nodeId, setNodeId] = useState(initial.nodeId);
  const [role, setRole] = useState<NodeEntryRole>(initial.role);
  const [busy, setBusy] = useState(false);
  const editingExisting = initial.nodeId !== "";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (e) {
      notifyError(errorText(e), "structure:links");
      setBusy(false);
    }
  }

  // Rendue hors de la fiche (portail) : la fiche est elle-même un formulaire.
  return createPortal(
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editingExisting ? t("story.dialog.editTitle") : t("story.dialog.newTitle")}</DialogTitle>
        <DialogDescription>{t("story.dialog.description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={nodeFieldId}>{t("story.dialog.node")}</Label>
          <ReferenceField id={nodeFieldId} projectId={projectId} value={nodeId} onChange={setNodeId} disabled={busy || editingExisting} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={roleFieldId}>{t("story.dialog.role")}</Label>
          <select id={roleFieldId} value={role} disabled={busy} onChange={(e) => setRole(e.target.value as NodeEntryRole)} className={cn(fieldClass, "h-9")}>
            {ENTRY_ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`node.roles.entry.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DialogFooter className="mt-6 gap-2">
        {editingExisting && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => void run(() => unlinkEntry(projectId, initial.nodeId, kind, entryId))}
          >
            <Trash2 />
            {t("story.dialog.remove")}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="button" disabled={busy || !nodeId} onClick={() => void run(() => linkEntry(projectId, nodeId, kind, entryId, role))}>
          {busy && <Loader2 className="animate-spin" />}
          {t("common:actions.save")}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}
