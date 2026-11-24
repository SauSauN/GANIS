import { useTranslation } from "react-i18next";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Écran vide des pages de personnages (arcs, relations) quand il manque des
 * personnages : le même cadre en tirets que la liste des personnages vide,
 * une phrase courte et le bouton pour en créer un.
 */
export function CharactersEmptyState({ message, onCreate }: { message: string; onCreate: () => void }) {
  const { t } = useTranslation("characters");
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      <Users className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button className="mt-4" onClick={onCreate}>
        <UserPlus />
        {t("arcs.createCharacter")}
      </Button>
    </div>
  );
}
