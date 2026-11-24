import i18n from "@/i18n";
import { askConfirm } from "@/stores/confirmStore";
import type { Project } from "@/types";

/**
 * Avant d'exporter un projet **privé** en `.ganix` : le fichier n'est pas
 * chiffré, il sort donc de la protection du compte. L'utilisateur le
 * confirme (avec « Ne plus demander »). Un projet public n'est déjà pas
 * protégé : aucune question.
 */
export function confirmGanixExport(project: Pick<Project, "name" | "visibility">): Promise<boolean> {
  if (project.visibility === "public") return Promise.resolve(true);

  const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;

  return askConfirm({
    title: t("projects:ganix.export.warning.title"),
    description: t("projects:ganix.export.warning.description", { name: project.name }),
    confirmLabel: t("projects:ganix.export.warning.confirm"),
    tone: "danger",
    dontAskAgainKey: "ganix-export-not-encrypted",
  });
}
