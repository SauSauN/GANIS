import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Clapperboard, History, RotateCcw } from "lucide-react";
import { TitleWithInfo } from "@/components/common/TitleWithInfo";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  PREVIOUS_MODULE_ORDER,
  getModule,
  normalizeModuleOrder,
  type ModuleOrderKey,
} from "@/components/workspace/modules";
import { setModuleOrder, useModuleOrder } from "@/lib/preferences";

/**
 * Ordre des modules de la barre de gauche, propre à l'appareil. Les modules
 * absents d'un projet (type de projet, modules du monde désactivés) gardent
 * leur rang quand ils apparaissent. La Recherche reste à la fin.
 */
export function ModuleOrderCard() {
  const { t } = useTranslation("settings");
  const saved = useModuleOrder();
  const order = normalizeModuleOrder(saved);
  const isPrevious = order.every((key, index) => key === PREVIOUS_MODULE_ORDER[index]);

  const labelOf = (key: ModuleOrderKey) => (key === "projectType" ? t("appearance.moduleOrder.projectType") : getModule(key).label);
  const iconOf = (key: ModuleOrderKey) => (key === "projectType" ? Clapperboard : getModule(key).icon);

  function move(index: number, step: -1 | 1) {
    const next = [...order];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setModuleOrder(next);
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.moduleOrder.description")}>{t("appearance.moduleOrder.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="space-y-4 px-6 py-6">
        <ol className="max-w-md divide-y rounded-lg border">
          {order.map((key, index) => {
            const Icon = iconOf(key);
            const label = labelOf(key);
            return (
              <li key={key} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3 text-sm hover:bg-muted/40">
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("appearance.moduleOrder.moveUp", { name: label })}
                  title={t("appearance.moduleOrder.moveUp", { name: label })}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("appearance.moduleOrder.moveDown", { name: label })}
                  title={t("appearance.moduleOrder.moveDown", { name: label })}
                >
                  <ArrowDown />
                </Button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={saved === null} onClick={() => setModuleOrder(null)}>
            <RotateCcw />
            {t("appearance.moduleOrder.reset")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPrevious}
            title={t("appearance.moduleOrder.previousHint")}
            onClick={() => setModuleOrder([...PREVIOUS_MODULE_ORDER])}
          >
            <History />
            {t("appearance.moduleOrder.previous")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
