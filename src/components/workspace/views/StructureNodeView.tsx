import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { VersionsButton } from "@/components/history/VersionsDialog";
import { DocumentsCard } from "@/components/documents/DocumentsCard";
import { SceneEventsCard } from "@/components/plot/SceneEventsCard";
import { NovelTextCard, NovelWritingCard } from "@/components/novel/NovelSheetCards";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FileQuestion,
  Info,
  ListTree,
  Loader2,
  MapPinned,
  Network,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { LocationThumb, TypeBadge } from "@/components/locations/LocationVisuals";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import {
  PageShell,
  cardClass,
  cardContentClass,
  cardHeaderClass,
  fieldClass,
} from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { announceDeletion } from "@/lib/trash";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import {
  ancestorsOf,
  buildStructureTree,
  descendantIdsOf,
  flattenVisible,
  levelOf,
  MAX_NUMBER,
  nodeLinks,
  structureNodeTabId,
} from "@/lib/structure";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { useNodeDocuments } from "@/lib/documents";
import { canHoldText, chapterLevel, countWords, isNovelProject, sceneLevel, wordTotals } from "@/lib/novel";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectStructureLinks, useStructureStore } from "@/stores/structureStore";
import type { NodeCharacterRole, NodeLocationRole, StructureNode } from "@/types";
import { errorText } from "@/lib/errors";

const CHARACTER_ROLES: NodeCharacterRole[] = ["present", "pov", "mentioned"];
const LOCATION_ROLES: NodeLocationRole[] = ["setting", "mentioned"];

/** Onglet du plan du récit. */
const PLAN_FEATURE = "structure.plan";

interface Draft {
  title: string;
  summary: string;
  numbered: boolean;
  number: string;
}

const sameDraft = (a: Draft, b: Draft) =>
  a.title === b.title && a.summary === b.summary && a.numbered === b.numbered && a.number === b.number;

interface StructureNodeViewProps {
  projectId: string;
  nodeId: string;
  /** Ferme l'onglet (après suppression). */
  onClose: () => void;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Fiche d'un élément du découpage (partie, chapitre, scène…), dans son
 * propre onglet, comme les fiches des personnages et des lieux :
 * - à gauche, la présentation : nom et numéro, niveau, place dans le plan ;
 * - à droite, les informations (titre, numéro, résumé), les documents
 *   rangés dans l'élément (PDF, Word, pages de manga…), les personnages et
 *   les lieux liés (avec leur rôle, et ceux des éléments contenus), puis
 *   ce que l'élément contient.
 */
export function StructureNodeView({ projectId, nodeId, onClose, onOpenFeature }: StructureNodeViewProps) {
  const { t } = useTranslation(["structure", "common", "locations"]);

  const { structure, failed, reload, levels, numbers, headingOf, colorOf } = useProjectStructure(projectId);
  const links = useProjectStructureLinks(projectId);
  const { characters } = useProjectCharacters(projectId);
  const { locations, settings } = useProjectLocations(projectId);
  const locationLabels = useLocationLabels(settings.customTypes);

  const linkCharacter = useStructureStore((state) => state.linkCharacter);
  const unlinkCharacter = useStructureStore((state) => state.unlinkCharacter);
  const linkLocation = useStructureStore((state) => state.linkLocation);
  const unlinkLocation = useStructureStore((state) => state.unlinkLocation);
  const focusNode = useStructureStore((state) => state.focusNode);

  const node = structure?.nodes.find((item) => item.id === nodeId) ?? null;
  const autoNumbering = structure?.autoNumbering ?? false;

  // ---------------------------------------------------------------------------
  // Roman : texte de l'élément (enregistré avec les informations)
  // ---------------------------------------------------------------------------

  const novel = useProjectStore((state) => isNovelProject(state.projects.find((p) => p.id === projectId)));
  const applyNode = useStructureStore((state) => state.applyNode);
  const levelCount = structure?.levels.length ?? 0;
  const holdsText = novel && node !== null && structure !== null && canHoldText(node, structure.nodes, levelCount);
  const { documents } = useNodeDocuments(projectId, nodeId);
  const hasTextDocuments = (documents ?? []).some((d) => /\.(docx|md|markdown|txt)$/i.test(d.name));

  /** Texte enregistré (HTML) ; `null` tant qu'il n'est pas chargé. */
  const [textHtml, setTextHtml] = useState<string | null>(null);
  const [textFailed, setTextFailed] = useState(false);
  /** Texte en cours d'écriture, et compteur de modifications. */
  const textDraft = useRef<string | null>(null);
  const [textRevision, setTextRevision] = useState(0);
  const [textDirty, setTextDirty] = useState(false);
  const [textWords, setTextWords] = useState(0);

  useEffect(() => {
    if (!holdsText) return;
    let cancelled = false;
    setTextHtml(null);
    setTextFailed(false);
    api
      .getStructureNodeContent(projectId, nodeId)
      .then((html) => {
        if (cancelled) return;
        setTextHtml(html);
        setTextWords(countWords(html));
      })
      .catch(() => !cancelled && setTextFailed(true));
    return () => {
      cancelled = true;
    };
    // Chargé une fois par élément : un enregistrement ne recharge pas l'éditeur.
  }, [projectId, nodeId, holdsText]);

  function onTextChange(editor: Editor) {
    const html = editor.getHTML();
    textDraft.current = html;
    setTextWords(countWords(html));
    setTextDirty(true);
    setTextRevision((n) => n + 1);
  }

  async function saveText(): Promise<boolean> {
    const html = textDraft.current;
    if (html === null) return true;
    try {
      const savedNode = await api.setStructureNodeContent(projectId, nodeId, html);
      applyNode(projectId, savedNode);
      // Modifié pendant l'enregistrement : reste à enregistrer.
      if (textDraft.current === html) setTextDirty(false);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Informations (titre, numéro, résumé)
  // ---------------------------------------------------------------------------

  const base = useMemo<Draft | null>(() => {
    if (!node) return null;
    const number = numbers.get(node.id);
    return {
      title: node.title,
      summary: node.summary,
      numbered: node.numbered,
      number: number === undefined ? "" : String(number),
    };
  }, [node, numbers]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseRef = useRef<Draft | null>(null);

  // Brouillon initialisé une fois l'élément chargé. Ensuite, s'il n'a pas
  // été modifié, il suit l'élément (renommé depuis le plan, numéro
  // recalculé…) ; sinon, il est gardé.
  useEffect(() => {
    const previous = baseRef.current;
    const current = draftRef.current;
    baseRef.current = base;

    if (base && (current === null || (previous !== null && sameDraft(current, previous)))) {
      setDraft(base);
    }
  }, [base]);

  const infoDirty = draft !== null && base !== null && !sameDraft(draft, base);
  const dirty = infoDirty || textDirty;

  useEffect(() => {
    if (infoDirty) setSaved(false);
  }, [infoDirty]);

  /** Enregistre ce qui a changé : informations et/ou texte (roman). */
  async function save(): Promise<boolean> {
    const infoOk = infoDirty ? await saveInfo() : true;
    const textOk = textDirty ? await saveText() : true;
    return infoOk && textOk;
  }

  async function saveInfo(): Promise<boolean> {
    if (!draft || !base) return true;

    const number = draft.number.trim() === "" ? undefined : Number(draft.number);
    if (number !== undefined && (!Number.isInteger(number) || number < 0 || number > MAX_NUMBER)) {
      setError(t("plan.edit.numberInvalid", { max: MAX_NUMBER }));
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      await api.updateStructureNode(projectId, nodeId, {
        title: draft.title,
        summary: draft.summary,
        numbered: draft.numbered,
        number: draft.number !== base.number ? number : undefined,
      });
      const next = await reload();
      const fresh = next?.nodes.find((item) => item.id === nodeId);
      // Le brouillon repart de l'élément enregistré (numéro recalculé…).
      setDraft(null);
      if (fresh) setSaved(true);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({
    dirty,
    save,
    revision: draft ? `${JSON.stringify(draft)}\u0000${textRevision}` : null,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void saveInfo();
  }

  async function onDelete() {
    setDeleting(true);
    setError(null);

    try {
      const trashId = await api.deleteStructureNode(projectId, nodeId);
      announceDeletion(projectId, trashId, "structureNode", node ? headingOf(node).label : "");
      setConfirmDelete(false);
      await reload();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  /** Lien ou rôle modifié : l'erreur éventuelle s'affiche sous la carte. */
  async function runLink(action: () => Promise<void>) {
    setLinkError(null);
    try {
      await action();
    } catch (e) {
      setLinkError(errorText(e));
    }
  }

  // ---------------------------------------------------------------------------
  // Chargement, élément introuvable
  // ---------------------------------------------------------------------------

  if (!structure || !node || !draft) {
    const missing = structure !== null && !node;

    return (
      <PageShell title={t("node.fallback")}>
        {missing ? (
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle className="flex items-center gap-2">
                <FileQuestion className="size-5 text-muted-foreground" aria-hidden="true" />
                {t("node.notFound.title")}
              </CardTitle>
              <CardDescription>{t("node.notFound.description")}</CardDescription>
            </CardHeader>
            <CardContent className={cardContentClass}>
              <Button variant="outline" onClick={onClose}>
                {t("node.notFound.close")}
              </Button>
            </CardContent>
          </Card>
        ) : failed ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {t("plan.loadFailed")}
            </p>
            <Button variant="outline" onClick={() => void reload()}>
              {t("plan.retry")}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("node.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  const heading = headingOf(node);
  const level = levelOf(levels, node.level);
  const color = colorOf(node);
  const path = ancestorsOf(structure.nodes, node.id);
  const contained = descendantIdsOf(structure.nodes, node.id).size;
  const children =
    buildStructureTree(structure.nodes)
      .flatMap(function walk(item): typeof item[] {
        return item.id === node.id ? [item] : item.children.flatMap(walk);
      })[0]?.children ?? [];
  const childLevel = node.level + 1;
  const name = heading.label;

  const related = links ? nodeLinks(structure.nodes, links, node.id) : null;
  const labelOfNode = (id: string) => {
    const item = structure.nodes.find((n) => n.id === id);
    return item ? headingOf(item).label : "";
  };

  const firstCharacters = characters.filter((c) => c.fields.firstAppearance === node.id);
  const firstLocations = locations.filter((l) => l.fields.firstAppearance === node.id);

  const openNode = (id: string) => onOpenFeature(structureNodeTabId(id));
  // « Ranger dans… » : tous les éléments, dans l'ordre du plan.
  const nodeOptions = flattenVisible(buildStructureTree(structure.nodes), new Set()).map((item) => ({
    id: item.id,
    label: headingOf(item).label,
    depth: item.depth,
  }));

  async function addChild() {
    try {
      await api.createStructureNode(projectId, { parentId: nodeId, level: childLevel });
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <PageShell>
      <div className="grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* ================================================================
            CARTE DE PRÉSENTATION
            ================================================================ */}
        <Card className={cn(cardClass, "lg:sticky lg:top-0")}>
          <CardContent className="flex flex-col items-center gap-4 px-5 py-6 text-center">
            <span
              className="flex size-24 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${color}1f`, color }}
              aria-hidden="true"
            >
              {heading.number !== null ? (
                <span className="text-3xl font-semibold tabular-nums">{heading.number}</span>
              ) : (
                <ListTree className="size-10" />
              )}
            </span>

            <div className="w-full min-w-0 space-y-2">
              <p className="break-words text-lg font-semibold">{heading.prefix}</p>
              {heading.number !== null && heading.title && (
                <p className="break-words text-base">{heading.title}</p>
              )}

              <div className="flex flex-wrap justify-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: level?.color }} />
                  {level?.one}
                </span>
                {heading.number === null && (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {t("node.profile.unnumbered")}
                  </span>
                )}
              </div>
            </div>

            {node.summary && (
              <p className="w-full border-t pt-4 text-left text-sm leading-6 whitespace-pre-line text-muted-foreground">
                {node.summary}
              </p>
            )}

            <div className="w-full space-y-2 border-t pt-4 text-left text-sm">
              {path.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("node.profile.topLevel")}</p>
              ) : (
                <nav
                  aria-label={t("node.profile.path")}
                  className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs"
                >
                  {path.map((item, index) => (
                    <span key={item.id} className="inline-flex items-center gap-1">
                      {index > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />}
                      <button
                        type="button"
                        onClick={() => openNode(item.id)}
                        className="rounded text-primary underline-offset-4 hover:underline"
                      >
                        {headingOf(item).label}
                      </button>
                    </span>
                  ))}
                </nav>
              )}

              {contained > 0 && (
                <p className="text-xs text-muted-foreground">{t("node.profile.contains", { count: contained })}</p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                focusNode(node.id);
                onOpenFeature(PLAN_FEATURE);
              }}
            >
              <ListTree />
              {t("node.profile.openPlan")}
            </Button>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTIONS
            ================================================================ */}
        <div className="min-w-0 space-y-6">
          {/* Roman : le texte de la scène d'abord (c'est là qu'on écrit) */}
          {holdsText && (
            <NovelTextCard
              projectId={projectId}
              initialHtml={textHtml}
              failed={textFailed}
              words={textWords}
              hasDocuments={hasTextDocuments}
              onChange={onTextChange}
              onOpenFeature={onOpenFeature}
            />
          )}

          <InfoCard>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`node-profile-title-${node.id}`}>{t("plan.edit.title")}</Label>
                <Input
                  id={`node-profile-title-${node.id}`}
                  value={draft.title}
                  maxLength={200}
                  placeholder={t("plan.edit.titlePlaceholder", { label: headingOf({ ...node, title: "" }).label })}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap items-end gap-6">
                {!autoNumbering && draft.numbered && level?.numbering !== "none" && (
                  <div className="w-36 space-y-1.5">
                    <Label htmlFor={`node-profile-number-${node.id}`}>{t("plan.edit.number")}</Label>
                    <Input
                      id={`node-profile-number-${node.id}`}
                      type="number"
                      min={0}
                      max={MAX_NUMBER}
                      value={draft.number}
                      onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                    />
                  </div>
                )}

                <label className="flex max-w-md items-start gap-2 pb-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={draft.numbered}
                    onChange={(e) => setDraft({ ...draft, numbered: e.target.checked })}
                  />
                  <span>
                    {t("plan.edit.numbered")}
                    <span className="block text-xs text-muted-foreground">{t("plan.edit.numberedHint")}</span>
                  </span>
                </label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`node-profile-summary-${node.id}`}>{t("plan.edit.summary")}</Label>
                <textarea
                  id={`node-profile-summary-${node.id}`}
                  rows={5}
                  value={draft.summary}
                  placeholder={t("plan.edit.summaryPlaceholder")}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  className={cn(fieldClass, "resize-y py-2 leading-6")}
                />
              </div>

              <div className="flex min-h-10 flex-wrap items-center gap-4 border-t pt-4">
                <Button type="submit" disabled={!infoDirty || saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {saving ? t("common:actions.saving") : t("common:actions.save")}
                </Button>
                {infoDirty && (
                  <Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(base)}>
                    {t("common:actions.cancel")}
                  </Button>
                )}
                {saved && !infoDirty && (
                  <p role="status" className="text-sm text-success">
                    {t("node.saved")}
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <VersionsButton
                  className="ml-auto"
                  projectId={projectId}
                  kind="structureNode"
                  itemId={nodeId}
                  name={name}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={saving || deleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  {t("node.delete")}
                </Button>
              </div>
            </form>
          </InfoCard>

          {novel && (
            <NovelWritingCard
              projectId={projectId}
              node={node}
              totalWords={
                (wordTotals(structure.nodes, (n) => n.contentWords).get(node.id) ?? 0) -
                node.contentWords +
                (holdsText ? textWords : node.contentWords)
              }
              isChapter={node.level === chapterLevel(levelCount)}
              isScene={holdsText || node.level >= sceneLevel(levelCount)}
              characters={characters}
              links={links ? links.characters : null}
            />
          )}

          <DocumentsCard projectId={projectId} nodeId={nodeId} name={name} nodeOptions={nodeOptions} />

          <SceneEventsCard projectId={projectId} nodeId={nodeId} name={name} onOpenFeature={onOpenFeature} />

          <LinkSection
            storageKey="ganis.nodeSheet.characters.collapsed"
            icon={Users}
            title={t("node.sections.characters.title")}
            description={t("node.sections.characters.description", { name })}
            loading={!related}
            items={characters.map((c) => ({
              id: c.id,
              name: fullName(c),
              visual: <CharacterAvatar projectId={projectId} character={c} size="sm" />,
              chip: <CharacterAvatar projectId={projectId} character={c} size="xs" />,
              tab: characterTabId(c.id),
            }))}
            direct={(related?.characters.direct ?? []).map((l) => ({ id: l.characterId, role: l.role }))}
            indirect={related?.characters.indirect ?? []}
            firstHere={firstCharacters.map((c) => c.id)}
            roles={CHARACTER_ROLES}
            roleLabel={(role) => t(`node.roles.character.${role as NodeCharacterRole}`)}
            texts={{
              add: t("node.sections.characters.add"),
              choose: t("node.sections.characters.choose"),
              empty: t("node.sections.characters.empty"),
              noneLeft: t("node.sections.characters.noneLeft"),
              noItems: t("node.sections.characters.noItems"),
              firstHere: t("node.sections.characters.firstAppearance"),
            }}
            labelOfNode={labelOfNode}
            onOpenFeature={onOpenFeature}
            onLink={(id, role) => runLink(() => linkCharacter(projectId, nodeId, id, role as NodeCharacterRole))}
            onUnlink={(id) => runLink(() => unlinkCharacter(projectId, nodeId, id))}
            error={linkError}
          />

          <LinkSection
            storageKey="ganis.nodeSheet.locations.collapsed"
            icon={MapPinned}
            title={t("node.sections.locations.title")}
            description={t("node.sections.locations.description", { name })}
            loading={!related}
            items={locations.map((l) => ({
              id: l.id,
              name: l.name,
              visual: <LocationThumb projectId={projectId} location={l} customTypes={settings.customTypes} size="sm" />,
              chip: (
                <LocationThumb
                  projectId={projectId}
                  location={l}
                  customTypes={settings.customTypes}
                  size="xs"
                  className="rounded-full"
                />
              ),
              badge: (
                <TypeBadge
                  type={l.type}
                  customTypes={settings.customTypes}
                  labels={locationLabels}
                  className="hidden sm:inline-flex"
                />
              ),
              tab: locationTabId(l.id),
            }))}
            direct={(related?.locations.direct ?? []).map((l) => ({ id: l.locationId, role: l.role }))}
            indirect={related?.locations.indirect ?? []}
            firstHere={firstLocations.map((l) => l.id)}
            roles={LOCATION_ROLES}
            roleLabel={(role) => t(`node.roles.location.${role as NodeLocationRole}`)}
            texts={{
              add: t("node.sections.locations.add"),
              choose: t("node.sections.locations.choose"),
              empty: t("node.sections.locations.empty"),
              noneLeft: t("node.sections.locations.noneLeft"),
              noItems: t("node.sections.locations.noItems"),
              firstHere: t("node.sections.locations.firstAppearance"),
            }}
            labelOfNode={labelOfNode}
            onOpenFeature={onOpenFeature}
            onLink={(id, role) => runLink(() => linkLocation(projectId, nodeId, id, role as NodeLocationRole))}
            onUnlink={(id) => runLink(() => unlinkLocation(projectId, nodeId, id))}
            error={linkError}
          />

          <ChildrenCard
            name={name}
            items={children}
            headingLabel={(child) => headingOf(child).label}
            colorOf={colorOf}
            canAdd={childLevel < levels.length}
            addLabel={t("node.sections.children.add", { name: levelOf(levels, childLevel)?.one ?? "" })}
            onAdd={() => void addChild()}
            onOpen={openNode}
          />
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && !deleting && setConfirmDelete(false)}>
        <DialogHeader>
          <DialogTitle>{t("plan.delete.title", { title: name })}</DialogTitle>
          <DialogDescription>
            {contained > 0 ? t("plan.delete.withChildren", { count: contained }) : null} {t("plan.delete.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void onDelete()}>
            {deleting && <Loader2 className="animate-spin" />}
            {t("plan.delete.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Sections
// ----------------------------------------------------------------------------

function InfoCard({ children }: { children: ReactNode }) {
  const { t } = useTranslation("structure");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.info.collapsed");

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Info}
      title={t("node.sections.info.title")}
      description={t("node.sections.info.description")}
    >
      {children}
    </CollapsibleCard>
  );
}

interface LinkItem {
  id: string;
  name: string;
  /** Vignette de la liste. */
  visual: ReactNode;
  /** Petite vignette des pastilles. */
  chip: ReactNode;
  badge?: ReactNode;
  tab: string;
}

interface LinkSectionProps {
  storageKey: string;
  icon: LucideIcon;
  title: string;
  description: string;
  loading: boolean;
  items: LinkItem[];
  direct: { id: string; role: string }[];
  indirect: { id: string; nodeIds: string[] }[];
  /** Fiches dont la « première apparition » est cet élément. */
  firstHere: string[];
  roles: string[];
  roleLabel: (role: string) => string;
  texts: { add: string; choose: string; empty: string; noneLeft: string; noItems: string; firstHere: string };
  labelOfNode: (id: string) => string;
  onOpenFeature: (featureId: string) => void;
  onLink: (id: string, role: string) => Promise<void>;
  onUnlink: (id: string) => Promise<void>;
  error: string | null;
}

/**
 * Personnages ou lieux liés à l'élément : liés directement (avec leur rôle),
 * puis ceux des éléments contenus, et ceux dont c'est la première
 * apparition.
 */
function LinkSection({
  storageKey,
  icon,
  title,
  description,
  loading,
  items,
  direct,
  indirect,
  firstHere,
  roles,
  roleLabel,
  texts,
  labelOfNode,
  onOpenFeature,
  onLink,
  onUnlink,
  error,
}: LinkSectionProps) {
  const { t } = useTranslation("structure");
  const [open, setOpen] = useCollapsible(storageKey);
  const [choice, setChoice] = useState("");
  const [role, setRole] = useState(roles[0]);
  const [busy, setBusy] = useState(false);

  const byId = new Map(items.map((item) => [item.id, item]));
  const linked = new Set(direct.map((link) => link.id));
  const available = items.filter((item) => !linked.has(item.id)).sort((a, b) => a.name.localeCompare(b.name));
  const firstOthers = firstHere.filter((id) => !linked.has(id));

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={icon}
      title={title}
      description={description}
      count={direct.length}
      contentClassName={`${cardContentClass} space-y-5`}
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("node.loading")}
        </p>
      ) : (
        <>
          {direct.length === 0 ? (
            <p className="text-sm text-muted-foreground">{texts.empty}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {direct.map((link) => {
                const item = byId.get(link.id);
                if (!item) return null;

                return (
                  <li key={link.id} className="flex items-center gap-3 px-3 py-2">
                    {item.visual}
                    <button
                      type="button"
                      onClick={() => onOpenFeature(item.tab)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {item.name}
                    </button>
                    {item.badge}
                    <select
                      aria-label={t("node.role")}
                      value={link.role}
                      disabled={busy}
                      onChange={(e) => void act(() => onLink(link.id, e.target.value))}
                      className={cn(fieldClass, "h-8 w-auto")}
                    >
                      {roles.map((value) => (
                        <option key={value} value={value}>
                          {roleLabel(value)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      title={t("node.remove")}
                      aria-label={`${t("node.remove")} : ${item.name}`}
                      onClick={() => void act(() => onUnlink(link.id))}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Ajout */}
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{texts.noItems}</p>
          ) : available.length === 0 ? (
            <p className="text-xs text-muted-foreground">{texts.noneLeft}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={texts.choose}
                value={choice}
                disabled={busy}
                onChange={(e) => setChoice(e.target.value)}
                className={cn(fieldClass, "h-9 min-w-48 flex-1")}
              >
                <option value="">{texts.choose}</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("node.role")}
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value)}
                className={cn(fieldClass, "h-9 w-auto")}
              >
                {roles.map((value) => (
                  <option key={value} value={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !choice}
                onClick={() =>
                  void act(async () => {
                    await onLink(choice, role);
                    setChoice("");
                  })
                }
              >
                <Plus />
                {texts.add}
              </Button>
            </div>
          )}

          {/* Dans les éléments contenus */}
          {indirect.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Network className="size-3.5" aria-hidden="true" />
                {t("node.inside")}
              </p>
              <ul className="flex flex-wrap gap-2">
                {indirect.map((mention) => {
                  const item = byId.get(mention.id);
                  if (!item) return null;

                  return (
                    <li key={mention.id} className="inline-flex items-center rounded-full border text-sm">
                      <button
                        type="button"
                        title={mention.nodeIds.map(labelOfNode).join(", ")}
                        onClick={() => onOpenFeature(item.tab)}
                        className="inline-flex items-center gap-2 rounded-l-full py-1 pr-2 pl-1 transition-colors hover:bg-muted/50"
                      >
                        {item.chip}
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          · {mention.nodeIds.map(labelOfNode).slice(0, 2).join(", ")}
                          {mention.nodeIds.length > 2 && ` +${mention.nodeIds.length - 2}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        title={texts.add}
                        aria-label={`${texts.add} : ${item.name}`}
                        onClick={() => void act(() => onLink(mention.id, roles[0]))}
                        className="flex h-full items-center rounded-r-full border-l px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">{t("node.insideHint")}</p>
            </div>
          )}

          {/* Première apparition */}
          {firstOthers.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {texts.firstHere}
              </p>
              <ul className="flex flex-wrap gap-2">
                {firstOthers.map((id) => {
                  const item = byId.get(id);
                  if (!item) return null;

                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onOpenFeature(item.tab)}
                        className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted/50"
                      >
                        {item.chip}
                        <span className="font-medium">{item.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </CollapsibleCard>
  );
}

interface ChildrenCardProps {
  name: string;
  items: StructureNode[];
  headingLabel: (node: StructureNode) => string;
  colorOf: (node: StructureNode) => string;
  canAdd: boolean;
  addLabel: string;
  onAdd: () => void;
  onOpen: (id: string) => void;
}

/** Éléments contenus (cliquer ouvre leur fiche). */
function ChildrenCard({ name, items, headingLabel, colorOf, canAdd, addLabel, onAdd, onOpen }: ChildrenCardProps) {
  const { t } = useTranslation("structure");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.children.collapsed");

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Network}
      title={t("node.sections.children.title")}
      description={t("node.sections.children.description", { name })}
      count={items.length}
      actions={
        canAdd ? (
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            <Plus />
            <span className="hidden sm:inline">{addLabel}</span>
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("node.sections.children.empty")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                onClick={() => onOpen(child.id)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(child) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{headingLabel(child)}</span>
                  {child.summary && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{child.summary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}