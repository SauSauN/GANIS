import { useId, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { ContextMenu, contextMenuPoint } from "@/components/common/ContextMenu";
import type { MenuItem } from "@/components/documents/ActionMenu";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { usePanelMenuEnabled } from "@/lib/preferences";

/** Champ de la fenêtre « Renommer » (un nom, ou un prénom et un nom). */
export interface RenameField {
  key: string;
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
}

export interface PanelItemActionsProps {
  /** Nom affiché de l'élément (titres et libellés). */
  name: string;
  onOpen: () => void;
  /** Renommer : les champs, et l'enregistrement (au moins un champ non vide). */
  rename?: { fields: RenameField[]; save: (values: Record<string, string>) => Promise<void> };
  /** Ajouter dedans : libellé propre au module (« Ajouter un lieu dans… »). */
  addInside?: { label: string; run: () => void | Promise<void> };
  onDuplicate?: () => Promise<void>;
  /** Supprimer : demandé avant, car l'action est critique. */
  remove?: { description: string; run: () => Promise<void> };
  /** La ligne : reçoit le gestionnaire du clic droit, à poser sur elle. */
  children: (onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void) => ReactNode;
}

/**
 * Menu d'un élément du panneau du milieu, au clic droit (ou touche Menu,
 * Maj + F10) : ouvrir, renommer, ajouter dedans, dupliquer et supprimer.
 * Les actions qui ne s'annulent pas d'un geste demandent une validation :
 * la suppression affiche une question, le renommage une fenêtre avec
 * « Enregistrer ».
 */
export function PanelItemActions({ name, onOpen, rename, addInside, onDuplicate, remove, children }: PanelItemActionsProps) {
  const { t } = useTranslation("common");
  const [menu, setMenu] = useState<{ x: number; y: number; origin: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Désactivé dans Paramètres généraux › Apparence : le clic droit ne fait rien.
  const enabled = usePanelMenuEnabled();

  function onContextMenu(event: ReactMouseEvent<HTMLElement>) {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ ...contextMenuPoint(event), origin: event.currentTarget });
  }

  /** Une action asynchrone sans fenêtre : son échec s'affiche en notification. */
  const attempt = (action: () => void | Promise<void>) => () => {
    void Promise.resolve()
      .then(action)
      .catch((error) => notifyError(errorText(error), "panel-actions"));
  };

  const items: MenuItem[] = [
    { id: "open", label: t("panelActions.open"), icon: ExternalLink, run: onOpen },
    ...(rename ? [{ id: "rename", label: t("panelActions.rename"), icon: Pencil, run: () => setRenaming(true) }] : []),
    ...(addInside ? [{ id: "add", label: addInside.label, icon: Plus, run: attempt(addInside.run) }] : []),
    ...(onDuplicate ? [{ id: "duplicate", label: t("panelActions.duplicate"), icon: Copy, run: attempt(onDuplicate) }] : []),
    ...(remove
      ? [{ id: "delete", label: t("panelActions.delete"), icon: Trash2, danger: true, separated: true, run: () => setDeleting(true) }]
      : []),
  ];

  return (
    <>
      {children(onContextMenu)}

      {menu && (
        <ContextMenu
          label={t("panelActions.menu", { name })}
          items={items}
          x={menu.x}
          y={menu.y}
          onDismiss={(restoreFocus) => {
            // Le focus revient au premier élément focalisable de la ligne.
            if (restoreFocus) (menu.origin.querySelector<HTMLElement>("button, [tabindex]") ?? menu.origin).focus();
            setMenu(null);
          }}
        />
      )}

      {rename && renaming && (
        <RenameDialog name={name} fields={rename.fields} onCancel={() => setRenaming(false)} onSave={async (values) => {
          await rename.save(values);
          setRenaming(false);
        }} />
      )}

      {remove && (
        <ConfirmDialog
          open={deleting}
          title={t("panelActions.deleteTitle", { name })}
          description={remove.description}
          confirmLabel={t("panelActions.deleteConfirm")}
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await remove.run();
            setDeleting(false);
          }}
        />
      )}
    </>
  );
}

function RenameDialog({
  name,
  fields,
  onCancel,
  onSave,
}: {
  name: string;
  fields: RenameField[];
  onCancel: () => void;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, field.value])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empty = fields.every((field) => !values[field.key]?.trim());
  const unchanged = fields.every((field) => values[field.key] === field.value);

  async function save() {
    if (empty || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])));
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogHeader>
        <DialogTitle>{t("panelActions.renameTitle", { name })}</DialogTitle>
        <DialogDescription>{t("panelActions.renameDescription")}</DialogDescription>
      </DialogHeader>

      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {fields.map((field, index) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${id}-${field.key}`}
              autoFocus={index === 0}
              value={values[field.key] ?? ""}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              disabled={busy}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            />
          </div>
        ))}

        {empty && <p className="text-xs text-muted-foreground">{t("panelActions.renameEmpty")}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
          <Button type="submit" disabled={busy || empty || unchanged}>
            {busy ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
