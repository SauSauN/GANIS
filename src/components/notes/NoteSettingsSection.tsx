import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderLock, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardClass, cardContentClass, cardHeaderClass } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { useNoteStore } from "@/stores/noteStore";
import { errorText } from "@/lib/errors";

/**
 * Paramètres du projet › Notes : l'option « notes système » (désactivée par
 * défaut). Active, elle crée un dossier « Notes système » où la description
 * et les notes de l'auteur de chaque fiche se lisent et se modifient comme
 * des notes (voir `system_note_service`).
 */
export function NoteSettingsSection({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation("projectSettings");
  const fetchNotes = useNoteStore((s) => s.fetchNotes);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getSystemNotes(projectId)
      .then((s) => alive && setEnabled(s.enabled))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function toggle(next: boolean) {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await api.setSystemNotes(projectId, next, i18n.language);
      setEnabled(saved.enabled);
      setFeedback({ tone: "ok", text: saved.enabled ? t("notes.enabledDone") : t("notes.disabledDone") });
      void fetchNotes(projectId);
    } catch (error) {
      setFeedback({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("notes.title")}</CardTitle>
          <CardDescription>{t("notes.description")}</CardDescription>
        </CardHeader>
        <CardContent className={`${cardContentClass} space-y-4`}>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={enabled === true}
              disabled={enabled === null || busy}
              onChange={(e) => void toggle(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                <FolderLock className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("notes.toggle")}
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("notes.toggleHint")}</span>
            </span>
          </label>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>{t("notes.rule1")}</li>
            <li>{t("notes.rule2")}</li>
            <li>{t("notes.rule3")}</li>
          </ul>
          {feedback && (
            <p role={feedback.tone === "error" ? "alert" : "status"} className={feedback.tone === "error" ? "text-sm text-destructive" : "text-sm text-success"}>
              {feedback.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
