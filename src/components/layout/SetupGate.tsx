import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetupStore } from "@/stores/setupStore";

const SETUP_PATH = "/setup";

/**
 * Impose l'assistant de configuration initiale tant qu'aucun compte
 * n'existe, et le rend inaccessible ensuite.
 *
 * - aucun compte → toute page redirige vers /setup ;
 * - configuration faite → /setup redirige vers l'accueil.
 */
export function SetupGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const needsSetup = useSetupStore((state) => state.needsSetup);
  const error = useSetupStore((state) => state.error);
  const check = useSetupStore((state) => state.check);

  const location = useLocation();

  useEffect(() => {
    void check();
  }, [check]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p role="alert" className="max-w-md text-sm text-destructive">
          {error}
        </p>

        <Button variant="outline" onClick={() => void check()}>
          {t("actions.retry")}
        </Button>
      </main>
    );
  }

  if (needsSetup === null) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("startup")}
        </p>
      </main>
    );
  }

  const onSetupPage = location.pathname === SETUP_PATH;

  if (needsSetup && !onSetupPage) {
    return <Navigate to={SETUP_PATH} replace />;
  }

  if (!needsSetup && onSetupPage) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}