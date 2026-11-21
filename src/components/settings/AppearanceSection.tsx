import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Blocks, Check, Info, MapPin, Minus, Monitor, Moon, Package, Plus, RotateCcw, Sun, type LucideIcon } from "lucide-react";
import { ThemeSwatch } from "@/components/packages/ThemeSwatch";
import { useInstalledThemes } from "@/components/packages/useInstalledThemes";
import { ModuleOrderCard } from "@/components/settings/ModuleOrderCard";
import { cardClass, cardHeaderClass } from "@/components/settings/styles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setActiveColorTheme, useActiveColorThemeId } from "@/lib/colorTheme";
import { cn } from "@/lib/utils";
import {
  PANEL_IMAGE_DEFAULT,
  PANEL_IMAGE_MAX,
  PANEL_IMAGE_MIN,
  PANEL_IMAGE_STEP,
  TEXT_SIZES,
  setPanelImageSize,
  setPanelMenuEnabled,
  setTextSize,
  usePanelImageSize,
  usePanelMenuEnabled,
  usePreviewTabsEnabled,
  useSheetPreviewEach,
  setSheetPreviewEach,
  setPreviewTabsEnabled,
  DEFAULT_PROFILE_FRAME,
  PROFILE_FRAME_WIDTHS,
  setProfileFrame,
  useProfileFrame,
  useTextSize,
  type TextSize,
} from "@/lib/preferences";
import {
  setThemeMode,
  useResolvedTheme,
  useThemeMode,
  type ThemeMode,
} from "@/lib/theme";
import { TitleWithInfo } from "@/components/common/TitleWithInfo";
import { ColorMenu } from "@/components/common/ColorMenu";

/** Thèmes proposés (libellés dans `settings.json`). */
const THEME_OPTIONS: { id: ThemeMode; icon: LucideIcon }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

/** Taille de l'aperçu « Aa » de chaque choix. */
const TEXT_SIZE_SAMPLE: Record<TextSize, string> = {
  small: "text-sm",
  normal: "text-base",
  large: "text-xl",
};

/** Style commun des choix : une tuile qui se met en évidence quand elle est choisie. */
const tileClass = (selected: boolean) =>
  cn(
    "flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary bg-primary/5 ring-1 ring-primary"
      : "border-input hover:bg-accent/50",
  );

/**
 * Section « Apparence » : thème et taille du texte.
 *
 * Les changements sont appliqués immédiatement et enregistrés sur
 * cet appareil. Ils n'affectent jamais les données des projets.
 */
export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const themeMode = useThemeMode();
  const textSize = useTextSize();

  return (
    <div className="space-y-8">
      {/* ==================================================================
          THÈME
          ================================================================== */}

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("appearance.theme.title")}</CardTitle>

          <CardDescription>{t("appearance.theme.description")}</CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <div
            role="radiogroup"
            aria-label={t("appearance.theme.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map(({ id, icon: Icon }) => {
              const selected = themeMode === id;
              const label = t(`appearance.theme.options.${id}.label`);
              const description = t(`appearance.theme.options.${id}.description`);

              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  aria-describedby={`theme-${id}-description`}
                  onClick={() => setThemeMode(id)}
                  className={tileClass(selected)}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                      <Icon className="h-4 w-4" />
                    </span>

                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>

                  <span>
                    <span className="block text-sm font-medium">{label}</span>

                    <span
                      id={`theme-${id}-description`}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          THÈME DE COULEURS (packages de type thème)
          ================================================================== */}

      <ColorThemeCard />

      {/* ==================================================================
          TAILLE DU TEXTE
          ================================================================== */}

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("appearance.textSize.title")}</CardTitle>

          <CardDescription>{t("appearance.textSize.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div
            role="radiogroup"
            aria-label={t("appearance.textSize.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {TEXT_SIZES.map((size) => {
              const selected = textSize === size;
              const label = t(`appearance.textSize.options.${size}.label`);

              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  aria-describedby={`text-size-${size}-description`}
                  onClick={() => setTextSize(size)}
                  className={tileClass(selected)}
                >
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "flex h-9 min-w-9 items-center justify-center rounded-lg border bg-background px-2 font-semibold",
                        TEXT_SIZE_SAMPLE[size],
                      )}
                    >
                      Aa
                    </span>

                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>

                  <span>
                    <span className="block text-sm font-medium">{label}</span>

                    <span
                      id={`text-size-${size}-description`}
                      className="mt-1 block text-xs leading-5 text-muted-foreground"
                    >
                      {t(`appearance.textSize.options.${size}.description`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("appearance.preview.title")}
            </p>

            <p className="text-sm leading-7">
              {t("appearance.preview.text")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          IMAGES DU PANNEAU DU MILIEU
          ================================================================== */}

      <PanelImageCard />

      {/* ==================================================================
          MENU CLIC DROIT DU PANNEAU DU MILIEU
          ================================================================== */}

      <PanelMenuCard />

      <ProfileFrameCard />

      <PreviewTabsCard />
      <SheetPreviewCard />

      <ModuleOrderCard />

      {/* ==================================================================
          NOTE
          ================================================================== */}

      <section className="rounded-xl border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>

          <div>
            <h2 className="text-sm font-semibold">
              {t("appearance.note.title")}
            </h2>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("appearance.note.text")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Choix du thème de couleurs parmi les thèmes installés : thèmes système et
 * thèmes créés par l'utilisateur, utilisables directement.
 * L'aperçu suit le mode affiché (clair ou sombre).
 */
function ColorThemeCard() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const resolved = useResolvedTheme();
  const activeId = useActiveColorThemeId();
  const { system, mine } = useInstalledThemes();

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("appearance.colorTheme.title")}</CardTitle>

        <CardDescription>{t("appearance.colorTheme.description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-6 py-6">
        <div
          role="radiogroup"
          aria-label={t("appearance.colorTheme.title")}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[...system, ...mine].map((item) => {
            const selected = activeId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setActiveColorTheme(item.id, item.theme)}
                className={cn(tileClass(selected), "gap-2 p-3")}
              >
                <ThemeSwatch palette={item.theme[resolved]} className="h-14 w-full" />

                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={() => navigate("/packages")}>
          <Blocks />
          {t("appearance.colorTheme.manage")}
        </Button>
      </CardContent>
    </Card>
  );
}
/**
 * Menu clic droit des éléments du panneau du milieu (ouvrir, renommer,
 * ajouter dedans, dupliquer, supprimer) : activé par défaut.
 */
function PanelMenuCard() {
  const { t } = useTranslation("settings");
  const enabled = usePanelMenuEnabled();

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.panelMenu.description")}>{t("appearance.panelMenu.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="panel-menu-label" className="text-sm font-medium">
              {t("appearance.panelMenu.toggle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {enabled ? t("appearance.panelMenu.on") : t("appearance.panelMenu.off")}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="panel-menu-label"
            onClick={() => setPanelMenuEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              enabled ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                enabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Couleurs proposées pour le cadre des photos (blanc par défaut). */
const FRAME_COLORS = ["#ffffff", "#f5ecd7", "#e4e4e7", "#a1a1aa", "#27272a", "#c9a227"] as const;
const FRAME_COLOR_KEYS: Record<(typeof FRAME_COLORS)[number], "white" | "cream" | "lightGrey" | "grey" | "black" | "gold"> = {
  "#ffffff": "white",
  "#f5ecd7": "cream",
  "#e4e4e7": "lightGrey",
  "#a1a1aa": "grey",
  "#27272a": "black",
  "#c9a227": "gold",
};

/**
 * Cadre des photos de profil (personnages, lieux, objets…) : blanc par
 * défaut, comme un tirage photo. On peut le retirer, changer sa couleur
 * et son épaisseur. Un aperçu montre le résultat.
 */
function ProfileFrameCard() {
  const { t } = useTranslation("settings");
  const frame = useProfileFrame();
  const changed =
    frame.enabled !== DEFAULT_PROFILE_FRAME.enabled ||
    frame.color !== DEFAULT_PROFILE_FRAME.color ||
    frame.width !== DEFAULT_PROFILE_FRAME.width;

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.profileFrame.description")}>{t("appearance.profileFrame.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="profile-frame-label" className="text-sm font-medium">
              {t("appearance.profileFrame.toggle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {frame.enabled ? t("appearance.profileFrame.on") : t("appearance.profileFrame.off")}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={frame.enabled}
            aria-labelledby="profile-frame-label"
            onClick={() => setProfileFrame({ enabled: !frame.enabled })}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              frame.enabled ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                frame.enabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>

        <div className={cn("flex flex-wrap items-end gap-6 border-t pt-6", !frame.enabled && "opacity-50")}>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("appearance.profileFrame.color")}</p>
            <ColorMenu
              label={t("appearance.profileFrame.color")}
              options={FRAME_COLORS.map((color) => ({
                value: color,
                swatch: color,
                label: t(`appearance.profileFrame.colors.${FRAME_COLOR_KEYS[color]}`),
              }))}
              value={frame.color}
              current={frame.color}
              onSelect={(color) => color && setProfileFrame({ color })}
              custom={{ label: t("appearance.profileFrame.customColor") }}
              disabled={!frame.enabled}
            />
          </div>

          <div className="space-y-1.5">
            <p id="profile-frame-width" className="text-sm font-medium">{t("appearance.profileFrame.width")}</p>
            <div role="radiogroup" aria-labelledby="profile-frame-width" className="inline-flex rounded-md border p-0.5">
              {PROFILE_FRAME_WIDTHS.map((width) => (
                <button
                  key={width}
                  type="button"
                  role="radio"
                  aria-checked={frame.width === width}
                  disabled={!frame.enabled}
                  onClick={() => setProfileFrame({ width })}
                  className={cn(
                    "h-8 rounded px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    frame.width === width ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {t(`appearance.profileFrame.widths.${width}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Retour au cadre par défaut, juste à droite de l'épaisseur. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            disabled={!changed}
            onClick={() => setProfileFrame(DEFAULT_PROFILE_FRAME)}
          >
            <RotateCcw />
            {t("appearance.profileFrame.reset")}
          </Button>

          {/* Aperçu : une photo fictive dans le cadre choisi. */}
          <div className="ml-auto flex items-end gap-3" aria-hidden="true">
            <span
              className="profile-frame block size-16 rounded-lg"
              style={{ background: "linear-gradient(135deg, #6366f1, #0891b2 55%, #f59e0b)" }}
            />
            <span
              className="profile-frame block size-16 rounded-full"
              style={{ background: "linear-gradient(135deg, #db2777, #7c3aed)" }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Onglets d'aperçu (comme VS Code) : un simple clic dans le panneau du
 * milieu ouvre un onglet provisoire, remplacé par le suivant ; le
 * double-clic le garde. Activé par défaut.
 */
function PreviewTabsCard() {
  const { t } = useTranslation("settings");
  const enabled = usePreviewTabsEnabled();

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.previewTabs.description")}>{t("appearance.previewTabs.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="preview-tabs-label" className="text-sm font-medium">
              {t("appearance.previewTabs.toggle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {enabled ? t("appearance.previewTabs.on") : t("appearance.previewTabs.off")}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="preview-tabs-label"
            onClick={() => setPreviewTabsEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              enabled ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                enabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Aperçu des fiches personnage (bouton livre / crayon de la barre
 * d'onglets) : pour toutes les fiches (par défaut) ou fiche par fiche.
 */
function SheetPreviewCard() {
  const { t } = useTranslation("settings");
  const each = useSheetPreviewEach();

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.sheetPreview.description")}>{t("appearance.sheetPreview.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="sheet-preview-label" className="text-sm font-medium">
              {t("appearance.sheetPreview.toggle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {each ? t("appearance.sheetPreview.on") : t("appearance.sheetPreview.off")}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={each}
            aria-labelledby="sheet-preview-label"
            onClick={() => setSheetPreviewEach(!each)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              each ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                each ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Taille des images du panneau du milieu (listes des personnages, lieux,
 * objets, faune et flore) : un seul réglage pour toutes, borné.
 */
function PanelImageCard() {
  const { t } = useTranslation("settings");
  const size = usePanelImageSize();
  const rows = [
    { key: "character", label: t("appearance.panelImage.sample.character") },
    { key: "location", label: t("appearance.panelImage.sample.location"), icon: MapPin },
    { key: "item", label: t("appearance.panelImage.sample.item"), icon: Package },
  ];

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("appearance.panelImage.description")}>{t("appearance.panelImage.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("appearance.panelImage.smaller")}
              title={t("appearance.panelImage.smaller")}
              disabled={size <= PANEL_IMAGE_MIN}
              onClick={() => setPanelImageSize(size - PANEL_IMAGE_STEP)}
            >
              <Minus />
            </Button>
            <input
              type="range"
              min={PANEL_IMAGE_MIN}
              max={PANEL_IMAGE_MAX}
              step={PANEL_IMAGE_STEP}
              value={size}
              onChange={(e) => setPanelImageSize(Number(e.target.value))}
              aria-label={t("appearance.panelImage.title")}
              aria-valuetext={t("appearance.panelImage.value", { size })}
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("appearance.panelImage.larger")}
              title={t("appearance.panelImage.larger")}
              disabled={size >= PANEL_IMAGE_MAX}
              onClick={() => setPanelImageSize(size + PANEL_IMAGE_STEP)}
            >
              <Plus />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {t("appearance.panelImage.value", { size })}
              {" · "}
              {t("appearance.panelImage.range", { min: PANEL_IMAGE_MIN, max: PANEL_IMAGE_MAX })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={size === PANEL_IMAGE_DEFAULT}
              onClick={() => setPanelImageSize(PANEL_IMAGE_DEFAULT)}
            >
              <RotateCcw />
              {t("appearance.panelImage.reset")}
            </Button>
          </div>
        </div>

        {/* Aperçu : trois lignes comme dans le panneau du milieu. */}
        <div className="rounded-lg border bg-sidebar p-2" aria-hidden="true">
          <p className="mb-1 px-2 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("appearance.preview.title")}
          </p>
          {rows.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
              {Icon ? (
                <span className="flex size-(--panel-thumb) shrink-0 items-center justify-center rounded-md bg-primary/70 text-white">
                  <Icon className="size-[calc(var(--panel-thumb)*0.6)]" />
                </span>
              ) : (
                <span className="inline-flex size-(--panel-thumb) shrink-0 items-center justify-center rounded-full bg-primary text-[length:calc(var(--panel-thumb)*0.4)] font-semibold text-white">
                  AB
                </span>
              )}
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
