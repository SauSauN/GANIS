import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderKanban,
  Globe,
  Keyboard,
  LayoutPanelLeft,
  ListTree,
  MapPin,
  Network,
  Palette,
  PenLine,
  Save,
  Search,
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
import { api } from "@/lib/api";
import { formatCombo, REFERENCE, SHORTCUTS, useHelpStore, type AppAction } from "@/lib/shortcuts";
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
  const shift = t("shortcuts.shift");

  const commands: Array<{ action: AppAction; keys: string[] }> = SHORTCUTS.map((shortcut) => ({
    action: shortcut.action,
    // « Ctrl+: » (claviers AZERTY) fait la même chose que « Ctrl+/ » : pas répété.
    keys: shortcut.combos.filter((combo) => combo.key !== ":").map((combo) => formatCombo(combo, shift)),
  }));

  const groups: Array<{ id: "general" | "tabs" | "editor"; rows: Array<{ label: string; keys: string[] }> }> = [
    {
      id: "general",
      rows: [
        ...commands
          .filter((c) => !["closeTab", "nextTab", "previousTab"].includes(c.action))
          .map((c) => ({ label: tt(`shortcuts.actions.${c.action}`), keys: c.keys })),
        ...REFERENCE.filter((r) => r.group === "general").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: r.keys })),
      ],
    },
    {
      id: "tabs",
      rows: [
        ...commands
          .filter((c) => ["closeTab", "nextTab", "previousTab"].includes(c.action))
          .map((c) => ({ label: tt(`shortcuts.actions.${c.action}`), keys: c.keys })),
        ...REFERENCE.filter((r) => r.group === "tabs").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: r.keys })),
      ],
    },
    {
      id: "editor",
      rows: REFERENCE.filter((r) => r.group === "editor").map((r) => ({ label: tt(`shortcuts.reference.${r.id}`), keys: r.keys })),
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
  const { t } = useTranslation(["help", "common"]);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion(null));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()} className="max-w-md" guardInput={false}>
      <div className="flex flex-col items-center gap-3 text-center">
        <img src={ganisLogo} alt="" aria-hidden="true" className="size-16 object-contain" />
        <DialogTitle>GANIS</DialogTitle>
        <DialogDescription>{t("about.tagline")}</DialogDescription>
        {version && <p className="text-sm">{t("about.version", { version })}</p>}
        <p className="text-xs leading-5 text-muted-foreground">{t("about.offline")}</p>
      </div>
      <DialogFooter className="mt-6">
        <Button onClick={onClose}>{t("common:actions.close")}</Button>
      </DialogFooter>
    </Dialog>
  );
}


// ----------------------------------------------------------------------------
// Aide intégrée (une rubrique par module + questions fréquentes)
// ----------------------------------------------------------------------------

const CENTER_SECTIONS = ["workspace", "details", "characters", "locations", "structure", "plot", "notes", "search", "history", "files", "settings", "faq"] as const;
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

/** Fenêtres du menu Aide (guide, raccourcis, à propos). */
export function HelpDialogs() {
  const open = useHelpStore((state) => state.open);
  const close = useHelpStore((state) => state.close);

  return (
    <>
      <GuideDialog open={open === "guide"} onClose={close} />
      <ShortcutsDialog open={open === "shortcuts"} onClose={close} />
      <AboutDialog open={open === "about"} onClose={close} />
      <HelpCenterDialog open={open === "center"} onClose={close} />
    </>
  );
}