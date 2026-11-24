import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NumberStepper } from "@/components/common/NumberStepper";
import { YearInput } from "@/components/plot/YearInput";
import { Label } from "@/components/ui/label";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { daysInMonth, precisionAllows, type PlotEvent, type TimePrecision, type WhenPatch, type YearDetail } from "@/lib/plot";
import { cn } from "@/lib/utils";

/** Noms des mois dans la langue de l'interface (« mars », « March »…). */
export function useMonthNames(style: "long" | "short" = "long"): string[] {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { month: style, timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, index) => format.format(Date.UTC(2001, index, 1)));
  }, [i18n.language, style]);
}

interface EventWhenFieldsProps {
  event: PlotEvent;
  /** Précision de la frise choisie dans les paramètres du projet. */
  precision: TimePrecision;
  /** Applique le changement (voir `updateWhen`) ; `key` regroupe les saisies pour l'annulation. */
  onChange: (which: "start" | "end", patch: WhenPatch, key: string) => void;
  /** Préfixe des identifiants des champs (deux formulaires du même événement peuvent coexister). */
  idPrefix: string;
}

/**
 * Quand a lieu un événement : son année (et sa fin, pour une période) et,
 * selon la précision de la frise réglée pour le projet, son mois, son jour
 * et son heure. Utilisé par le détail de la frise et le panneau du plateau.
 */
export function EventWhenFields({ event, precision, onChange, idPrefix }: EventWhenFieldsProps) {
  const { t } = useTranslation("plot");

  if (precision === "year") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <FieldBlock id={`${idPrefix}-year`} label={t("event.year")}>
          <YearInput
            id={`${idPrefix}-year`}
            value={event.year}
            placeholder={t("event.yearPlaceholder")}
            onChange={(year) => onChange("start", { year }, `ev:${event.id}:year`)}
            className="flex w-full"
          />
        </FieldBlock>
        <FieldBlock id={`${idPrefix}-year-end`} label={t("event.yearEnd")}>
          <YearInput id={`${idPrefix}-year-end`} value={event.yearEnd} onChange={(year) => onChange("end", { year }, `ev:${event.id}:yearEnd`)} className="flex w-full" />
        </FieldBlock>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DateFields
        legend={t("when.start")}
        idPrefix={`${idPrefix}-start`}
        year={event.year}
        detail={event.yearDetail}
        precision={precision}
        yearPlaceholder={t("event.yearPlaceholder")}
        onChange={(patch, part) => onChange("start", patch, `ev:${event.id}:start:${part}`)}
      />
      <DateFields
        legend={t("when.end")}
        hint={t("when.endHint")}
        idPrefix={`${idPrefix}-end`}
        year={event.yearEnd}
        detail={event.yearEndDetail}
        precision={precision}
        // La fin ne se choisit qu'après le début.
        disabled={event.year === null}
        onChange={(patch, part) => onChange("end", patch, `ev:${event.id}:end:${part}`)}
      />
    </div>
  );
}

function DateFields({
  legend,
  hint,
  idPrefix,
  year,
  detail,
  precision,
  yearPlaceholder,
  disabled,
  onChange,
}: {
  legend: string;
  hint?: string;
  idPrefix: string;
  year: number | null;
  detail: YearDetail | null;
  precision: TimePrecision;
  yearPlaceholder?: string;
  disabled?: boolean;
  onChange: (patch: WhenPatch, part: string) => void;
}) {
  const { t } = useTranslation("plot");
  const months = useMonthNames();
  const month = detail?.month ?? null;
  const day = detail?.day ?? null;
  // Le mois de fin peut se choisir sans année de fin (même année que le début).
  const monthDisabled = disabled;
  const dayDisabled = disabled || month === null;
  const hourDisabled = disabled || day === null;
  const maxDay = month !== null ? daysInMonth(year ?? 2001, month) : 31;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <FieldBlock id={`${idPrefix}-year`} label={t("when.year")}>
          <YearInput id={`${idPrefix}-year`} value={year} placeholder={yearPlaceholder} onChange={(value) => onChange({ year: value }, "year")} className="flex w-full" />
        </FieldBlock>
        <FieldBlock id={`${idPrefix}-month`} label={t("when.month")}>
          <select
            id={`${idPrefix}-month`}
            value={month ?? ""}
            disabled={monthDisabled}
            onChange={(e) => onChange({ month: e.target.value === "" ? null : Number(e.target.value) }, "month")}
            className={cn(fieldClass, "h-7 px-2")}
          >
            <option value="">—</option>
            {months.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </FieldBlock>
        {precisionAllows(precision, "day") && (
          <FieldBlock id={`${idPrefix}-day`} label={t("when.day")}>
            <NumberStepper
              id={`${idPrefix}-day`}
              value={day}
              min={1}
              max={maxDay}
              allowEmpty
              disabled={dayDisabled}
              title={dayDisabled ? t("when.needMonth") : undefined}
              onChange={(value) => onChange({ day: value === null ? null : Math.round(value) }, "day")}
              size="sm"
              valueClassName="w-full min-w-[2.5rem]"
              className="flex w-full"
            />
          </FieldBlock>
        )}
        {precisionAllows(precision, "hour") && (
          <FieldBlock id={`${idPrefix}-hour`} label={t("when.hour")}>
            <NumberStepper
              id={`${idPrefix}-hour`}
              value={detail?.hour ?? null}
              min={0}
              max={23}
              allowEmpty
              disabled={hourDisabled}
              title={hourDisabled ? t("when.needDay") : undefined}
              format={(value) => t("when.hourValue", { hour: value })}
              onChange={(value) => onChange({ hour: value === null ? null : Math.round(value) }, "hour")}
              size="sm"
              valueClassName="w-full min-w-[2.5rem]"
              className="flex w-full"
            />
          </FieldBlock>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

function FieldBlock({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
