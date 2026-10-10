import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceField } from "@/components/characters/fields/SpecialFields";
import { CharacterSelect, LocationSelect } from "@/components/locations/LocationFields";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { PLACE_LINK_TYPES } from "@/lib/placeLinks";
import { cn } from "@/lib/utils";
import { useProjectLocations } from "@/stores/locationStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import type { CharacterLocationInput } from "@/types";

interface PlaceLinkDialogProps {
  projectId: string;
  /** Lien modifié (`null` : nouveau lien). */
  linkId: string | null;
  initial: CharacterLocationInput;
  /** Côté fixé par la fiche d'où l'on vient (non modifiable). */
  fixed: "character" | "location";
  onClose: () => void;
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
 * Création ou modification d'un lien personnage ↔ lieu. Le côté de la fiche
 * d'où l'on vient est fixé ; on choisit l'autre côté, la nature du lien,
 * une précision, une description et une période facultative.
 */
export function PlaceLinkDialog({ projectId, linkId, initial, fixed, onClose }: PlaceLinkDialogProps) {
  const { t } = useTranslation("locations");
  const { locations } = useProjectLocations(projectId);
  const createLink = usePlaceLinkStore((state) => state.createLink);
  const updateLink = usePlaceLinkStore((state) => state.updateLink);
  const deleteLink = usePlaceLinkStore((state) => state.deleteLink);

  const [draft, setDraft] = useState<CharacterLocationInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const set = <K extends keyof CharacterLocationInput>(key: K, value: CharacterLocationInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const ready = draft.characterId !== "" && draft.locationId !== "";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);

    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() => (linkId ? updateLink(projectId, linkId, draft) : createLink(projectId, draft)));

  // Rendue hors de la fiche (portail) : la fiche est elle-même un
  // formulaire, et un formulaire ne doit pas en contenir un autre.
  return createPortal(
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{linkId ? t("links.dialog.editTitle") : t("links.dialog.newTitle")}</DialogTitle>
        <DialogDescription>{t("links.dialog.description")}</DialogDescription>
      </DialogHeader>

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          // Les évènements React remontent aussi à travers le portail.
          event.stopPropagation();
          if (ready) void save();
        }}
      >
        {fixed === "character" ? (
          <Field label={t("links.dialog.location")}>
            {(id) => (
              <LocationSelect
                id={id}
                value={draft.locationId}
                onChange={(value) => set("locationId", value)}
                locations={locations}
                emptyLabel={locations.length === 0 ? t("links.dialog.noLocations") : t("links.dialog.choose")}
                disabled={busy}
              />
            )}
          </Field>
        ) : (
          <Field label={t("links.dialog.character")}>
            {(id) => (
              <CharacterSelect
                id={id}
                projectId={projectId}
                value={draft.characterId}
                onChange={(value) => set("characterId", value)}
                emptyLabel={t("links.dialog.choose")}
                disabled={busy}
              />
            )}
          </Field>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("links.dialog.type")}</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("links.dialog.type")}>
            {PLACE_LINK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={draft.type === type}
                disabled={busy}
                onClick={() => set("type", type)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  "hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  draft.type === type && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {t(`links.types.${type}`)}
              </button>
            ))}
          </div>
        </div>

        <Field label={t("links.dialog.label")}>
          {(id) => (
            <Input
              id={id}
              value={draft.label}
              maxLength={100}
              placeholder={t("links.dialog.labelPlaceholder")}
              disabled={busy}
              onChange={(e) => set("label", e.target.value)}
            />
          )}
        </Field>

        <Field label={t("links.dialog.text")}>
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={draft.description}
              maxLength={5000}
              placeholder={t("links.dialog.textPlaceholder")}
              disabled={busy}
              onChange={(e) => set("description", e.target.value)}
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
                value={draft.sinceNode ?? ""}
                onChange={(value) => set("sinceNode", value || null)}
                disabled={busy}
              />
            )}
          </Field>
          <Field label={t("links.dialog.until")}>
            {(id) => (
              <ReferenceField
                id={id}
                projectId={projectId}
                value={draft.untilNode ?? ""}
                onChange={(value) => set("untilNode", value || null)}
                disabled={busy}
              />
            )}
          </Field>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 pt-1">
          {linkId && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void run(() => deleteLink(projectId, linkId))}
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
            {linkId ? t("links.dialog.save") : t("links.dialog.create")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>,
    document.body,
  );
}
