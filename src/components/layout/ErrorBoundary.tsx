import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveEntries, useUnsavedStore } from "@/lib/unsavedChanges";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * `app` : toute l'application (écran plein) ; `tab` : un onglet de
   * l'espace de travail (le reste de l'application continue de marcher).
   */
  scope: "app" | "tab";
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Écran de secours quand l'interface plante.
 *
 * Sans lui, une exception pendant l'affichage d'un composant vide toute la
 * fenêtre. Ici, un message clair remplace la partie qui a planté, avec :
 * - « Réessayer » : réaffiche la partie (souvent suffisant) ;
 * - « Recharger GANIS » : enregistre d'abord les modifications en attente,
 *   puis recharge l'interface (les données enregistrées ne bougent pas) ;
 * - le détail technique, replié, pour signaler le problème.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Gardé dans la console (et donc le journal de développement) seulement.
    console.error("Erreur de l'interface :", error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return <CrashScreen error={this.state.error} scope={this.props.scope} onRetry={this.retry} />;
  }
}

/** Enregistre ce qui peut l'être, puis recharge l'interface. */
async function saveAndReload() {
  try {
    await saveEntries(Object.keys(useUnsavedStore.getState().entries));
  } catch {
    /* rechargement quand même : l'écran est inutilisable */
  }

  window.location.reload();
}

function CrashScreen({
  error,
  scope,
  onRetry,
}: {
  error: Error;
  scope: "app" | "tab";
  onRetry: () => void;
}) {
  const { t } = useTranslation("common");
  const [details, setDetails] = useState(false);
  const [reloading, setReloading] = useState(false);

  return (
    <main
      className={
        scope === "app"
          ? "flex flex-1 items-center justify-center bg-background p-6"
          : "flex min-h-0 flex-1 items-center justify-center p-6"
      }
    >
      <div role="alert" className="w-full max-w-lg space-y-4 rounded-xl border border-destructive/30 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t(`crash.title.${scope}`)}</h2>
            <p className="text-sm text-muted-foreground">{t("crash.description")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry} disabled={reloading}>
            <RotateCcw className="mr-1.5 size-4" />
            {t("crash.retry")}
          </Button>
          <Button
            variant="outline"
            disabled={reloading}
            onClick={() => {
              setReloading(true);
              void saveAndReload();
            }}
          >
            <RefreshCw className="mr-1.5 size-4" />
            {reloading ? t("crash.reloading") : t("crash.reload")}
          </Button>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails((open) => !open)}
            className="flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {details ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {t("crash.details")}
          </button>
          {details && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words select-text">
              {error.name}: {error.message}
            </pre>
          )}
        </div>
      </div>
    </main>
  );
}
