import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Code2,
  Image as ImageIcon,
  LayoutTemplate,
  LogOut,
  Library,
  ListTree,
  Palette,
  Plus,
  Puzzle,
  Share2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useInstalledThemes } from "@/components/packages/useInstalledThemes";
import { cardClass, cardFooterClass, cardHeaderClass } from "@/components/settings/styles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { canDevelop } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";

/** Types de packages à venir (§20.2), affichés comme « Bientôt ». */
const UPCOMING: { id: "iconPack" | "list" | "template" | "plugin"; icon: LucideIcon }[] = [
  { id: "iconPack", icon: ImageIcon },
  { id: "list", icon: ListTree },
  { id: "template", icon: LayoutTemplate },
  { id: "plugin", icon: Puzzle },
];

/**
 * Section « Développeur » des paramètres généraux (§8.3, §10.4).
 *
 * - Utilisateur : présentation du mode développeur et bouton
 *   « Devenir développeur » (le rôle est changé par Rust).
 * - Développeur ou administrateur : accès à la création de plugins.
 *   Pour l'instant, seul le plugin de thème est disponible.
 */
export function DeveloperSection() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return null;
  }

  return canDevelop(user) ? <DeveloperTools /> : <BecomeDeveloper />;
}

// ----------------------------------------------------------------------------
// Devenir développeur
// ----------------------------------------------------------------------------

function BecomeDeveloper() {
  const { t } = useTranslation("settings");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perks: { id: "create" | "direct" | "share"; icon: LucideIcon }[] = [
    { id: "create", icon: Palette },
    { id: "direct", icon: Zap },
    { id: "share", icon: Share2 },
  ];

  async function activate() {
    setBusy(true);
    setError(null);

    try {
      const updated = await api.becomeDeveloper();
      setConfirming(false);
      // Le rôle change : la section affiche aussitôt les outils.
      setUser(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("developer.become.failed"));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" />
          {t("developer.become.title")}
        </CardTitle>
        <CardDescription>{t("developer.become.description")}</CardDescription>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <ul className="space-y-4">
          {perks.map(({ id, icon: Icon }) => (
            <li key={id} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <p className="pt-1.5 text-sm leading-5">{t(`developer.become.perks.${id}`)}</p>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-muted-foreground">{t("developer.become.note")}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className={cardFooterClass}>
        <Button onClick={() => setConfirming(true)}>
          <Code2 />
          {t("developer.become.action")}
        </Button>
      </CardFooter>

      <Dialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <DialogHeader>
          <DialogTitle>{t("developer.become.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("developer.become.confirmText", { username: user?.username ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
            {t("developer.become.cancel")}
          </Button>
          <Button onClick={() => void activate()} disabled={busy}>
            {busy ? t("developer.become.activating") : t("developer.become.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Outils du développeur
// ----------------------------------------------------------------------------

function DeveloperTools() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { mine, loaded } = useInstalledThemes();

  return (
    <div className="space-y-8">
      {/* Statut */}
      <section className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-5">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <h2 className="text-sm font-semibold">{t("developer.active.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.role === "admin"
              ? t("developer.active.roleAdmin")
              : t("developer.active.description")}
          </p>
        </div>
      </section>

      {/* Créer un plugin */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("developer.tools.title")}</CardTitle>
          <CardDescription>{t("developer.tools.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-6 py-6">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Palette className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("developer.tools.theme.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("developer.tools.theme.description")}
              </p>
            </div>
            <Button onClick={() => navigate("/packages/themes/new")}>
              <Plus />
              {t("developer.tools.theme.action")}
            </Button>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {UPCOMING.map(({ id, icon: Icon }) => (
              <li
                key={id}
                aria-disabled="true"
                className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-muted-foreground"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-sm">{t(`developer.tools.others.${id}`)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem]">
                  {t("developer.tools.soon")}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Mes créations */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("developer.mine.title")}</CardTitle>
          <CardDescription>
            {loaded && mine.length === 0
              ? t("developer.mine.none")
              : t("developer.mine.description", { count: mine.length })}
          </CardDescription>
        </CardHeader>

        <CardFooter className={cardFooterClass}>
          <Button variant="outline" onClick={() => navigate("/packages?view=installed")}>
            <Library />
            {t("developer.mine.open")}
          </Button>
        </CardFooter>
      </Card>

      {/* Un administrateur garde toujours les outils : rien à quitter. */}
      {user?.role === "developer" && <LeaveDeveloper />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Quitter le mode développeur
// ----------------------------------------------------------------------------

function LeaveDeveloper() {
  const { t } = useTranslation("settings");
  const setUser = useAuthStore((s) => s.setUser);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);

    try {
      const updated = await api.leaveDeveloperMode();
      setConfirming(false);
      // Rôle « user » : la section repasse à « Devenir développeur », les
      // créations sont masquées et un thème créé n'est plus appliqué.
      setUser(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("developer.leave.failed"));
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("developer.leave.title")}</CardTitle>
        <CardDescription>{t("developer.leave.description")}</CardDescription>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <p className="text-sm leading-6 text-muted-foreground">{t("developer.leave.details")}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className={cardFooterClass}>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          <LogOut />
          {t("developer.leave.action")}
        </Button>
      </CardFooter>

      <Dialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <DialogHeader>
          <DialogTitle>{t("developer.leave.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("developer.leave.confirmText")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
            {t("developer.leave.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void leave()} disabled={busy}>
            {busy ? t("developer.leave.leaving") : t("developer.leave.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
