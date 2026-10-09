import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import {
  Archive,
  CalendarDays,
  FileText,
  FolderOpen,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SynopsisContent } from "@/components/workspace/SynopsisContent";
import {
  useProjectSynopsis,
  useSynopsisStore,
} from "@/stores/synopsisStore";
import type { Project } from "@/types";

/** Format des dates de date-fns pour chaque langue de l'interface. */
const DATE_LOCALES = { fr, en: enUS } as const;

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

/**
 * Affiche une liste de tags en lecture seule.
 *
 * Le composant ne s'affiche pas lorsqu'aucune valeur n'est disponible.
 */
function ReadonlyTagList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <div className="flex flex-wrap gap-2">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Bloc de lecture du synopsis.
 *
 * Toute modification du synopsis se fait dans SynopsisEditView.
 * Cette vue est uniquement destinée à présenter les informations
 * narratives principales du projet sur l'accueil.
 *
 * La carte a une couleur de fond unique (`bg-card`), en-tête compris,
 * et le même contour que les autres blocs de la page.
 */
function SynopsisReadonly({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["workspaceHome", "modules"]);
  // Seul le synopsis de CE projet est affiché, jamais celui d'un autre.
  const { synopsis, loading, error } = useProjectSynopsis(projectId);
  const fetchSynopsis = useSynopsisStore((s) => s.fetchSynopsis);

  useEffect(() => {
    if (projectId) {
      void fetchSynopsis(projectId);
    }
  }, [projectId, fetchSynopsis]);

  const hasAnyContent =
    synopsis &&
    (synopsis.content.trim() !== "" ||
      synopsis.genres.length > 0 ||
      synopsis.subgenres.length > 0 ||
      synopsis.tone.length > 0);

  return (
    <section className="mb-8">
      {/* gap-0 / py-0 : pas de bande vide au-dessus de l'en-tête.
          ring-0 + border : même contour que les autres blocs. */}
      <Card className="gap-0 border py-0 shadow-sm ring-0">
        <CardHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>

            <div>
              <CardTitle className="text-base">{t("synopsis.title")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("synopsis.subtitle")}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-7 px-6 py-6">
          {loading && !synopsis && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("synopsis.loading")}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {!loading && !error && !hasAnyContent && (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />

              <p className="text-sm font-medium">
                {t("synopsis.emptyTitle")}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {/* Reprend les noms affichés dans la barre de gauche. */}
                {t("synopsis.emptyHint", {
                  module: t("modules:modules.details.label"),
                  feature: t("modules:features.synopsis.edit.label"),
                })}
              </p>
            </div>
          )}

          {hasAnyContent && (
            <>
              {/* Contenu principal du synopsis */}
              {synopsis.content.trim() !== "" && (
                <SynopsisContent html={synopsis.content} />
              )}

              {/* Métadonnées narratives */}
              {(synopsis.genres.length > 0 ||
                synopsis.subgenres.length > 0 ||
                synopsis.tone.length > 0) && (
                <div className="border-t pt-6">
                  <div className="grid gap-6 sm:grid-cols-3">
                    <ReadonlyTagList
                      label={t("synopsis.genres")}
                      values={synopsis.genres}
                    />

                    <ReadonlyTagList
                      label={t("synopsis.subgenres")}
                      values={synopsis.subgenres}
                    />

                    <ReadonlyTagList
                      label={t("synopsis.tone")}
                      values={synopsis.tone}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vue principale
// ---------------------------------------------------------------------------

/**
 * Onglet « Accueil du projet ».
 *
 * Hiérarchie d'affichage :
 *
 * 1. Identité du projet
 * 2. Description
 * 3. Synopsis et informations narratives
 * 4. Informations techniques du projet
 * 5. Aide / navigation
 */
export function WorkspaceHome({ project }: { project: Project }) {
  const { t, i18n } = useTranslation(["workspaceHome", "projects"]);

  const dateLocale =
    i18n.resolvedLanguage === "en" ? DATE_LOCALES.en : DATE_LOCALES.fr;

  const formatDate = (iso: string) =>
    format(new Date(iso), "d MMMM yyyy", { locale: dateLocale });

  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
        {/* ================================================================
            1. IDENTITÉ DU PROJET
            ================================================================ */}

        <header className="mb-8">

          <div className="flex flex-col gap-4">
            <div>
              <h1 className="break-words text-3xl font-semibold tracking-tight">
                {project.name}
              </h1>

              {/* Type + statut */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                  {t(`projects:types.${project.type}`)}
                </span>

                <span className="rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                  {t(`projects:statuses.${project.status}`)}
                </span>

                {project.isArchived && (
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                    <Archive className="h-3 w-3" />
                    {t("projects:card.archived")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ================================================================
            2. DESCRIPTION DU PROJET
            ================================================================ */}

        {project.description && (
          <section className="mb-8">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">
                {t("description")}
              </h2>

              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                {project.description}
              </p>
            </div>
          </section>
        )}

        {/* ================================================================
            3. SYNOPSIS
            ================================================================ */}

        <SynopsisReadonly projectId={project.id} />

        {/* ================================================================
            4. INFORMATIONS DU PROJET
            ================================================================ */}

        <section className="mb-8">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-semibold">
                {t("info.title")}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2">
              {/* Date de création */}
              <div className="flex items-start gap-3 border-b p-5 sm:border-r sm:border-b-0">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t("info.createdAt")}
                  </p>

                  <p className="mt-1 break-words text-sm font-medium">
                    {formatDate(project.createdAt)}
                  </p>
                </div>
              </div>

              {/* Dernière modification */}
              <div className="flex items-start gap-3 p-5">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t("info.updatedAt")}
                  </p>

                  <p className="mt-1 break-words text-sm font-medium">
                    {formatDate(project.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            5. AIDE / NAVIGATION
            ================================================================ */}

        <section className="rounded-xl border bg-muted/30 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </div>

            <div>
              <h2 className="text-sm font-semibold">
                {t("help.title")}
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("help.text")}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}