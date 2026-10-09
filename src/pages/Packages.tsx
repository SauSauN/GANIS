import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Compass,
  FileUp,
  Library,
  Plus,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { ThemeCard } from "@/components/packages/ThemeCard";
import {
  useInstalledThemes,
  type InstalledTheme,
} from "@/components/packages/useInstalledThemes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  BUILTIN_THEMES,
  setActiveColorTheme,
  useActiveColorThemeId,
} from "@/lib/colorTheme";
import { clampPanelWidth, usePanelWidth } from "@/lib/preferences";
import { canDevelop } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { usePackageStore } from "@/stores/packageStore";

type ViewId = "installed" | "discover" | "import";

/** Vues du gestionnaire (§20.3), dans l'ordre du menu. */
const VIEWS: { id: ViewId; icon: LucideIcon; soon?: boolean }[] = [
  { id: "installed", icon: Library },
  { id: "discover", icon: Compass, soon: true },
  { id: "import", icon: FileUp, soon: true },
];

const navItemClass = (selected: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
    selected && "bg-sidebar-accent font-medium",
  );

function isViewId(value: string | null): value is ViewId {
  return VIEWS.some((view) => view.id === value);
}

type Notice = { kind: "success" | "error"; text: string };

/**
 * Gestionnaire de packages.
 *
 * Même direction artistique que les paramètres généraux : panneau des vues
 * à gauche, contenu au centre. Pour l'instant, seuls les thèmes existent :
 * - « Installés » : thèmes système et créations de l'utilisateur, utilisables
 *   directement, sans téléchargement ;
 * - « Découvrir » et « Importer » : le partage et l'import .ganixpkg
 *   arrivent plus tard (vues d'attente).
 *
 * La vue est pilotée par l'adresse (`?view=installed`).
 */
export default function Packages() {
  const navigate = useNavigate();
  const { t } = useTranslation("packages");
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const developer = canDevelop(user);
  const panelWidth = clampPanelWidth(usePanelWidth());

  const requested = params.get("view");
  const view: ViewId = isViewId(requested) ? requested : "installed";

  const { mine } = useInstalledThemes();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* =========================================================
            PANNEAU DE GAUCHE (vues)
            ========================================================= */}
        <aside
          aria-label={t("nav.label")}
          style={{ width: panelWidth }}
          className="flex shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        >
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("nav.title")}</p>
            <p className="truncate text-sm font-semibold">{t("title")}</p>
          </div>

          <ul className="px-2">
            {VIEWS.map(({ id, icon: Icon, soon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={view === id ? "page" : undefined}
                  onClick={() => setParams({ view: id }, { replace: true })}
                  className={navItemClass(view === id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-left">
                    {t(`views.${id}.label`)}
                  </span>
                  {soon ? (
                    <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">
                      {t("nav.soon")}
                    </span>
                  ) : (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {/* Thèmes système + créations */}
                      {BUILTIN_THEMES.length + mine.length}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Espace développeur, en bas du panneau (développeurs uniquement) */}
          {developer && (
            <div className="mt-auto border-t border-sidebar-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Wrench className="h-3.5 w-3.5 text-primary" />
                {t("developer.title")}
              </p>

              <Button
                size="sm"
                className="mt-2 w-full"
                onClick={() => navigate("/packages/themes/new")}
              >
                <Plus />
                {t("actions.create")}
              </Button>
            </div>
          )}
        </aside>

        {/* =========================================================
            ZONE CENTRALE
            ========================================================= */}
        <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {t(`views.${view}.label`)}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t(`views.${view}.description`)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {developer && view === "installed" && (
                  <Button onClick={() => navigate("/packages/themes/new")}>
                    <Plus />
                    {t("actions.create")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => navigate(-1)}>
                  <ArrowLeft />
                  {t("back")}
                </Button>
              </div>
            </header>

            {view === "installed" && <InstalledView />}
            {view === "discover" && (
              <ComingSoon
                icon={Compass}
                title={t("discover.title")}
                text={t("discover.text")}
                action={
                  <Button
                    variant="outline"
                    onClick={() => setParams({ view: "installed" }, { replace: true })}
                  >
                    {t("discover.toInstalled")}
                  </Button>
                }
              />
            )}
            {view === "import" && <ImportView />}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Vue « Installés »
// ----------------------------------------------------------------------------

function InstalledView() {
  const { t } = useTranslation("packages");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const developer = canDevelop(user);
  const activeId = useActiveColorThemeId();
  const deletePackage = usePackageStore((s) => s.deletePackage);
  const { system, mine, loaded, loading, loadError, reload } = useInstalledThemes();

  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toDelete, setToDelete] = useState<InstalledTheme | null>(null);
  const [deleting, setDeleting] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();

    return (theme: InstalledTheme) =>
      !q ||
      theme.name.toLocaleLowerCase().includes(q) ||
      theme.description.toLocaleLowerCase().includes(q);
  }, [query]);

  const systemShown = system.filter(matches);
  const mineShown = mine.filter(matches);
  const nothingFound = query.trim() !== "" && systemShown.length + mineShown.length === 0;

  function use(theme: InstalledTheme) {
    setActiveColorTheme(theme.id, theme.theme);
    setNotice({ kind: "success", text: t("actions.used", { name: theme.name }) });
  }

  async function confirmDelete() {
    if (!toDelete) return;

    setDeleting(true);

    try {
      await deletePackage(toDelete.id);
      setNotice({ kind: "success", text: t("actions.deleted", { name: toDelete.name }) });
      setToDelete(null);
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : t("delete.failed"),
      });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const card = (theme: InstalledTheme) => (
    <ThemeCard
      key={theme.id}
      name={theme.name}
      description={theme.description}
      theme={theme.theme}
      origin={theme.origin}
      author={theme.author}
      version={theme.version}
      active={activeId === theme.id}
      onUse={() => use(theme)}
      onEdit={
        theme.origin === "mine" ? () => navigate(`/packages/themes/${theme.id}`) : undefined
      }
      onDelete={theme.origin === "mine" ? () => setToDelete(theme) : undefined}
    />
  );

  return (
    <div className="space-y-10">
      {/* Recherche */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.label")}
          className="pl-8"
        />
      </div>

      <div aria-live="polite">
        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              notice.kind === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-success/40 bg-success/10",
            )}
          >
            {notice.text}
          </p>
        )}
      </div>

      {nothingFound && (
        <p className="text-sm text-muted-foreground">
          {t("search.empty", { query: query.trim() })}
        </p>
      )}

      {/* Thèmes système */}
      {systemShown.length > 0 && (
        <section aria-labelledby="packages-system">
          <GroupHeader
            id="packages-system"
            title={t("groups.system.title")}
            description={t("groups.system.description")}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {systemShown.map(card)}
          </div>
        </section>
      )}

      {/* Mes créations */}
      {developer && (query.trim() === "" || mineShown.length > 0) && (
        <section aria-labelledby="packages-mine">
          <GroupHeader
            id="packages-mine"
            title={t("groups.mine.title")}
            description={t("groups.mine.description")}
          />

          {loadError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <p role="alert" className="flex-1 text-sm text-destructive">
                {loadError instanceof Error ? loadError.message : t("mine.loadFailed")}
              </p>
              <Button size="sm" variant="outline" onClick={() => void reload()}>
                {t("mine.retry")}
              </Button>
            </div>
          ) : mineShown.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mineShown.map(card)}
            </div>
          ) : (
            (loaded || !loading) && (
              <div className="flex flex-col items-center rounded-xl border border-dashed p-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </span>
                <p className="mt-3 text-sm font-medium">{t("mine.emptyTitle")}</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {t("mine.emptyDeveloper")}
                </p>
                <Button className="mt-4" onClick={() => navigate("/packages/themes/new")}>
                  <Plus />
                  {t("mine.create")}
                </Button>
              </div>
            )
          )}
        </section>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogHeader>
          <DialogTitle>{t("delete.title")}</DialogTitle>
          <DialogDescription>
            {t("delete.description", { name: toDelete?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
            {t("delete.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
            {t("delete.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function GroupHeader({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Vues d'attente (partage et import : plus tard)
// ----------------------------------------------------------------------------

function ComingSoon({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
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

function ImportView() {
  const { t } = useTranslation("packages");

  return (
    <div className="space-y-6">
      <ComingSoon icon={FileUp} title={t("import.title")} text={t("import.text")} />

      <div
        aria-disabled="true"
        className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground opacity-60"
      >
        <FileUp className="h-6 w-6" />
        <p className="text-sm font-medium">{t("import.drop")}</p>
        <p className="text-xs">{t("import.unavailable")}</p>
      </div>
    </div>
  );
}
