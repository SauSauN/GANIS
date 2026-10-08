import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_LABELS, type AppInfo, type Diagnostics } from "@/types";

/** Formate une taille en octets de façon lisible. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p>
      <strong>{label} :</strong> {value}
    </p>
  );
}

/**
 * Outils de diagnostic, réservés aux rôles administrateur et développeur.
 * Le contrôle d'accès est effectué côté Rust (`get_diagnostics`).
 */
export default function DiagnosticsPage() {
  const user = useAuthStore((state) => state.user);

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [report, setReport] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [info, diagnostics] = await Promise.all([
        api.appInfo(),
        api.getDiagnostics(),
      ]);

      setAppInfo(info);
      setReport(diagnostics);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de récupérer les informations de diagnostic.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const integrityOk = report?.database.integrity === "ok";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground">
              Informations techniques de GANIS.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Application</CardTitle>
            <CardDescription>
              Informations fournies directement par le noyau Rust.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            {appInfo && report ? (
              <>
                <Row label="Nom" value={appInfo.name} />
                <Row label="Version" value={report.appVersion} />
                <Row
                  label="Système"
                  value={`${report.os} (${report.arch})`}
                />
                <Row
                  label="Fonctionnement hors ligne"
                  value={appInfo.offline ? "Oui" : "Non"}
                />
                <Row
                  label="Rapport généré le"
                  value={new Date(report.generatedAt).toLocaleString(
                    "fr-FR",
                  )}
                />
              </>
            ) : (
              !error && (
                <p className="text-muted-foreground">
                  Chargement des informations…
                </p>
              )
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Base de données</CardTitle>
            <CardDescription>
              État de la base SQLite locale de l'application.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            {report ? (
              <>
                <Row
                  label="Version de SQLite"
                  value={report.database.sqliteVersion}
                />
                <Row
                  label="Taille"
                  value={formatBytes(report.database.sizeBytes)}
                />
                <Row
                  label="Migrations appliquées"
                  value={report.database.appliedMigrations}
                />
                <Row
                  label="Intégrité"
                  value={
                    <span
                      className={
                        integrityOk ? "text-success" : "text-destructive"
                      }
                    >
                      {integrityOk
                        ? "Correcte"
                        : report.database.integrity}
                    </span>
                  }
                />
                <Row
                  label="Clés étrangères invalides"
                  value={
                    <span
                      className={
                        report.database.foreignKeyViolations === 0
                          ? "text-success"
                          : "text-destructive"
                      }
                    >
                      {report.database.foreignKeyViolations}
                    </span>
                  }
                />
              </>
            ) : (
              !error && (
                <p className="text-muted-foreground">Chargement…</p>
              )
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Contenu local</CardTitle>
            <CardDescription>
              Compteurs généraux, sans aucun contenu de compte ni de
              projet.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            {report ? (
              <>
                <Row label="Comptes" value={report.counts.users} />
                <Row
                  label="Administrateurs"
                  value={report.counts.admins}
                />
                <Row
                  label="Développeurs"
                  value={report.counts.developers}
                />
                <Row
                  label="Sessions actives"
                  value={report.counts.activeSessions}
                />
                <Row label="Projets" value={report.counts.projects} />
              </>
            ) : (
              !error && (
                <p className="text-muted-foreground">Chargement…</p>
              )
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Session actuelle</CardTitle>
            <CardDescription>
              Informations non sensibles sur le compte connecté.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2 text-sm">
            {user ? (
              <>
                <Row
                  label="Identifiant"
                  value={
                    <span className="font-mono text-xs">{user.id}</span>
                  }
                />
                <Row label="Nom d'utilisateur" value={user.username} />
                <Row
                  label="Rôle"
                  value={ROLE_LABELS[user.role] ?? user.role}
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Aucun utilisateur connecté.
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <StatusBar />
    </div>
  );
}