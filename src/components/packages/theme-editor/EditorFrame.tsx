import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Lock } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { Button } from "@/components/ui/button";
import { useGuardedNavigate } from "@/components/layout/UnsavedChangesGuard";

/** Cadre de page de l'éditeur de thème, et message à la place du formulaire. */
export function EditorFrame({
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

export function Notice({
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
