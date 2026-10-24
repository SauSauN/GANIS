import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { ReferenceField } from "@/components/characters/fields/SpecialFields";
import { CharacterSelect, LocationSelect } from "@/components/locations/LocationFields";
import { LocationThumb } from "@/components/locations/LocationVisuals";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardContentClass, fieldClass } from "@/components/workspace/views/PageShell";
import { WorldEntrySelect } from "@/components/world/WorldFields";
import { WorldThumb } from "@/components/world/WorldVisuals";
import { useWorldLinkLabels } from "@/components/world/useWorldLabels";
import { characterTabId, fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { locationTabId } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { WORLD_LINK_KINDS, canLink, linkChoices, linksOfEntry, orientLink, worldTabId, type LinkView } from "@/lib/world";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectWorldLinks, useWorldLinkStore } from "@/stores/worldLinkStore";
import { useEnabledWorldModules, useWorldEntries } from "@/stores/worldStore";
import type { WorldLink, WorldLinkInput, WorldLinkKind } from "@/types";

interface Self {
  kind: WorldLinkKind;
  id: string;
}

/** Tous les éléments du projet, pour afficher l'autre côté d'un lien. */
function useDirectory(projectId: string) {
  const { characters } = useProjectCharacters(projectId);
  const { locations, settings: locationSettings } = useProjectLocations(projectId);
  const items = useWorldEntries(projectId, "item");
  const species = useWorldEntries(projectId, "species");

  return { characters, locations, locationSettings, items, species };
}

type Directory = ReturnType<typeof useDirectory>;

function nameOf(directory: Directory, kind: WorldLinkKind, id: string): string | null {
  switch (kind) {
    case "character": {
      const character = directory.characters.find((item) => item.id === id);
      return character ? fullName(character) : null;
    }
    case "location":
      return directory.locations.find((item) => item.id === id)?.name ?? null;
    case "item":
      return directory.items.entries.find((item) => item.id === id)?.name ?? null;
    case "species":
      return directory.species.entries.find((item) => item.id === id)?.name ?? null;
  }
}

function tabOf(kind: WorldLinkKind, id: string): string {
  switch (kind) {
    case "character":
      return characterTabId(id);
    case "location":
      return locationTabId(id);
    default:
      return worldTabId(kind, id);
  }
}

function OtherThumb({ projectId, directory, view }: { projectId: string; directory: Directory; view: LinkView }) {
  const { otherKind: kind, otherId: id } = view;

  if (kind === "character") {
    const character = directory.characters.find((item) => item.id === id);
    return character ? <CharacterAvatar projectId={projectId} character={character} size="sm" /> : null;
  }
  if (kind === "location") {
    const location = directory.locations.find((item) => item.id === id);
    return location ? (
      <LocationThumb projectId={projectId} location={location} customTypes={directory.locationSettings.customTypes} size="sm" />
    ) : null;
  }
  const slice = kind === "item" ? directory.items : directory.species;
  const entry = slice.entries.find((item) => item.id === id);
  return entry ? (
    <WorldThumb projectId={projectId} module={kind} entry={entry} customTypes={slice.settings.customTypes} size="sm" />
  ) : null;
}

/**
 * Liens d'un élément avec des objets et des espèces (« possède
 * Excalibur », « vit dans la Forêt d'Ébène »). Sur la fiche d'un objet ou
 * d'une espèce, ou sur celle d'un personnage ou d'un lieu quand un des deux
 * modules est activé.
 */
export function WorldLinksCard({
  projectId,
  self,
  onOpenFeature,
}: {
  projectId: string;
  self: Self;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation("world");
  const labels = useWorldLinkLabels();
  const directory = useDirectory(projectId);
  const { links } = useProjectWorldLinks(projectId);
  const { structure, labelOf } = useProjectStructure(projectId);
  const [open, setOpen] = useCollapsible(`ganis.worldLinks.${self.kind}.collapsed`);
  const [dialog, setDialog] = useState<{ link: WorldLink | null } | null>(null);

  const titles = useMemo(
    () => new Map((structure?.nodes ?? []).map((node) => [node.id, labelOf(node)])),
    [structure, labelOf],
  );

  const mine = linksOfEntry(links, self.id);

  function period(link: WorldLink): string | null {
    const since = link.sinceNode ? titles.get(link.sinceNode) : undefined;
    const until = link.untilNode ? titles.get(link.untilNode) : undefined;
    if (since && until) return t("links.periodBoth", { since, until });
    if (since) return t("links.periodFrom", { since });
    if (until) return t("links.periodUntil", { until });
    return null;
  }

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Link2}
      title={t("links.title")}
      description={t(`links.description.${self.kind}`)}
      count={mine.length}
      contentClassName={`${cardContentClass} space-y-4`}
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(true);
            setDialog({ link: null });
          }}
        >
          <Plus />
          <span className="hidden sm:inline">{t("links.add")}</span>
        </Button>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("links.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {mine.map((view) => {
            const { link } = view;
            const name = nameOf(directory, view.otherKind, view.otherId) ?? t("form.deleted");
            const when = period(link);

            return (
              <li key={link.id} className="flex items-center gap-3 px-3 py-2.5">
                <OtherThumb projectId={projectId} directory={directory} view={view} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-primary">{labels.type(link.type, view.forward)}</span>
                    <button
                      type="button"
                      onClick={() => onOpenFeature(tabOf(view.otherKind, view.otherId))}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {name}
                    </button>
                    {link.label && <span className="text-muted-foreground">· {link.label}</span>}
                  </p>
                  {(when || link.description) && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {[when, link.description].filter(Boolean).join(" — ")}
                    </p>
                  )}
                </div>
                <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                  {labels.kind(view.otherKind)}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setDialog({ link })}
                  aria-label={t("links.edit")}
                  title={t("links.edit")}
                >
                  <Pencil />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <WorldLinkDialog
          projectId={projectId}
          self={self}
          link={dialog.link}
          directory={directory}
          onClose={() => setDialog(null)}
        />
      )}
    </CollapsibleCard>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/**
 * Création ou modification d'un lien depuis une fiche : on choisit la
 * sorte de l'autre élément, l'élément, puis la nature du lien (dans le sens
 * de la fiche : « possède » / « appartient à »), une précision, une
 * description et une période facultative.
 */
function WorldLinkDialog({
  projectId,
  self,
  link,
  directory,
  onClose,
}: {
  projectId: string;
  self: Self;
  link: WorldLink | null;
  directory: Directory;
  onClose: () => void;
}) {
  const { t } = useTranslation("world");
  const labels = useWorldLinkLabels();
  const enabled = useEnabledWorldModules(projectId);
  const createLink = useWorldLinkStore((state) => state.createLink);
  const updateLink = useWorldLinkStore((state) => state.updateLink);
  const deleteLink = useWorldLinkStore((state) => state.deleteLink);

  const initialView = link ? linksOfEntry([link], self.id)[0] : null;

  /** Sortes proposées pour l'autre côté : objets et espèces seulement si leur module est activé. */
  const kinds = WORLD_LINK_KINDS.filter(
    (kind) =>
      canLink(self.kind, kind) &&
      (kind === "item" || kind === "species" ? enabled[kind] || initialView?.otherKind === kind : true),
  );

  const [otherKind, setOtherKind] = useState<WorldLinkKind>(initialView?.otherKind ?? kinds[0] ?? "item");
  const [otherId, setOtherId] = useState(initialView?.otherId ?? "");
  const [choice, setChoice] = useState<{ type: string; forward: boolean } | null>(
    initialView ? { type: initialView.link.type, forward: initialView.forward } : null,
  );
  const [label, setLabel] = useState(link?.label ?? "");
  const [description, setDescription] = useState(link?.description ?? "");
  const [sinceNode, setSinceNode] = useState<string | null>(link?.sinceNode ?? null);
  const [untilNode, setUntilNode] = useState<string | null>(link?.untilNode ?? null);
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "world:links");
  };

  const choices = linkChoices(self.kind, otherKind);

  // Autre sorte choisie : la nature du lien doit exister pour cette paire.
  useEffect(() => {
    setChoice((current) =>
      current && choices.some((item) => item.type === current.type && item.forward === current.forward)
        ? current
        : (choices[0] ?? null),
    );
    // `choices` découle de `otherKind`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherKind]);

  const ready = otherId !== "" && choice !== null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!choice) return;
    const input: WorldLinkInput = {
      ...orientLink(self, { kind: otherKind, id: otherId }, choice.forward),
      type: choice.type,
      label,
      description,
      sinceNode,
      untilNode,
    };
    void run(() => (link ? updateLink(projectId, link.id, input) : createLink(projectId, input)));
  }

  function renderOtherSelect(id: string) {
    const choose = t("links.dialog.choose");
    switch (otherKind) {
      case "character":
        return (
          <CharacterSelect id={id} projectId={projectId} value={otherId} onChange={setOtherId} emptyLabel={choose} disabled={busy} />
        );
      case "location":
        return (
          <LocationSelect
            id={id}
            value={otherId}
            onChange={setOtherId}
            locations={directory.locations}
            emptyLabel={directory.locations.length === 0 ? t("links.dialog.noneOfKind") : choose}
            disabled={busy}
          />
        );
      default: {
        const entries = (otherKind === "item" ? directory.items : directory.species).entries.filter(
          (entry) => entry.id !== self.id,
        );
        return (
          <WorldEntrySelect
            id={id}
            value={otherId}
            onChange={setOtherId}
            entries={entries}
            emptyLabel={entries.length === 0 ? t("links.dialog.noneOfKind") : choose}
            disabled={busy}
          />
        );
      }
    }
  }

  // Rendue hors de la fiche (portail) : la fiche est elle-même un formulaire.
  return createPortal(
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{link ? t("links.dialog.editTitle") : t("links.dialog.newTitle")}</DialogTitle>
        <DialogDescription>{t("links.dialog.description")}</DialogDescription>
      </DialogHeader>

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (ready) save();
        }}
      >
        {kinds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("links.dialog.noKinds")}</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("links.dialog.kind")}</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("links.dialog.kind")}>
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={otherKind === kind}
                    disabled={busy}
                    onClick={() => {
                      setOtherKind(kind);
                      setOtherId("");
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      "hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      otherKind === kind && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {labels.kind(kind)}
                  </button>
                ))}
              </div>
            </div>

            <Field label={t("links.dialog.element")}>{renderOtherSelect}</Field>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("links.dialog.type")}</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("links.dialog.type")}>
                {choices.map((item) => {
                  const checked = choice?.type === item.type && choice.forward === item.forward;
                  return (
                    <button
                      key={`${item.type}-${item.forward}`}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={busy}
                      onClick={() => setChoice(item)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        "hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {labels.type(item.type, item.forward)}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label={t("links.dialog.label")}>
              {(id) => (
                <Input
                  id={id}
                  value={label}
                  maxLength={100}
                  placeholder={t("links.dialog.labelPlaceholder")}
                  disabled={busy}
                  onChange={(e) => setLabel(e.target.value)}
                />
              )}
            </Field>

            <Field label={t("links.dialog.text")}>
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  value={description}
                  maxLength={5000}
                  placeholder={t("links.dialog.textPlaceholder")}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(fieldClass, "resize-y py-2 leading-6 placeholder:text-muted-foreground")}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("links.dialog.since")}>
                {(id) => (
                  <ReferenceField
                    id={id}
                    projectId={projectId}
                    value={sinceNode ?? ""}
                    onChange={(value) => setSinceNode(value || null)}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label={t("links.dialog.until")}>
                {(id) => (
                  <ReferenceField
                    id={id}
                    projectId={projectId}
                    value={untilNode ?? ""}
                    onChange={(value) => setUntilNode(value || null)}
                    disabled={busy}
                  />
                )}
              </Field>
            </div>
          </>
        )}


        <DialogFooter className="gap-2 pt-1">
          {link && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void run(() => deleteLink(projectId, link.id))}
            >
              <Trash2 />
              {t("links.dialog.delete")}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t("links.dialog.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !ready}>
            {busy && <Loader2 className="animate-spin" />}
            {link ? t("links.dialog.save") : t("links.dialog.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>,
    document.body,
  );
}
