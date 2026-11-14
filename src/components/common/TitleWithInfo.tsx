import type { ReactNode } from "react";
import { InfoTip } from "@/components/common/InfoTip";
import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Titre d'une carte (formulaire, réglage) avec son explication derrière un
 * petit « i », au lieu d'un long texte sous le titre. Les textes courts et
 * les avertissements (suppression…) restent, eux, en `CardDescription`.
 */
export function TitleWithInfo({ info, className, children }: { info: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <CardTitle className={cn("min-w-0", className)}>{children}</CardTitle>
      <InfoTip>{info}</InfoTip>
    </div>
  );
}
