import { useTranslation } from "react-i18next";
import { ListTree, MapPin, NotebookText, Package, PawPrint, StickyNote, UserPlus, type LucideIcon } from "lucide-react";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHOICES: Array<{ id: string; feature: string; icon: LucideIcon; key: string }> = [
  { id: "character", feature: "characters.create", icon: UserPlus, key: "1" },
  { id: "location", feature: "locations.create", icon: MapPin, key: "2" },
  { id: "structure", feature: "structure.plan", icon: ListTree, key: "3" },
  { id: "note", feature: "notes.create", icon: NotebookText, key: "4" },
  { id: "sticky", feature: "notes.wall", icon: StickyNote, key: "5" },
];

/** Modules facultatifs : proposés seulement s'ils sont activés. */
const WORLD_CHOICES = {
  item: { id: "item", feature: "items.create", icon: Package, key: "6" },
  species: { id: "species", feature: "species.create", icon: PawPrint, key: "7" },
};

interface CreateChooserProps {
  /** Objets, faune et flore activés pour le projet. */
  world?: { item?: boolean; species?: boolean };
  open: boolean;
  onClose: () => void;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Que voulez-vous créer ? » : Ctrl+N dans un module sans création propre
 * (Détails, Recherche, paramètres). Touches 1 à 7 pour choisir au clavier.
 */
export function CreateChooser({ world = {}, open, onClose, onOpenFeature }: CreateChooserProps) {
  const choices = [
    ...CHOICES,
    ...(world.item ? [WORLD_CHOICES.item] : []),
    ...(world.species ? [WORLD_CHOICES.species] : []),
  ];
  const { t } = useTranslation("menus");
  const tt = t as unknown as (key: string) => string;

  function choose(feature: string) {
    onClose();
    onOpenFeature(feature);
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-md">
      <div
        onKeyDown={(event) => {
          const choice = choices.find((item) => item.key === event.key);
          if (choice) {
            event.preventDefault();
            choose(choice.feature);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        <ul className="mt-4 space-y-1">
          {choices.map((choice) => {
            const Icon = choice.icon;
            return (
              <li key={choice.id}>
                <button
                  type="button"
                  onClick={() => choose(choice.feature)}
                  className="flex h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm hover:border-primary/50 hover:bg-accent"
                >
                  <Icon className="size-4 text-primary" />
                  <span className="flex-1">{tt(`create.${choice.id}`)}</span>
                  <kbd className="rounded border bg-muted px-1.5 font-mono text-[0.7rem] text-muted-foreground">{choice.key}</kbd>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
