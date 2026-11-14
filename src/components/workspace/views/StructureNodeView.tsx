import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { VersionsButton } from "@/components/history/VersionsDialog";
import { InfoTip } from "@/components/common/InfoTip";
import { ActionMenu, type MenuItem } from "@/components/documents/ActionMenu";
import { LinkGroup, LinkList, LinkMark, LinkRow } from "@/components/links/LinkRow";
import { DocumentsCard } from "@/components/documents/DocumentsCard";
import { SceneEventsCard } from "@/components/plot/SceneEventsCard";
import { NovelTextCard, NovelWritingCard } from "@/components/novel/NovelSheetCards";
import { MangaChapterCard } from "@/components/manga/MangaChapterCard";
import { PageArtPreview } from "@/components/manga/PageArtPreview";
import { PageLayoutPreview } from "@/components/manga/PageLayoutPreview";
import { PageScriptCard } from "@/components/manga/PageScriptCard";
import { usePageScript } from "@/components/manga/usePageScript";
import { assignArt, isMangaProject, mangaLevels, pagesInOrder, readingOrder } from "@/lib/manga";
import { notifyMangaScriptChanged } from "@/lib/mangaEvents";
import { useMangaSettings, useScriptPanelsIf } from "@/stores/mangaStore";
import { onNovelTextChanged } from "@/lib/novelEvents";
import { refreshWriting } from "@/stores/writingStore";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  FileQuestion,
  Flag,
  Globe,
  Info,
  ListTree,
  Loader2,
  MapPinned,
  Network,
  Plus,
  Save,
  Trash2,
  Users,
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
  profileCardClass,
} from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { announceDeletion } from "@/lib/trash";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import {
  buildStructureTree,
  descendantIdsOf,
  flattenVisible,
  levelOf,
  MAX_NUMBER,
  nodeLinks,
  structureNodeTabId,
} from "@/lib/structure";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { notifyError, notifySaved } from "@/lib/notify";
import { useDocumentsOf, useNodeDocuments } from "@/lib/documents";
import { canHoldText, chapterLevel, countWords, isNovelProject, sceneLevel, wordTotals } from "@/lib/novel";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectStructureLinks, useStructureStore } from "@/stores/structureStore";
import type { NodeCharacterRole, NodeEntryRole, NodeLocationRole, StructureNode } from "@/types";
import { ENTRY_ROLES, splitEntryKey, useNodeEntryItems } from "@/components/structure/nodeEntries";
import { MODULE_ICONS } from "@/components/world/worldStyle";
import { WORKSPACE_MODULE, WORLD_MODULES } from "@/lib/world";
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
  const { t } = useTranslation(["structure", "common", "locations", "modules"]);

  const { structure, failed, reload, levels, numbers, headingOf, colorOf } = useProjectStructure(projectId);
  const links = useProjectStructureLinks(projectId);
  const { characters } = useProjectCharacters(projectId);
  const { locations, settings } = useProjectLocations(projectId);
  const locationLabels = useLocationLabels(settings.customTypes);

  const linkCharacter = useStructureStore((state) => state.linkCharacter);
  const unlinkCharacter = useStructureStore((state) => state.unlinkCharacter);
  const linkLocation = useStructureStore((state) => state.linkLocation);
  const unlinkLocation = useStructureStore((state) => state.unlinkLocation);
  const linkEntry = useStructureStore((state) => state.linkEntry);
  const unlinkEntry = useStructureStore((state) => state.unlinkEntry);
  // Fiches du monde (objets, faune et flore, factions, peuples, magie).
  const worldEntries = useNodeEntryItems(projectId, nodeId, links ? links.entries ?? [] : null);
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
  // Manga / BD : une page a ses cases ; un chapitre, son objectif et ses pages.
  const manga = useProjectStore((state) => isMangaProject(state.projects.find((p) => p.id === projectId)));
  const mangaLevel = mangaLevels(levelCount);
  const isMangaPage = manga && node !== null && structure !== null && node.level >= mangaLevel.page;
  const isMangaChapter = manga && node !== null && structure !== null && node.level === mangaLevel.chapter && mangaLevel.chapter < mangaLevel.page;
  const script = usePageScript(projectId, nodeId, isMangaPage);
  const mangaSettings = useMangaSettings(projectId, isMangaPage);
  const { panels: allPanels } = useScriptPanelsIf(projectId, isMangaChapter);
  // Dessins : ceux du chapitre entier, car un dessin rangé sur le chapitre va
  // à la page de son rang (voir `assignArt`).
  const artEntries = useMemo(() => {
    if (!structure || !(isMangaPage || isMangaChapter)) return [];
    const all = pagesInOrder(structure.nodes, levelCount);
    const chapterId = isMangaChapter ? nodeId : all.find((entry) => entry.page.id === nodeId)?.chapter?.id;
    return chapterId ? all.filter((entry) => entry.chapter?.id === chapterId) : all.filter((entry) => entry.page.id === nodeId);
  }, [structure, levelCount, isMangaPage, isMangaChapter, nodeId]);
  const artNodeIds = useMemo(() => [...new Set(artEntries.flatMap((entry) => (entry.chapter ? [entry.page.id, entry.chapter.id] : [entry.page.id])))].sort(), [artEntries]);
  const artDocuments = useDocumentsOf(projectId, artNodeIds);
  const assignedArt = useMemo(() => assignArt(artEntries, artDocuments), [artEntries, artDocuments]);
  const pageArt = isMangaPage ? assignedArt.art.get(nodeId) : undefined;
  const chapterReading = useMemo(() => (isMangaChapter ? readingOrder(artEntries, assignedArt) : []), [isMangaChapter, artEntries, assignedArt]);

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

  // Texte modifié ailleurs (rechercher et remplacer) : relu si rien n'est
  // en cours d'écriture ici.
  const [textKey, setTextKey] = useState(0);
  const textDirtyRef = useRef(false);
  textDirtyRef.current = textDirty;
  useEffect(
    () =>
      onNovelTextChanged(projectId, (ids) => {
        if (ids.includes(nodeId) && !textDirtyRef.current) setTextKey((key) => key + 1);
      }),
    [projectId, nodeId],
  );

  useEffect(() => {
    if (!holdsText) return;
    let cancelled = false;
    textDraft.current = null;
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
  }, [projectId, nodeId, holdsText, textKey]);

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
      refreshWriting(projectId);
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
  /**
   * Retours d'enregistrement et erreurs : en notification, pas dans la
   * page (l'écran ne bouge pas quand un message apparaît).
   */
  const setError = (message: string | null) => {
    if (message) notifyError(message, `node:${nodeId}`);
  };
  const setLinkError = (message: string | null) => {
    if (message) notifyError(message, `node-links:${nodeId}`);
  };
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

  // Brouillon vidé après un enregistrement : il repart de l'élément tel
  // qu'il est maintenant. Sans cela, si le rechargement a déjà eu lieu
  // (numérotation activée ou retirée, numéro recalculé), rien ne le
  // remplirait et la fiche resterait sur « Chargement ».
  useEffect(() => {
    if (draft === null && base) setDraft(base);
  }, [draft, base]);

  const infoDirty = draft !== null && base !== null && !sameDraft(draft, base);
  const dirty = infoDirty || textDirty || script.dirty;

  /** Enregistre ce qui a changé : informations, texte (roman), cases (manga). */
  async function save(): Promise<boolean> {
    const infoOk = infoDirty ? await saveInfo() : true;
    const textOk = textDirty ? await saveText() : true;
    const scriptOk = script.dirty ? await saveScript() : true;
    return infoOk && textOk && scriptOk;
  }

  async function saveScript(): Promise<boolean> {
    try {
      const result = await script.save(node ? headingOf(node).label : "");
      if (result) applyNode(projectId, result.page);
      return result !== null;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  /** Déplace une case vers une autre page (la page est d'abord enregistrée). */
  async function movePanel(index: number, pageId: string) {
    let panelId = script.draft?.panels[index]?.id;
    if (script.dirty) {
      const result = await script.save(node ? headingOf(node).label : "");
      panelId = result?.panels[index]?.id;
    }
    if (!panelId) return;
    await api.moveMangaPanel(projectId, panelId, pageId);
    await script.reload();
    notifyMangaScriptChanged(projectId);
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
      if (fresh) notifySaved(t("node.saved"), `node:${nodeId}`);
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
    revision: draft ? `${JSON.stringify(draft)}\u0000${textRevision}\u0000${script.signature ?? ""}` : null,
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
      <div className="grid items-start gap-8 @xl:grid-cols-[17rem_minmax(0,1fr)]">
        {/* ================================================================
            CARTE DE PRÉSENTATION
            ================================================================
            Figée à gauche comme sur les autres fiches (même hauteur) : seule
            la colonne de droite défile. Un long résumé défile dans la carte. */}
        <Card className={cn(cardClass, profileCardClass, "flex flex-col")}>
          {/* « Voir dans le plan » reste toujours en bas de la carte, à la
              même place pour tous les éléments (page, chapitre, épilogue…) ;
              le reste défile au-dessus si besoin. */}
          <CardContent className="flex min-h-0 flex-1 flex-col px-5 py-6 text-center">
            <div className="-mx-1 flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-1">
              {/* Page de manga dessinée : le dessin reste visible à côté des cases */}
              {pageArt ? (
                <PageArtPreview projectId={projectId} document={pageArt} title={heading.label} />
              ) : isMangaPage && script.draft && script.draft.panels.length > 0 ? (
                // Pas encore de dessin : le modèle de page selon le nombre de cases.
                <PageLayoutPreview projectId={projectId} pageId={nodeId} framings={script.draft.panels.map((panel) => panel.framing)} />
              ) : (
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
              )}

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

              {node.summary && !isMangaPage && (
                <p className="w-full border-t pt-4 text-left text-sm leading-6 whitespace-pre-line text-muted-foreground">
                  {node.summary}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 w-full shrink-0"
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
          {/* Manga : les cases de la page d'abord (c'est là qu'on écrit) */}
          {isMangaPage && structure && (
            <PageScriptCard
              draft={script.draft}
              failed={script.failed}
              onChange={(update) => script.setDraft((current) => (current ? update(current) : current))}
              characters={characters}
              locations={locations}
              settings={mangaSettings}
              otherPages={pagesInOrder(structure.nodes, levelCount)
                .filter((entry) => entry.page.id !== nodeId)
                .map((entry) => ({ id: entry.page.id, label: [entry.chapter ? labelOfNode(entry.chapter.id) : "", labelOfNode(entry.page.id)].filter(Boolean).join(" › ") }))}
              onMovePanel={movePanel}
            />
          )}

          {/* Roman : le texte de la scène d'abord (c'est là qu'on écrit) */}
          {holdsText && (
            <NovelTextCard
              key={textKey}
              projectId={projectId}
              label={heading.label}
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
                      placeholder={t("common:placeholders.number")}
                      type="number"
                      min={0}
                      max={MAX_NUMBER}
                      value={draft.number}
                      onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                    />
                  </div>
                )}

                <span className="flex items-center gap-1.5 pb-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={draft.numbered}
                      onChange={(e) => setDraft({ ...draft, numbered: e.target.checked })}
                    />
                    {t("plan.edit.numbered")}
                  </label>
                  <InfoTip>{t("plan.edit.numberedHint")}</InfoTip>
                </span>
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
                  {t("common:actions.save")}
                </Button>
                {infoDirty && (
                  <Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(base)}>
                    {t("common:actions.cancel")}
                  </Button>
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

          {isMangaChapter && structure && (
            <MangaChapterCard
              projectId={projectId}
              node={node}
              pages={structure.nodes.filter((n) => n.parentId === node.id && n.level >= mangaLevel.page).length}
              writtenPages={
                new Set(
                  (allPanels ?? [])
                    .map((p) => p.pageId)
                    .filter((pageId) => structure.nodes.find((n) => n.id === pageId)?.parentId === node.id),
                ).size
              }
            />
          )}

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

          <DocumentsCard projectId={projectId} nodeId={nodeId} name={name} nodeOptions={nodeOptions} readingOrder={chapterReading.length ? chapterReading : undefined} />

          <SceneEventsCard projectId={projectId} nodeId={nodeId} name={name} onOpenFeature={onOpenFeature} />

          {/* Liens avec l'univers : personnages, lieux et fiches du monde
              (objets, faune et flore, factions, peuples, magie des modules
              activés), réunis dans une seule carte, rangés par sorte. */}
          <UniverseLinksSection
            name={name}
            loading={!related}
            labelOfNode={labelOfNode}
            onOpenFeature={onOpenFeature}
            groups={[
              {
                key: "character",
                icon: Users,
                title: t("node.sections.characters.title"),
                items: characters.map((c) => ({
                  id: c.id,
                  name: fullName(c),
                  visual: <CharacterAvatar projectId={projectId} character={c} size="sm" />,
                  chip: <CharacterAvatar projectId={projectId} character={c} size="xs" />,
                  tab: characterTabId(c.id),
                })),
                direct: (related?.characters.direct ?? []).map((l) => ({ id: l.characterId, role: l.role })),
                indirect: related?.characters.indirect ?? [],
                firstHere: firstCharacters.map((c) => c.id),
                roles: CHARACTER_ROLES,
                roleLabel: (role) => t(`node.roles.character.${role as NodeCharacterRole}`),
                onLink: (id, role) => runLink(() => linkCharacter(projectId, nodeId, id, role as NodeCharacterRole)),
                onUnlink: (id) => runLink(() => unlinkCharacter(projectId, nodeId, id)),
              },
              {
                key: "location",
                icon: MapPinned,
                title: t("node.sections.locations.title"),
                items: locations.map((l) => ({
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
                })),
                direct: (related?.locations.direct ?? []).map((l) => ({ id: l.locationId, role: l.role })),
                indirect: related?.locations.indirect ?? [],
                firstHere: firstLocations.map((l) => l.id),
                roles: LOCATION_ROLES,
                roleLabel: (role) => t(`node.roles.location.${role as NodeLocationRole}`),
                onLink: (id, role) => runLink(() => linkLocation(projectId, nodeId, id, role as NodeLocationRole)),
                onUnlink: (id) => runLink(() => unlinkLocation(projectId, nodeId, id)),
              },
              ...WORLD_MODULES.flatMap((module): LinkGroupSpec[] => {
                const mine = (key: string) => splitEntryKey(key).kind === module;
                const items = worldEntries.items.filter((item) => mine(item.id));
                const direct = worldEntries.direct.filter((link) => mine(link.id));
                if (items.length === 0 && direct.length === 0) return [];
                return [
                  {
                    key: module,
                    icon: MODULE_ICONS[module],
                    title: t(`modules:modules.${WORKSPACE_MODULE[module]}.label`),
                    items,
                    direct,
                    indirect: [],
                    firstHere: worldEntries.firstHere.filter(mine),
                    roles: ENTRY_ROLES,
                    roleLabel: (role) => t(`node.roles.entry.${role as NodeEntryRole}`),
                    onLink: (key, role) => {
                      const { kind, id } = splitEntryKey(key);
                      return runLink(() => linkEntry(projectId, nodeId, kind, id, role as NodeEntryRole));
                    },
                    onUnlink: (key) => {
                      const { kind, id } = splitEntryKey(key);
                      return runLink(() => unlinkEntry(projectId, nodeId, kind, id));
                    },
                  },
                ];
              }),
            ]}
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

/** Une sorte d'élément de la carte (personnages, lieux, objets…). */
interface LinkGroupSpec {
  key: string;
  icon: LucideIcon;
  title: string;
  items: LinkItem[];
  direct: { id: string; role: string }[];
  indirect: { id: string; nodeIds: string[] }[];
  /** Fiches dont la « première apparition » est cet élément. */
  firstHere: string[];
  roles: string[];
  roleLabel: (role: string) => string;
  onLink: (id: string, role: string) => Promise<void>;
  onUnlink: (id: string) => Promise<void>;
}

interface UniverseLinksSectionProps {
  name: string;
  loading: boolean;
  groups: LinkGroupSpec[];
  labelOfNode: (id: string) => string;
  onOpenFeature: (featureId: string) => void;
}

/** Lien ouvert dans la fenêtre (`id` vide : nouveau lien). */
interface EditingLink {
  group: string;
  id: string;
  role: string;
}

/**
 * « Liens avec l'univers » : personnages, lieux et fiches du monde liés à
 * l'élément, dans une seule carte rangée par sorte, présentée comme sur les
 * fiches : « Ajouter un lien » dans le titre (une sorte, puis une fenêtre),
 * une ligne par lien avec son rôle, un crayon pour le modifier ou le
 * retirer. Les fiches dont c'est la première apparition ont leur ligne ;
 * celles des éléments contenus suivent en pastilles.
 */
function UniverseLinksSection({ name, loading, groups, labelOfNode, onOpenFeature }: UniverseLinksSectionProps) {
  const { t } = useTranslation("structure");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.universe.collapsed");
  const [editing, setEditing] = useState<EditingLink | null>(null);
  const [busy, setBusy] = useState(false);

  const itemsOf = new Map(groups.map((group) => [group.key, new Map(group.items.map((item) => [item.id, item]))]));
  const total = groups.reduce((sum, group) => sum + group.direct.length, 0);

  /** Éléments des éléments contenus, toutes sortes confondues. */
  const indirect = groups.flatMap((group) =>
    group.indirect.flatMap((mention) => {
      const item = itemsOf.get(group.key)?.get(mention.id);
      return item ? [{ group, item, nodeIds: mention.nodeIds }] : [];
    }),
  );

  const addItems: MenuItem[] = groups.map((group) => {
    const linked = new Set(group.direct.map((link) => link.id));
    return {
      id: group.key,
      label: group.title,
      icon: group.icon,
      disabled: !group.items.some((item) => !linked.has(item.id)),
      run: () => {
        setOpen(true);
        setEditing({ group: group.key, id: "", role: group.roles[0] });
      },
    };
  });

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const visible = groups.filter((group) => {
    const linked = new Set(group.direct.map((link) => link.id));
    return group.direct.length > 0 || group.firstHere.some((id) => !linked.has(id));
  });

  const editingGroup = editing ? groups.find((group) => group.key === editing.group) : undefined;

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Globe}
      title={t("node.sections.universe.title")}
      description={t("node.sections.universe.description", { name })}
      count={total}
      contentClassName={`${cardContentClass} space-y-5`}
      actions={
        !loading && addItems.some((item) => !item.disabled) ? (
          <ActionMenu
            label={t("node.sections.universe.add")}
            className="h-8 w-auto gap-1.5 border px-2.5 text-sm text-foreground"
            trigger={
              <>
                <Plus className="size-4" />
                <span className="hidden sm:inline">{t("node.sections.universe.add")}</span>
              </>
            }
            items={addItems}
          />
        ) : undefined
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("node.loading")}
        </p>
      ) : (
        <>
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {groups.some((group) => group.items.length > 0) ? t("node.sections.universe.empty") : t("node.sections.universe.noItems")}
            </p>
          )}

          {visible.map((group) => {
            const byId = itemsOf.get(group.key)!;
            const linked = new Set(group.direct.map((link) => link.id));
            const first = new Set(group.firstHere);

            return (
              <LinkGroup key={group.key} title={group.title} count={group.direct.length}>
                <LinkList>
                  {/* Première apparition (sans lien) : en tête, comme sur les fiches. */}
                  {group.firstHere
                    .filter((id) => !linked.has(id))
                    .map((id) => {
                      const item = byId.get(id);
                      if (!item) return null;
                      return (
                        <LinkRow
                          key={`first-${id}`}
                          thumb={item.visual}
                          label={
                            <span className="inline-flex items-center gap-1">
                              <Flag className="size-3.5" aria-hidden="true" />
                              {t("story.firstAppearance")}
                            </span>
                          }
                          name={item.name}
                          onOpen={() => onOpenFeature(item.tab)}
                        />
                      );
                    })}

                  {group.direct.map((link) => {
                    const item = byId.get(link.id);
                    if (!item) return null;
                    return (
                      <LinkRow
                        key={link.id}
                        thumb={item.visual}
                        label={group.roleLabel(link.role)}
                        name={item.name}
                        onOpen={() => onOpenFeature(item.tab)}
                        detail={first.has(link.id) ? t("story.firstAppearance") : undefined}
                        onEdit={() => setEditing({ group: group.key, id: link.id, role: link.role })}
                        editLabel={t("story.editLink")}
                      />
                    );
                  })}
                </LinkList>
              </LinkGroup>
            );
          })}

          {/* Dans les éléments contenus */}
          {indirect.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Network className="size-3.5" aria-hidden="true" />
                {t("node.inside")}
              </p>
              <LinkList>
                {indirect.map(({ group, item, nodeIds }) => (
                  <LinkRow
                    key={`${group.key}|${item.id}`}
                    thumb={item.visual}
                    label={group.title}
                    name={item.name}
                    onOpen={() => onOpenFeature(item.tab)}
                    detail={
                      nodeIds.map(labelOfNode).slice(0, 2).join(", ") +
                      (nodeIds.length > 2 ? ` +${nodeIds.length - 2}` : "")
                    }
                    hint={nodeIds.map(labelOfNode).join(", ")}
                    onEdit={busy ? undefined : () => void act(() => group.onLink(item.id, group.roles[0]))}
                    editLabel={`${t("node.sections.universe.add")} : ${item.name}`}
                    editIcon={<Plus />}
                  />
                ))}
              </LinkList>
              <InfoTip>{t("node.insideHint")}</InfoTip>
            </div>
          )}
        </>
      )}

      {editing && editingGroup && (
        <NodeLinkDialog group={editingGroup} initial={editing} onClose={() => setEditing(null)} />
      )}
    </CollapsibleCard>
  );
}

/**
 * Lien de l'élément avec un personnage, un lieu ou une fiche du monde :
 * l'élément lié et son rôle. Un lien existant peut changer de rôle ou être
 * retiré.
 */
function NodeLinkDialog({ group, initial, onClose }: { group: LinkGroupSpec; initial: EditingLink; onClose: () => void }) {
  const { t } = useTranslation(["structure", "common"]);
  const itemFieldId = useId();
  const roleFieldId = useId();
  const [itemId, setItemId] = useState(initial.id);
  const [role, setRole] = useState(initial.role);
  const [busy, setBusy] = useState(false);
  const editingExisting = initial.id !== "";

  const linked = new Set(group.direct.map((link) => link.id));
  const choices = group.items
    .filter((item) => item.id === initial.id || !linked.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // Rendue hors de la fiche (portail) : la fiche contient un formulaire.
  return createPortal(
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {editingExisting ? t("story.editLink") : `${t("node.sections.universe.add")} · ${group.title}`}
        </DialogTitle>
      </DialogHeader>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={itemFieldId}>{group.title}</Label>
          <select
            id={itemFieldId}
            value={itemId}
            disabled={busy || editingExisting}
            onChange={(e) => setItemId(e.target.value)}
            className={cn(fieldClass, "h-9")}
          >
            <option value="">{t("node.sections.universe.choose")}</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={roleFieldId}>{t("node.role")}</Label>
          <select id={roleFieldId} value={role} disabled={busy} onChange={(e) => setRole(e.target.value)} className={cn(fieldClass, "h-9")}>
            {group.roles.map((value) => (
              <option key={value} value={value}>
                {group.roleLabel(value)}
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
            onClick={() => void run(() => group.onUnlink(initial.id))}
          >
            <Trash2 />
            {t("node.remove")}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="button" disabled={busy || !itemId} onClick={() => void run(() => group.onLink(itemId, role))}>
          {busy && <Loader2 className="animate-spin" />}
          {t("common:actions.save")}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
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
        // Même présentation que « Liens avec l'univers » : la couleur du
        // niveau en vignette, le titre, le début du résumé dessous.
        <LinkList>
          {items.map((child) => (
            <LinkRow
              key={child.id}
              thumb={
                <LinkMark color={colorOf(child)}>
                  <ListTree />
                </LinkMark>
              }
              name={headingLabel(child)}
              onOpen={() => onOpen(child.id)}
              secondary={child.summary.trim() || undefined}
            />
          ))}
        </LinkList>
      )}
    </CollapsibleCard>
  );
}
