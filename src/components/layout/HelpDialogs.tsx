import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FolderKanban,
  Globe,
  Keyboard,
  LayoutPanelLeft,
  ListTree,
  MapPin,
  Package,
  Network,
  Palette,
  PenLine,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import ganisLogo from "@/assets/ganis-logo.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { writeText as writeNativeClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { api, isTauri } from "@/lib/api";
import { buildReport } from "@/lib/problemReport";
import { RELEASES, releaseId, shouldShowWhatsNew } from "@/lib/releaseNotes";
import { useSaveStatusStore } from "@/lib/saveStatus";
import { useAuthStore } from "@/stores/authStore";
import { formatCombo, REFERENCE, SHORTCUTS, useHelpStore, type AppAction, type KeyCombo } from "@/lib/shortcuts";
import { useKeyLabels } from "@/lib/keyLabels";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// Guide de démarrage
// ----------------------------------------------------------------------------

/**
 * Étapes du guide, dans l'ordre. Textes : `help.json` → `guide.steps.<id>`
 * (`title`, `text`, et `points` : la liste des points clés).
 */
const STEPS: Array<{ id: string; icon: LucideIcon }> = [
  { id: "projects", icon: FolderKanban },
  { id: "spaces", icon: Globe },
  { id: "layout", icon: LayoutPanelLeft },
  { id: "synopsis", icon: PenLine },
  { id: "characters", icon: Users },
  { id: "locations", icon: MapPin },
  { id: "world", icon: Package },
  { id: "relations", icon: Network },
  { id: "structure", icon: ListTree },
  { id: "plot", icon: Waypoints },
  { id: "notes", icon: StickyNote },
  { id: "search", icon: Search },
  { id: "saving", icon: Save },
  { id: "trash", icon: Trash2 },
  { id: "export", icon: Download },
  { id: "personalize", icon: Palette },
  { id: "keyboard", icon: Keyboard },
];

function GuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["help", "common"]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;
  const tt = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const points = t(`guide.steps.${current.id}.points` as never, {
    returnObjects: true,
  }) as unknown;
  const pointList = Array.isArray(points) ? (points as string[]) : [];

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-xl" guardInput={false}>
      <DialogHeader>
        <p className="text-xs font-medium text-primary">
          {t("guide.progress", { current: step + 1, total: STEPS.length })}
        </p>
        <DialogTitle>{t("guide.title")}</DialogTitle>
        <DialogDescription>{t("guide.description")}</DialogDescription>
      </DialogHeader>

      {/* Hauteur minimale : les boutons ne sautent pas d'une étape à l'autre. */}
      <div className="mt-5 flex min-h-[17rem] gap-4 rounded-lg border bg-muted/30 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-3">
          <h3 className="font-semibold">{tt(`guide.steps.${current.id}.title`)}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{tt(`guide.steps.${current.id}.text`)}</p>

          {pointList.length > 0 && (
            <ul className="space-y-1.5">
              {pointList.map((point) => (
                <li key={point} className="flex gap-2 text-sm leading-6">
                  <Check className="mt-1 size-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Points de progression : un clic va directement à l'étape. */}
      <div className="mt-4 flex justify-center gap-1" role="tablist" aria-label={t("guide.title")}>
        {STEPS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === step}
            aria-label={tt(`guide.steps.${item.id}.title`)}
            title={tt(`guide.steps.${item.id}.title`)}
            onClick={() => setStep(index)}
            className="flex size-6 items-center justify-center"
          >
            <span
              className={cn(
                "size-2 rounded-full bg-muted-foreground/30 transition-all",
                index === step && "w-5 bg-primary",
              )}
            />
          </button>
        ))}
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("guide.close")}
        </Button>
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ChevronLeft className="mr-1 size-4" />
          {t("guide.previous")}
        </Button>
        <Button onClick={() => (last ? onClose() : setStep(step + 1))}>
          {last ? t("guide.finish") : t("guide.next")}
          {!last && <ChevronRight className="ml-1 size-4" />}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Raccourcis clavier
// ----------------------------------------------------------------------------

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="rounded border border-b-2 bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] font-medium text-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["help", "common"]);
  const tt = t as unknown as (key: string) => string;
  const keyLabels = useKeyLabels();
  const format = (combos: KeyCombo[]) => combos.map((combo) => formatCombo(combo, keyLabels));

  const commands: Array<{ action: AppAction; keys: string[] }> = SHORTCUTS.map((shortcut) => ({
    action: shortcut.action,
    // « Ctrl+: » (claviers AZERTY) fait la même chose que « Ctrl+/ » : pas répété.
    keys: format(shortcut.combos.filter((combo) => combo.key !== ":")),
  }));

  const groups: Array<{ id: "general" | "tabs" | "editor"; rows: Array<{ label: string; keys: string[] }> }> = [
    {
      id: "general",
      rows: [
        ...commands
          .filter((c) => !["closeTab", "nextTab", "previousTab"].includes(c.action))
          .map((c) => ({ label: tt(`shortcuts.actions.${c.action}`), keys: c.keys })),
        ...REFERENCE.filter((r) => r.group === "general").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: format(r.keys) })),
      ],
    },
    {
      id: "tabs",
      rows: [
        ...commands
          .filter((c) => ["closeTab", "nextTab", "previousTab"].includes(c.action))
          .map((c) => ({ label: tt(`shortcuts.actions.${c.action}`), keys: c.keys })),
        ...REFERENCE.filter((r) => r.group === "tabs").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: format(r.keys) })),
      ],
    },
    {
      id: "editor",
      rows: REFERENCE.filter((r) => r.group === "editor").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: format(r.keys) })),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-6xl" guardInput={false}>
      <div className="flex items-start justify-between gap-4">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common:actions.close")}
          title={t("common:actions.close")}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {tt(`shortcuts.groups.${group.id}`)}
            </h3>
            <dl className="divide-y rounded-lg border">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <dt className="min-w-0">{row.label}</dt>
                  <dd>
                    <Keys keys={row.keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// À propos
// ----------------------------------------------------------------------------

function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["help", "common", "projects"]);
  const show = useHelpStore((state) => state.show);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-lg" guardInput={false}>
      <div className="flex flex-col items-center gap-2 text-center">
        <img src={ganisLogo} alt="" aria-hidden="true" className="size-16 object-contain" />
        <DialogTitle>GANIS</DialogTitle>
        <DialogDescription>{t("about.tagline")}</DialogDescription>
        {version && <p className="rounded-full bg-muted px-2.5 py-0.5 text-xs tabular-nums">{t("about.version", { version })}</p>}
      </div>

      <p className="mt-5 text-sm leading-6">{t("about.description")}</p>

      <div className="mt-5 space-y-4 text-sm">
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("about.types")}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ABOUT_TYPES.map((type) => (
              <li key={type} className="rounded-full border px-2.5 py-0.5 text-xs">
                {t(`projects:types.${type}`)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("about.privacy")}</h3>
          <p className="mt-1 leading-6 text-muted-foreground">{t("about.offline")}</p>
        </section>
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("about.credits")}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("about.dictionaries")}</p>
        </section>
      </div>

      <DialogFooter className="mt-6">
        <Button variant="outline" onClick={() => show("center")}>
          <BookOpen className="mr-1.5 size-4" />
          {t("about.openHelp")}
        </Button>
        <Button onClick={onClose}>{t("common:actions.close")}</Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Types de projets présentés dans « À propos ». */
const ABOUT_TYPES = ["novel", "manga", "film", "series", "game", "rpg", "custom"] as const;

// ----------------------------------------------------------------------------
// Aide intégrée (une rubrique par module + questions fréquentes)
// ----------------------------------------------------------------------------

const CENTER_SECTIONS = ["workspace", "details", "characters", "locations", "world", "structure", "reading", "plot", "notes", "search", "history", "files", "settings", "about", "faq"] as const;
type CenterSection = (typeof CENTER_SECTIONS)[number];

interface SectionContent {
  title: string;
  intro: string;
  items: string[];
}

interface FaqContent {
  title: string;
  items: Array<{ q: string; a: string }>;
}

const foldText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function HelpCenterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["help", "common"]);
  const show = useHelpStore((state) => state.show);
  const [section, setSection] = useState<CenterSection>("workspace");
  const [query, setQuery] = useState("");
  const tr = t as unknown as (key: string, options?: Record<string, unknown>) => unknown;

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const contentOf = (id: CenterSection): SectionContent | FaqContent =>
    id === "faq"
      ? (tr("center.faq", { returnObjects: true }) as FaqContent)
      : (tr(`center.sections.${id}`, { returnObjects: true }) as SectionContent);

  const q = foldText(query.trim());
  const matches = (id: CenterSection) => {
    if (!q) return true;
    const content = contentOf(id);
    const text =
      "intro" in content
        ? [content.title, content.intro, ...content.items].join(" ")
        : [content.title, ...content.items.flatMap((item) => [item.q, item.a])].join(" ");
    return foldText(text).includes(q);
  };
  const visible = CENTER_SECTIONS.filter(matches);
  const current = visible.includes(section) ? section : visible[0];
  const content = current ? contentOf(current) : null;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="flex h-[min(46rem,calc(100vh-2rem))] max-w-5xl flex-col p-0" guardInput={false}>
      <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            {t("center.title")}
          </DialogTitle>
          <DialogDescription className="mt-1.5">{t("center.description")}</DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => show("guide")}>
            {t("center.openGuide")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => show("shortcuts")}>
            <Keyboard className="mr-1.5 size-3.5" />
            {t("center.openShortcuts")}
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common:actions.close")}
            title={t("common:actions.close")}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-60 shrink-0 flex-col gap-2 border-r p-3" aria-label={t("center.title")}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("center.search")}
            aria-label={t("center.search")}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={id === current ? "page" : undefined}
                  onClick={() => setSection(id)}
                  className={cn(
                    "flex min-h-8 w-full items-center rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
                    id === current && "bg-primary/10 font-medium text-primary",
                  )}
                >
                  {contentOf(id).title}
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{t("center.noMatch")}</li>}
          </ul>
        </nav>

        <article className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {content && "intro" in content && (
            <>
              <h3 className="text-xl font-semibold">{content.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{content.intro}</p>
              <ul className="mt-5 space-y-3">
                {content.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {content && !("intro" in content) && (
            <>
              <h3 className="text-xl font-semibold">{content.title}</h3>
              <div className="mt-5 space-y-2">
                {content.items
                  .filter((item) => !q || foldText(`${item.q} ${item.a}`).includes(q))
                  .map((item) => (
                    <details key={item.q} className="group rounded-lg border bg-card px-4 py-3 open:shadow-sm">
                      <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                        <span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90">›</span>
                        {item.q}
                      </summary>
                      <p className="mt-2 pl-5 text-sm leading-6 text-muted-foreground">{item.a}</p>
                    </details>
                  ))}
              </div>
            </>
          )}
        </article>
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Nouveautés
// ----------------------------------------------------------------------------

function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["help", "common"]);
  const tr = t as unknown as (key: string, options?: Record<string, unknown>) => unknown;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-xl" guardInput={false}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          {t("whatsNew.title")}
        </DialogTitle>
        <DialogDescription>{t("whatsNew.description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-5">
        {RELEASES.map((version) => {
          const id = releaseId(version);
          const items = tr(`whatsNew.releases.${id}.items`, { returnObjects: true });
          const list = Array.isArray(items) ? (items as string[]) : [];

          return (
            <section key={version}>
              <h3 className="text-sm font-semibold">
                {t("whatsNew.version", { version })}
                {" — "}
                {tr(`whatsNew.releases.${id}.title`) as string}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {list.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <DialogFooter className="mt-6">
        <Button onClick={onClose}>{t("common:actions.close")}</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Signaler un problème
// ----------------------------------------------------------------------------

/** Copie un texte : presse-papiers natif dans l'application, sinon celui du navigateur. */
async function copyText(text: string): Promise<boolean> {
  if (isTauri()) {
    try {
      await writeNativeClipboard(text);
      return true;
    } catch {
      /* essai suivant */
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation(["help", "common"]);
  const signedIn = useAuthStore((state) => state.user !== null);
  const lastSaveError = useSaveStatusStore((state) => state.lastError);
  const [version, setVersion] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(null);
    api
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, [open]);

  const report = buildReport({
    version,
    language: i18n.language,
    signedIn,
    lastSaveError,
    description,
    labels: {
      title: t("report.reportTitle"),
      description: t("report.fields.description"),
      version: t("report.fields.version"),
      system: t("report.fields.system"),
      language: t("report.fields.language"),
      session: t("report.fields.session"),
      signedIn: t("report.fields.signedIn"),
      guest: t("report.fields.guest"),
      display: t("report.fields.display"),
      lastSaveError: t("report.fields.lastSaveError"),
      recentErrors: t("report.fields.recentErrors"),
      none: t("report.fields.none"),
      unknown: t("report.fields.unknown"),
      notGiven: t("report.fields.notGiven"),
      colon: t("report.fields.colon"),
    },
  });

  async function copy() {
    setCopied((await copyText(report)) ? "done" : "failed");
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bug className="size-5 text-primary" aria-hidden="true" />
          {t("report.title")}
        </DialogTitle>
        <DialogDescription>{t("report.description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="report-description" className="block text-sm font-medium">
            {t("report.whatLabel")}
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setCopied(null);
            }}
            placeholder={t("report.whatPlaceholder")}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="report-preview" className="block text-sm font-medium">
            {t("report.previewLabel")}
          </label>
          <textarea
            id="report-preview"
            readOnly
            value={report}
            rows={10}
            aria-describedby="report-privacy"
            className="w-full resize-y rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
          />
          <p id="report-privacy" className="text-xs text-muted-foreground">
            {t("report.privacy")}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{t("report.howToSend")}</p>

        {copied && (
          <p role="status" className={cn("text-sm", copied === "done" ? "text-success" : "text-destructive")}>
            {copied === "done" ? t("report.copied") : t("report.copyFailed")}
          </p>
        )}
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common:actions.close")}
        </Button>
        <Button onClick={() => void copy()}>
          <Copy className="mr-1.5 size-4" aria-hidden="true" />
          {t("report.copy")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Fenêtres du menu Aide (guide, raccourcis, à propos, nouveautés, signalement). */
export function HelpDialogs() {
  const open = useHelpStore((state) => state.open);
  const close = useHelpStore((state) => state.close);
  const show = useHelpStore((state) => state.show);

  // Après une mise à jour : les nouveautés s'ouvrent seules, une fois.
  useEffect(() => {
    api
      .appInfo()
      .then((info) => {
        if (shouldShowWhatsNew(info.version) && useHelpStore.getState().open === null) show("whatsNew");
      })
      .catch(() => {});
  }, [show]);

  return (
    <>
      <GuideDialog open={open === "guide"} onClose={close} />
      <ShortcutsDialog open={open === "shortcuts"} onClose={close} />
      <AboutDialog open={open === "about"} onClose={close} />
      <HelpCenterDialog open={open === "center"} onClose={close} />
      <WhatsNewDialog open={open === "whatsNew"} onClose={close} />
      <ReportDialog open={open === "report"} onClose={close} />
    </>
  );
}
