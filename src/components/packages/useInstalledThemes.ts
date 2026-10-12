import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BUILTIN_THEMES } from "@/lib/colorTheme";
import { canDevelop } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";
import { usePackageStore } from "@/stores/packageStore";
import type { ThemeData, UserPackage } from "@/types";

/** Thème utilisable directement : système ou créé par l'utilisateur. */
export interface InstalledTheme {
  id: string;
  name: string;
  description: string;
  theme: ThemeData;
  origin: "system" | "mine";
  author: string;
  version: string;
  /** Identifiant public (`auteur.nom`). */
  packageId: string;
  /** Package d'origine, pour un thème créé par l'utilisateur. */
  userPackage?: UserPackage;
}

/** Version des thèmes système : celle de GANIS. */
const SYSTEM_VERSION = "1.0.0";

/**
 * Thèmes système, puis — en mode développeur uniquement — les thèmes créés
 * par l'utilisateur connecté (chargés au besoin).
 * Les noms des thèmes système suivent la langue de l'interface.
 */
export function useInstalledThemes() {
  const { t } = useTranslation("packages");
  const user = useAuthStore((s) => s.user);
  const developer = canDevelop(user);
  const { packages, loaded, loading, loadError, load } = usePackageStore();

  // Créations chargées uniquement en mode développeur.
  useEffect(() => {
    if (developer && !loaded && !loading && !loadError) {
      void load();
    }
  }, [developer, loaded, loading, loadError, load]);

  const system = useMemo<InstalledTheme[]>(
    () =>
      BUILTIN_THEMES.map(({ id, theme }) => ({
        id,
        packageId: id,
        // Clés dynamiques : présentes dans `packages.json` pour chaque thème.
        name: t(`builtin.${id}.name` as never, { defaultValue: id }) as string,
        description: t(`builtin.${id}.description` as never, {
          defaultValue: "",
        }) as string,
        theme,
        origin: "system",
        author: "GANIS",
        version: SYSTEM_VERSION,
      })),
    [t],
  );

  const mine = useMemo<InstalledTheme[]>(
    () =>
      (developer ? packages : [])
        .filter((p) => p.type === "theme")
        .map((p) => ({
          id: p.id,
          packageId: p.packageId,
          name: p.name,
          description: p.description,
          theme: p.theme,
          origin: "mine",
          author: p.author,
          version: p.version,
          userPackage: p,
        })),
    [developer, packages],
  );

  return { system, mine, loaded, loading, loadError, reload: load };
}
