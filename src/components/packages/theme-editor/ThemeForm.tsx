import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Palette, RotateCcw } from "lucide-react";
import { ThemePreview } from "@/components/packages/ThemePreview";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PALETTE_KEYS,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_STEP,
  cloneTheme,
  contrastRatio,
  isHexColor,
  setActiveColorTheme,
  type PaletteKey,
} from "@/lib/colorTheme";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import { usePackageStore } from "@/stores/packageStore";
import { RELATION_COLORS, RELATION_TYPES } from "@/lib/relations";
import type { RelationType, ThemeData, ThemePalette } from "@/types";
import { errorText } from "@/lib/errors";
import { CollapsibleCard, ColorField, ContrastRow, type SectionId } from "./FormFields";
import { EditorFrame } from "./EditorFrame";

/** Formulaire de l'éditeur de thème : informations, couleurs, relations, forme et aperçu. */
type Mode = "light" | "dark";

/** Limites identiques à celles de Rust (`package_service.rs`). */
const NAME_MAX = 60;

const DESCRIPTION_MAX = 300;

/** Regroupement des couleurs dans l'éditeur. */
const COLOR_GROUPS: { id: "surfaces" | "text" | "accent" | "states"; keys: PaletteKey[] }[] = [
  { id: "surfaces", keys: ["background", "card", "sidebar", "border"] },
  { id: "text", keys: ["foreground", "mutedForeground"] },
  { id: "accent", keys: ["primary", "primaryForeground", "secondary"] },
  { id: "states", keys: ["destructive", "success", "warning"] },
];

// Toutes les couleurs apparaissent exactement une fois dans l'éditeur.
if (import.meta.env.DEV) {
  const listed = COLOR_GROUPS.flatMap((g) => g.keys);
  if (listed.length !== PALETTE_KEYS.length || !PALETTE_KEYS.every((k) => listed.includes(k))) {
    console.error("ThemeEditor : COLOR_GROUPS ne couvre pas toutes les couleurs.");
  }
}

/** Parties fermées, mémorisées sur l'appareil (pour tous les thèmes). */
const COLLAPSED_KEY = "ganis.themeEditor.collapsed";

const SECTION_IDS: SectionId[] = ["colors", "relations", "shape"];

function loadCollapsed(): Set<SectionId> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(
      Array.isArray(raw) ? SECTION_IDS.filter((id) => raw.includes(id)) : [],
    );
  } catch {
    return new Set();
  }
}

function saveCollapsed(collapsed: Set<SectionId>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
  }
}

/** Couleurs invalides d'une palette. */
function invalidKeys(palette: ThemePalette): PaletteKey[] {
  return PALETTE_KEYS.filter((key) => !isHexColor(palette[key]));
}

export interface FormInitial {
  id?: string;
  name: string;
  description: string;
  theme: ThemeData;
  packageId?: string;
  version?: string;
}

export function ThemeForm({
  initial,
  starters,
}: {
  initial: FormInitial;
  starters: { id: string; name: string; theme: ThemeData }[];
}) {
  const { t } = useTranslation(["packages", "relations"]);
  const navigate = useNavigate();
  const createTheme = usePackageStore((s) => s.createTheme);
  const updateTheme = usePackageStore((s) => s.updateTheme);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [theme, setTheme] = useState<ThemeData>(initial.theme);
  const [mode, setMode] = useState<Mode>("light");
  const [starter, setStarter] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(loadCollapsed);

  /** Ouvre ou ferme une partie de l'éditeur (choix mémorisé sur l'appareil). */
  function setSectionOpen(id: SectionId, open: boolean) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  const palette = theme[mode];
  const otherMode: Mode = mode === "light" ? "dark" : "light";
  const modeLabel = (m: Mode) => t(`editor.colors.${m}`);
  const invalid = useMemo(
    () => ({ light: invalidKeys(theme.light), dark: invalidKeys(theme.dark) }),
    [theme],
  );
  const invalidRelations = RELATION_TYPES.filter(
    (type) => theme.relations?.[type] !== undefined && !isHexColor(theme.relations[type]),
  );
  const nameMissing = name.trim() === "";
  const hasErrors =
    nameMissing ||
    invalid.light.length > 0 ||
    invalid.dark.length > 0 ||
    invalidRelations.length > 0;

  function setColor(key: PaletteKey, value: string) {
    setTheme((current) => ({
      ...current,
      [mode]: { ...current[mode], [key]: value },
    }));
  }

  /** Couleur d'un type de relation (la même en mode clair et sombre). */
  function setRelationColor(type: RelationType, value: string) {
    setTheme((current) => ({
      ...current,
      relations: { ...current.relations, [type]: value },
    }));
  }

  /** Revient aux couleurs de relation par défaut (le champ disparaît). */
  function resetRelationColors() {
    setTheme(({ relations: _removed, ...rest }) => rest);
  }

  function applyStarter(id: string) {
    setStarter(id);
    const source = starters.find((s) => s.id === id);
    if (source) {
      setTheme(cloneTheme(source.theme));
    }
  }

  function copyFromOtherMode() {
    setTheme((current) => ({ ...current, [mode]: { ...current[otherMode] } }));
  }

  /** Enregistre puis revient aux packages. */
  async function save(use: boolean) {
    if (await persist(use)) {
      navigate("/packages?view=installed");
    }
  }

  /**
   * Enregistre sans quitter la page ; renvoie `false` si un champ est
   * invalide ou si Rust refuse. Sert aussi à la question « Enregistrer ? »
   * (fermeture de GANIS, sortie de la page).
   */
  async function persist(use = false): Promise<boolean> {
    setSubmitted(true);
    if (hasErrors) {
      // Les parties qui contiennent une erreur s'ouvrent.
      if (invalid.light.length > 0 || invalid.dark.length > 0) setSectionOpen("colors", true);
      if (invalidRelations.length > 0) setSectionOpen("relations", true);

      // Bascule sur le mode qui contient une erreur.
      if (invalid[mode].length === 0 && invalid[otherMode].length > 0) {
        setMode(otherMode);
      }

      return false;
    }

    setSaving(true);
    setError(null);
    const input = {
      name: name.trim(),
      description: description.trim(),
      theme: {
        ...theme,
        light: upper(theme.light),
        dark: upper(theme.dark),
        relations: upperRelations(theme.relations),
      },
    };

    try {
      const saved = initial.id
        ? await updateTheme(initial.id, input)
        : await createTheme(input);
      if (use) {
        setActiveColorTheme(saved.id, saved.theme);
      }

      return true;
    } catch (e) {
      setError(errorText(e, "packages:editor.failed"));
      setSaving(false);
      return false;
    }
  }

  // Modifications non enregistrées : question avant de fermer GANIS ou de
  // quitter la page. Pas d'enregistrement automatique ici : un nouveau
  // thème serait créé à chaque délai.
  const dirty =
    name !== initial.name ||
    description !== initial.description ||
    JSON.stringify(theme) !== JSON.stringify(initial.theme);
  useUnsavedChanges({
    id: `theme-editor:${initial.id ?? "new"}`,
    label: name.trim() || t("editor.createTitle"),
    dirty: dirty && !saving,
    save: () => persist(),
    autoSave: false,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }

  const textContrast = contrastRatio(palette.foreground, palette.background);
  const accentContrast = contrastRatio(palette.primaryForeground, palette.primary);

  return (
    <EditorFrame
      title={t(initial.id ? "editor.editTitle" : "editor.createTitle")}
      subtitle={t("editor.description")}
    >
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      >
        {/* ============================ Colonne formulaire */}
        <div className="min-w-0 space-y-8">
          {/* Informations */}
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle>{t("editor.identity.title")}</CardTitle>
              <CardDescription>{t("editor.identity.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-6 py-6">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="theme-name">{t("editor.identity.name")}</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("editor.identity.counter", { count: name.length, max: NAME_MAX })}
                  </span>
                </div>
                <Input
                  id="theme-name"
                  value={name}
                  maxLength={NAME_MAX}
                  autoFocus={!initial.id}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("editor.identity.namePlaceholder")}
                  aria-invalid={submitted && nameMissing}
                  aria-describedby={submitted && nameMissing ? "theme-name-error" : undefined}
                />
                {submitted && nameMissing && (
                  <p id="theme-name-error" className="text-xs text-destructive">
                    {t("editor.nameRequired")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="theme-description">{t("editor.identity.summary")}</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("editor.identity.counter", {
                      count: description.length,
                      max: DESCRIPTION_MAX,
                    })}
                  </span>
                </div>
                <textarea
                  id="theme-description"
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  rows={2}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("editor.identity.summaryPlaceholder")}
                  className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              {initial.packageId && (
                <p className="text-xs text-muted-foreground">
                  {t("editor.identity.packageId", { id: initial.packageId })} ·{" "}
                  {t("editor.identity.version", { version: initial.version })}
                </p>
              )}
            </CardContent>
          </Card>
          {/* Couleurs */}
          <CollapsibleCard
            id="colors"
            title={t("editor.colors.title")}
            description={t("editor.colors.description")}
            open={!collapsed.has("colors")}
            onOpenChange={(open) => setSectionOpen("colors", open)}
            alert={submitted && (invalid.light.length > 0 || invalid.dark.length > 0)}
          >
            <CardContent className="space-y-6 px-6 py-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                {/* Mode à modifier */}
                <div
                  role="radiogroup"
                  aria-label={t("editor.colors.modeLabel")}
                  className="inline-flex rounded-lg border bg-muted/40 p-0.5"
                >
                  {(["light", "dark"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        mode === m
                          ? "bg-background font-medium shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {modeLabel(m)}
                      {submitted && invalid[m].length > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>
                {/* Point de départ */}
                <div className="space-y-1">
                  <Label htmlFor="theme-starter" className="text-xs">
                    {t("editor.start.label")}
                  </Label>
                  <select
                    id="theme-starter"
                    value={starter}
                    onChange={(e) => applyStarter(e.target.value)}
                    title={t("editor.start.hint")}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {starters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {COLOR_GROUPS.map((group) => (
                <fieldset key={group.id} className="space-y-3">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`editor.colors.groups.${group.id}`)}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.keys.map((key) => (
                      <ColorField
                        key={`${mode}-${key}`}
                        id={`color-${mode}-${key}`}
                        label={t(`editor.colors.keys.${key}`)}
                        value={palette[key]}
                        showError={submitted}
                        onChange={(value) => setColor(key, value)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={copyFromOtherMode}>
                <Copy />
                {t("editor.colors.copyFrom", { mode: modeLabel(otherMode).toLowerCase() })}
              </Button>
            </CardContent>
          </CollapsibleCard>
          {/* Couleurs des relations entre personnages */}
          <CollapsibleCard
            id="relations"
            title={t("editor.relations.title")}
            description={t("editor.relations.description")}
            open={!collapsed.has("relations")}
            onOpenChange={(open) => setSectionOpen("relations", open)}
            alert={submitted && invalidRelations.length > 0}
          >
            <CardContent className="space-y-4 px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {RELATION_TYPES.map((type) => (
                  <ColorField
                    key={type}
                    id={`relation-color-${type}`}
                    label={t(`relations:types.${type}`)}
                    value={theme.relations?.[type] ?? RELATION_COLORS[type].toUpperCase()}
                    showError={submitted}
                    onChange={(value) => setRelationColor(type, value)}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!theme.relations}
                onClick={resetRelationColors}
              >
                <RotateCcw />
                {t("editor.relations.reset")}
              </Button>
            </CardContent>
          </CollapsibleCard>
          {/* Forme */}
          <CollapsibleCard
            id="shape"
            title={t("editor.shape.title")}
            description={t("editor.shape.description")}
            open={!collapsed.has("shape")}
            onOpenChange={(open) => setSectionOpen("shape", open)}
>
            <CardContent className="space-y-3 px-6 py-6">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="theme-radius">{t("editor.shape.radius")}</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {t("editor.shape.value", { value: theme.radius })}
                </span>
              </div>
              <input
                id="theme-radius"
                type="range"
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={RADIUS_STEP}
                value={theme.radius}
                onChange={(e) => setTheme({ ...theme, radius: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </CardContent>
          </CollapsibleCard>
        </div>
        {/* ============================ Colonne aperçu */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-primary" />
              {t("editor.preview.title")}
            </h2>
            <span className="text-xs text-muted-foreground">{modeLabel(mode)}</span>
          </div>
          <ThemePreview
            palette={withFallback(palette, initial.theme[mode])}
            radius={theme.radius}
            modeLabel={modeLabel(mode)}
          />
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("editor.contrast.title")}
            </p>
            <ContrastRow label={t("editor.contrast.text")} ratio={textContrast} />
            <ContrastRow label={t("editor.contrast.accent")} ratio={accentContrast} />
            </div>
            {/* Actions de l'éditeur, placées sous la carte Lisibilité. */}
            <div className="space-y-3">
              {(submitted && hasErrors) || error ? (
                <p role="alert" className="text-sm text-destructive">
                  {submitted && hasErrors ? t("editor.fixErrors") : error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/packages?view=installed")}
                  disabled={saving}
                >
                  {t("editor.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save(false)}
                  disabled={saving}
                >
                  {saving ? t("editor.saving") : t("editor.save")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={saving}
                >
                  <Check />
                  Utiliser
                </Button>
              </div>
            </div>
            </aside>
      </form>
    </EditorFrame>
  );
}

/** Couleurs en majuscules, comme Rust les enregistre. */
function upper(palette: ThemePalette): ThemePalette {
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, palette[key].trim().toUpperCase()]),
  ) as unknown as ThemePalette;
}

/** Couleurs des relations en majuscules ; aucune couleur : champ absent. */
function upperRelations(
  relations: ThemeData["relations"],
): ThemeData["relations"] {
  if (!relations) return undefined;
  const entries = Object.entries(relations).map(([type, color]) => [
    type,
    (color ?? "").trim().toUpperCase(),
  ]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Pendant la saisie, une couleur invalide garde sa valeur précédente dans l'aperçu. */
function withFallback(palette: ThemePalette, fallback: ThemePalette): ThemePalette {
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [
      key,
      isHexColor(palette[key]) ? palette[key] : fallback[key],
    ]),
  ) as unknown as ThemePalette;
}
