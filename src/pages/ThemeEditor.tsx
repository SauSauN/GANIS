import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Lock } from "lucide-react";
import { useInstalledThemes } from "@/components/packages/useInstalledThemes";
import { Button } from "@/components/ui/button";
import { DEFAULT_THEME_ID, cloneTheme, findBuiltinTheme } from "@/lib/colorTheme";
import { canDevelop } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";
import { EditorFrame, Notice } from "@/components/packages/theme-editor/EditorFrame";
import { ThemeForm } from "@/components/packages/theme-editor/ThemeForm";

/**
 * Éditeur de thème (mode développeur).
 *
 * - `/packages/themes/new` : nouveau thème, à partir du thème par défaut ;
 * - `/packages/themes/:packageId` : modification d'un thème de l'utilisateur.
 *
 * L'aperçu est local au formulaire : rien ne change dans l'interface tant
 * que le thème n'est pas enregistré puis utilisé.
 */
export default function ThemeEditor() {
  const { packageId } = useParams();

  // `?from=<thème>` : nouveau thème copié d'un thème installé (« Personnaliser »).
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("packages");
  const user = useAuthStore((s) => s.user);
  const { system, mine, loaded, loadError } = useInstalledThemes();
  const editing = packageId !== undefined;
  const existing = editing ? mine.find((m) => m.id === packageId) : undefined;
  if (!canDevelop(user)) {
    return (
      <EditorFrame title={t("editor.forbiddenTitle")}>
        <Notice
          icon={Lock}
          title={t("editor.forbiddenTitle")}
          text={t("editor.forbiddenText")}
          action={
            <Button onClick={() => navigate("/settings?section=developer")}>
              {t("editor.toDeveloper")}
            </Button>
          }
        />
      </EditorFrame>
    );
  }

  if (editing && !existing) {
    // Liste pas encore chargée : on attend sans afficher d'erreur.
    if (!loaded && !loadError) {
      return <EditorFrame title={t("editor.editTitle")} />;
    }

    return (
      <EditorFrame title={t("editor.editTitle")}>
        <Notice
          icon={AlertTriangle}
          title={t("editor.editTitle")}
          text={t("editor.notFound")}
          action={
            <Button variant="outline" onClick={() => navigate("/packages")}>
              {t("editor.back")}
            </Button>
          }
        />
      </EditorFrame>
    );
  }

  const starters = [...system, ...mine.filter((m) => m.id !== packageId)];
  const from = editing ? undefined : starters.find((s) => s.id === searchParams.get("from"));

  return (
    <ThemeForm
      // Nouveau formulaire si l'on passe d'un thème à un autre.
      key={packageId ?? `new:${from?.id ?? ""}`}
      initial={
        existing
          ? {
              id: existing.id,
              name: existing.name,
              description: existing.description,
              theme: cloneTheme(existing.theme),
              packageId: existing.packageId,
              version: existing.version,
            }
          : {
              name: "",
              description: "",
              theme: cloneTheme(from?.theme ?? findBuiltinTheme(DEFAULT_THEME_ID)!.theme),
            }
      }
      starters={starters.map((s) => ({ id: s.id, name: s.name, theme: s.theme }))}
    />
  );
}
