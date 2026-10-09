import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, Lock, Palette } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { ThemePreview } from "@/components/packages/ThemePreview";
import { useInstalledThemes } from "@/components/packages/useInstalledThemes";
import {
  cardClass,
  cardFooterClass,
  cardHeaderClass,
} from "@/components/settings/styles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_THEME_ID,
  MIN_TEXT_CONTRAST,
  PALETTE_KEYS,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_STEP,
  cloneTheme,
  contrastRatio,
  findBuiltinTheme,
  isHexColor,
  setActiveColorTheme,
  type PaletteKey,
} from "@/lib/colorTheme";
import { canDevelop } from "@/lib/roles";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { useGuardedNavigate } from "@/components/layout/UnsavedChangesGuard";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { usePackageStore } from "@/stores/packageStore";
import type { ThemeData, ThemePalette } from "@/types";

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

/** Couleurs invalides d'une palette. */
function invalidKeys(palette: ThemePalette): PaletteKey[] {
  return PALETTE_KEYS.filter((key) => !isHexColor(palette[key]));
}

/**
 * Éditeur de thème (mode développeur).
 *
 * - `/packages/themes/new` : nouveau thème, à partir du thème par défaut ;
 * - `/packages/themes/:packageId` : modification d'un thème de l'utilisateur.
 *
 * L'aperçu est local au formulaire : rien ne change dans l'interface tant
 * que le thème n'est pas enregistré puis utilisé.
 */
export default function ThemeEditor() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("packages");
  const user = useAuthStore((s) => s.user);

  const { system, mine, loaded, loadError } = useInstalledThemes();
  const editing = packageId !== undefined;
  const existing = editing ? mine.find((m) => m.id === packageId) : undefined;

  if (!canDevelop(user)) {
    return (
      <EditorFrame title={t("editor.forbiddenTitle")}>
        <Notice
          icon={Lock}
          title={t("editor.forbiddenTitle")}
          text={t("editor.forbiddenText")}
          action={
            <Button onClick={() => navigate("/settings?section=developer")}>
              {t("editor.toDeveloper")}
            </Button>
          }
        />
      </EditorFrame>
    );
  }

  if (editing && !existing) {
    // Liste pas encore chargée : on attend sans afficher d'erreur.
    if (!loaded && !loadError) {
      return <EditorFrame title={t("editor.editTitle")} />;
    }

    return (
      <EditorFrame title={t("editor.editTitle")}>
        <Notice
          icon={AlertTriangle}
          title={t("editor.editTitle")}
          text={t("editor.notFound")}
          action={
            <Button variant="outline" onClick={() => navigate("/packages")}>
              {t("editor.back")}
            </Button>
          }
        />
      </EditorFrame>
    );
  }

  const starters = [...system, ...mine.filter((m) => m.id !== packageId)];

  return (
    <ThemeForm
      // Nouveau formulaire si l'on passe d'un thème à un autre.
      key={packageId ?? "new"}
      initial={
        existing
          ? {
              id: existing.id,
              name: existing.name,
              description: existing.description,
              theme: cloneTheme(existing.theme),
              packageId: existing.packageId,
              version: existing.version,
            }
          : {
              name: "",
              description: "",
              theme: cloneTheme(findBuiltinTheme(DEFAULT_THEME_ID)!.theme),
            }
      }
      starters={starters.map((s) => ({ id: s.id, name: s.name, theme: s.theme }))}
    />
  );
}

// ----------------------------------------------------------------------------
// Formulaire
// ----------------------------------------------------------------------------

interface FormInitial {
  id?: string;
  name: string;
  description: string;
  theme: ThemeData;
  packageId?: string;
  version?: string;
}

function ThemeForm({
  initial,
  starters,
}: {
  initial: FormInitial;
  starters: { id: string; name: string; theme: ThemeData }[];
}) {
  const { t } = useTranslation("packages");
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

  const palette = theme[mode];
  const otherMode: Mode = mode === "light" ? "dark" : "light";
  const modeLabel = (m: Mode) => t(`editor.colors.${m}`);

  const invalid = useMemo(
    () => ({ light: invalidKeys(theme.light), dark: invalidKeys(theme.dark) }),
    [theme],
  );
  const nameMissing = name.trim() === "";
  const hasErrors = nameMissing || invalid.light.length > 0 || invalid.dark.length > 0;

  function setColor(key: PaletteKey, value: string) {
    setTheme((current) => ({
      ...current,
      [mode]: { ...current[mode], [key]: value },
    }));
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
      setError(e instanceof Error ? e.message : t("editor.failed"));
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
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle>{t("editor.colors.title")}</CardTitle>
              <CardDescription>{t("editor.colors.description")}</CardDescription>
            </CardHeader>

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
          </Card>

          {/* Forme */}
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle>{t("editor.shape.title")}</CardTitle>
              <CardDescription>{t("editor.shape.description")}</CardDescription>
            </CardHeader>

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

            <CardFooter className={cn(cardFooterClass, "flex-wrap justify-end gap-2")}>
              {/* Erreurs de saisie (tant qu'il en reste), sinon erreur de Rust */}
              {(submitted && hasErrors) || error ? (
                <p role="alert" className="mr-auto text-sm text-destructive">
                  {submitted && hasErrors ? t("editor.fixErrors") : error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/packages?view=installed")}
                disabled={saving}
              >
                {t("editor.cancel")}
              </Button>
              <Button type="submit" variant="outline" disabled={saving}>
                {saving ? t("editor.saving") : t("editor.save")}
              </Button>
              <Button type="button" onClick={() => void save(true)} disabled={saving}>
                <Check />
                {t("editor.saveAndUse")}
              </Button>
            </CardFooter>
          </Card>
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

/** Pendant la saisie, une couleur invalide garde sa valeur précédente dans l'aperçu. */
function withFallback(palette: ThemePalette, fallback: ThemePalette): ThemePalette {
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [
      key,
      isHexColor(palette[key]) ? palette[key] : fallback[key],
    ]),
  ) as unknown as ThemePalette;
}

// ----------------------------------------------------------------------------
// Éléments du formulaire
// ----------------------------------------------------------------------------

function ColorField({
  id,
  label,
  value,
  showError,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  showError: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("packages");
  const valid = isHexColor(value);
  const error = showError && !valid;

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        {/* Sélecteur natif : décoratif pour les lecteurs d'écran, le champ texte suffit. */}
        <input
          type="color"
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          tabIndex={-1}
          aria-hidden="true"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw.startsWith("#") || raw === "" ? raw : `#${raw}`);
          }}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="font-mono uppercase"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {t("editor.colors.invalid")}
        </p>
      )}
    </div>
  );
}

function ContrastRow({ label, ratio }: { label: string; ratio: number | null }) {
  const { t, i18n } = useTranslation("packages");

  if (ratio === null) {
    return null;
  }

  const good = ratio >= MIN_TEXT_CONTRAST;
  const value = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 1,
  }).format(ratio);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0">{label}</span>
      <span
        className={cn("flex shrink-0 items-center gap-1 tabular-nums", good ? "" : "text-destructive")}
        title={t(good ? "editor.contrast.good" : "editor.contrast.low")}
      >
        {good ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {t("editor.contrast.ratio", { ratio: value })}
        <span className="sr-only">
          {" "}— {t(good ? "editor.contrast.good" : "editor.contrast.low")}
        </span>
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cadre de page
// ----------------------------------------------------------------------------

function EditorFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation("packages");
  // Le bouton « Retour » demande d'abord quoi faire des modifications.
  const navigate = useGuardedNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 pb-24 lg:px-10">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {t("title")} · {t("categories.theme")}
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>

            <Button variant="outline" onClick={() => navigate("/packages?view=installed")}>
              <ArrowLeft />
              {t("editor.back")}
            </Button>
          </header>

          {children}
        </div>
      </main>

      <StatusBar />
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Lock;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}
