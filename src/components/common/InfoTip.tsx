import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Petit « i » rond : l'explication d'une fonctionnalité, au survol, au clavier
 * ou au clic, plutôt qu'un long texte à côté d'elle.
 */
export function InfoTip({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation("common");

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={120}
        type="button"
        aria-label={t("actions.moreInfo")}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:text-foreground",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} collisionPadding={8} className="z-[70]">
          <Popover.Popup className="max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs leading-5 font-normal text-popover-foreground shadow-lg outline-none">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
