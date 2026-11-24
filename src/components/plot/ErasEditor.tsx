import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Flag, LocateFixed, Plus, Trash2 } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { YearInput } from "@/components/plot/YearInput";
import { ColorSwatches } from "@/components/structure/ColorSwatches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_YEAR, newId, PLOT_PALETTE, type PlotData, type PlotEra } from "@/lib/plot";
import { cn } from "@/lib/utils";

interface ErasEditorProps {
  data: PlotData;
  mutate: (fn: (d: PlotData) => void, key?: string) => void;
  /** Année affichée avec le nom des années du projet (« an 312 »). */
  yearText: (year: number) => string;
  /** Époque ouverte pour être modifiée (une seule à la fois). */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Montre l'époque sur la frise. */
  onShow: (era: PlotEra) => void;
}

/**
 * Époques de la frise chronologique (« Guerre des Cendres », an 301 à 318) :
 * grandes périodes du monde, en bandeaux au-dessus des années. Elles font
 * partie de l'histoire, pas des réglages : elles se créent sur la frise.
 *
 * Chaque époque est une carte lisible (couleur, nom, années, durée) ; un
 * clic l'ouvre pour la modifier, avec des champs nommés. Une seule est
 * ouverte à la fois, pour que le panneau reste aéré.
 */
export function ErasEditor({ data, mutate, yearText, openId, onOpenChange, onShow }: ErasEditorProps) {
  const { t } = useTranslation("plot");
  /** Époque qui vient d'être créée : son nom prend le focus. */
  const createdRef = useRef<string | null>(null);

  const add = () => {
    const id = newId();
    mutate((d) => {
      // Après la dernière époque, sinon à l'année du premier événement daté.
      const last = d.eras[d.eras.length - 1];
      const years = d.events.map((e) => e.year).filter((y): y is number => y !== null);
      const from = last ? last.to : years.length ? Math.min(...years) : DEFAULT_YEAR;
      d.eras.push({ id, name: "", from, to: from + 10, color: PLOT_PALETTE[d.eras.length % PLOT_PALETTE.length] });
    });
    createdRef.current = id;
    onOpenChange(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold">{t("timeline.eras")}</h2>
        <InfoTip>{t("timeline.erasHint")}</InfoTip>
      </div>

      {data.eras.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
          <Flag className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("timeline.noEras")}</p>
          <Button onClick={add}>
            <Plus />
            {t("timeline.addEra")}
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {data.eras.map((era) => (
              <li key={era.id}>
                <EraCard
                  era={era}
                  open={openId === era.id}
                  focusName={createdRef.current === era.id}
                  onFocused={() => (createdRef.current = null)}
                  yearText={yearText}
                  mutate={mutate}
                  onToggle={() => onOpenChange(openId === era.id ? null : era.id)}
                  onShow={() => onShow(era)}
                />
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" onClick={add}>
            <Plus />
            {t("timeline.addEra")}
          </Button>
        </>
      )}
    </div>
  );
}

function EraCard({
  era,
  open,
  focusName,
  onFocused,
  yearText,
  mutate,
  onToggle,
  onShow,
}: {
  era: PlotEra;
  open: boolean;
  focusName: boolean;
  onFocused: () => void;
  yearText: (year: number) => string;
  mutate: ErasEditorProps["mutate"];
  onToggle: () => void;
  onShow: () => void;
}) {
  const { t } = useTranslation("plot");
  const nameRef = useRef<HTMLInputElement>(null);
  const name = era.name || t("timeline.newEra");
  const formId = `era-form-${era.id}`;
  const edit = (fn: (target: PlotEra, d: PlotData) => void, key: string) =>
    mutate((d) => {
      const target = d.eras.find((item) => item.id === era.id);
      if (target) fn(target, d);
    }, key);

  // Nouvelle époque : on écrit tout de suite son nom.
  useEffect(() => {
    if (open && focusName) {
      nameRef.current?.focus();
      onFocused();
    }
  }, [open, focusName, onFocused]);

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow", open && "shadow-md")}>
      {/* En-tête : ce qu'on lit d'un coup d'œil ; un clic ouvre le formulaire. */}
      <div className="flex items-stretch">
        <span className="w-1.5 shrink-0" style={{ background: era.color }} aria-hidden="true" />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={formId}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            {/* Le nom, et sa durée alignée à droite sur la même ligne ; les dates dessous. */}
            <span className="flex items-center gap-3">
              <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !era.name && "text-muted-foreground italic")}>{name}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{t("timeline.years", { count: era.to - era.from })}</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
              {yearText(era.from)} → {yearText(era.to)}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div id={formId} className="space-y-4 border-t px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor={`era-name-${era.id}`}>{t("timeline.eraName")}</Label>
            <Input
              ref={nameRef}
              id={`era-name-${era.id}`}
              value={era.name}
              maxLength={80}
              placeholder={t("timeline.eraNamePlaceholder")}
              onChange={(e) => edit((target) => void (target.name = e.target.value.slice(0, 80)), `era:${era.id}:name`)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`era-from-${era.id}`}>{t("timeline.eraFrom")}</Label>
              <YearInput
                id={`era-from-${era.id}`}
                value={era.from}
                onChange={(year) =>
                  year !== null &&
                  edit((target, d) => {
                    target.from = Math.min(year, target.to);
                    d.eras.sort((a, b) => a.from - b.from || a.to - b.to);
                  }, `era:${era.id}:from`)
                }
                className="flex w-full"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`era-to-${era.id}`}>{t("timeline.eraTo")}</Label>
              <YearInput
                id={`era-to-${era.id}`}
                value={era.to}
                onChange={(year) => year !== null && edit((target) => void (target.to = Math.max(year, target.from)), `era:${era.id}:to`)}
                className="flex w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t("timeline.eraColor")}</span>
            <ColorSwatches label={t("timeline.eraColor")} value={era.color} fallback={era.color} onChange={(color) => color && edit((target) => void (target.color = color), `era:${era.id}:color`)} />
          </div>

          {/* Actions : voir sur la frise ; supprimer, à part et en dernier. */}
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mutate((d) => void (d.eras = d.eras.filter((item) => item.id !== era.id)))}
              title={t("timeline.deleteEra", { name })}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
              {t("timeline.deleteEraShort")}
            </Button>
            <Button variant="outline" size="sm" onClick={onShow}>
              <LocateFixed />
              {t("timeline.showEra")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
