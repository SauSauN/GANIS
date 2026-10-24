import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileInput, Loader2, Save } from "lucide-react";
import { VersionsButton } from "@/components/history/VersionsDialog";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError, notifySaved } from "@/lib/notify";
import { countWordsPlain, plainText } from "@/lib/novel";
import type { ExportDocument } from "@/lib/novelExport";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import type { Editorial, Project } from "@/types";

interface EditorialViewProps {
  project: Project;
  feature: WorkspaceFeature;
}

type Field = "pitch" | "summaryShort" | "summaryLong";
type Draft = Pick<Editorial, Field>;

const KEYS: Record<Field, "pitch" | "short" | "long"> = { pitch: "pitch", summaryShort: "short", summaryLong: "long" };
const MAX: Record<Field, number> = { pitch: 1000, summaryShort: 200_000, summaryLong: 200_000 };

/** Texte saisi → paragraphes pour l'export (une ligne vide sépare deux paragraphes). */
function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({ type: "paragraph" as const, runs: [{ text: block }], indent: false }));
}

/** Synopsis (HTML de l'éditeur) → texte avec paragraphes. */
function synopsisText(html: string): string {
  return html
    .split(/<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/li>/i)
    .map((part) => plainText(part).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Dossier de présentation éditoriale : pitch en une phrase, résumé court,
 * résumé long. Textes libres, indépendants du synopsis (qui peut servir de
 * point de départ), versionnés et exportables séparément.
 */
export function EditorialView({ project, feature }: EditorialViewProps) {
  const { t } = useTranslation(["novel", "common"]);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getEditorial(project.id)
      .then((value) => {
        if (cancelled) return;
        const next = { pitch: value.pitch, summaryShort: value.summaryShort, summaryLong: value.summaryLong };
        setSaved(next);
        setDraft(next);
      })
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const dirty = Boolean(draft && saved && (draft.pitch !== saved.pitch || draft.summaryShort !== saved.summaryShort || draft.summaryLong !== saved.summaryLong));

  async function save(): Promise<boolean> {
    if (!draft) return true;
    setSaving(true);
    try {
      const value = await api.updateEditorial(project.id, draft);
      setSaved({ pitch: value.pitch, summaryShort: value.summaryShort, summaryLong: value.summaryLong });
      notifySaved(t("editorial.saved"), `editorial:${project.id}`);
      return true;
    } catch (e) {
      notifyError(errorText(e), `editorial:${project.id}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  useUnsavedChanges({ dirty, save, revision: draft ? JSON.stringify(draft) : null });


  async function fromSynopsis(field: Field) {
    try {
      const synopsis = await api.getSynopsis(project.id);
      const text = synopsisText(synopsis.content);
      if (!text) {
        notifyError(t("editorial.synopsisEmpty"), `editorial:${project.id}`);
        return;
      }
      setDraft((current) => (current ? { ...current, [field]: text } : current));
    } catch (e) {
      notifyError(errorText(e), `editorial:${project.id}`);
    }
  }

  function exportOf(field: Field): ExportDocument {
    const key = KEYS[field];
    return {
      title: project.name,
      subtitle: [t(`editorial.${key === "pitch" ? "pitch" : key}`)],
      titlePage: false,
      blocks: paragraphs(draft?.[field] ?? ""),
    };
  }

  if (!draft) {
    return (
      <PageShell title={feature.label}>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("text.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  const section = (field: Field, rows: number, synopsis: boolean) => {
    const key = KEYS[field];
    const value = draft[field];
    const words = countWordsPlain(value);
    return (
      <section className="rounded-xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-semibold">{t(`editorial.${key}`)}</h2>
            <p className="text-sm text-muted-foreground">{t(`editorial.${key}Hint`)}</p>
          </div>
          <div className="flex items-center gap-2">
            {synopsis && (
              <Button variant="ghost" size="sm" disabled={value.trim() !== ""} title={t("editorial.fromSynopsisHint")} onClick={() => void fromSynopsis(field)}>
                <FileInput />
                {t("editorial.fromSynopsis")}
              </Button>
            )}
            <ExportMenu
              label={t("editorial.export")}
              dialogTitle={t("editorial.dialogTitle")}
              fileBase={`${project.name} - ${t(`editorial.fileSuffix.${key}`)}`}
              build={() => exportOf(field)}
              disabled={!value.trim()}
            />
          </div>
        </header>
        <div className="px-5 py-4">
          <textarea
            aria-label={t(`editorial.${key}`)}
            rows={rows}
            maxLength={MAX[field]}
            value={value}
            placeholder={field === "pitch" ? t("editorial.pitchPlaceholder") : undefined}
            onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
            className={cn(
              "w-full resize-y rounded-md border border-input bg-background px-3 py-2 leading-7 outline-none focus:ring-2 focus:ring-ring",
              field === "pitch" && "text-lg",
            )}
          />
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {t("words", { count: words })} · {t("editorial.characters", { count: value.length })}
          </p>
        </div>
      </section>
    );
  };

  return (
    <PageShell
      title={feature.label}
      description={t("editorial.intro")}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <VersionsButton projectId={project.id} kind="editorial" itemId="default" name={feature.label} />
          <Button disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {t("editorial.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {section("pitch", 3, false)}
        {section("summaryShort", 6, true)}
        {section("summaryLong", 16, true)}
      </div>
    </PageShell>
  );
}
