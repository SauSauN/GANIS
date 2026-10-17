import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { FolderSelect } from "@/components/notes/FolderSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { cardClass, cardContentClass, cardHeaderClass, PageShell } from "@/components/workspace/views/PageShell";
import { MAX_NOTE_TITLE, noteTabId } from "@/lib/notes";
import { useNoteStore, useProjectNotes } from "@/stores/noteStore";
import { errorText } from "@/lib/errors";

interface NoteCreateViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Création d'une note : titre (facultatif) et dossier, puis ouverture de l'éditeur. */
export function NoteCreateView({ projectId, feature, onOpenFeature }: NoteCreateViewProps) {
  const { t } = useTranslation("notes");
  const { folders } = useProjectNotes(projectId);
  const createNote = useNoteStore((state) => state.createNote);
  const preset = useNoteStore((state) => state.createFolder);
  const setPreset = useNoteStore((state) => state.setCreateFolder);

  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // « Nouvelle note » depuis un dossier de la liste : dossier prérempli.
  useEffect(() => {
    if (preset) {
      setFolderId(preset);
      setPreset(null);
    }
  }, [preset, setPreset]);

  // Dossier supprimé entre-temps : retour à la racine.
  useEffect(() => {
    if (folderId && !folders.some((folder) => folder.id === folderId)) setFolderId(null);
  }, [folders, folderId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const note = await createNote(projectId, folderId, title);
      setTitle("");
      onOpenFeature(noteTabId(note.id));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title={feature.label} description={feature.description}>
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle className="text-base">{t("create.card")}</CardTitle>
          <CardDescription>{t("create.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className={cardContentClass}>
          <form onSubmit={(event) => void submit(event)} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="note-create-title">{t("create.title")}</Label>
              <Input
                id="note-create-title"
                autoFocus
                value={title}
                maxLength={MAX_NOTE_TITLE}
                placeholder={t("create.titlePlaceholder")}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-create-folder">{t("create.folder")}</Label>
              <FolderSelect id="note-create-folder" folders={folders} value={folderId} onChange={setFolderId} />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                <Plus className="mr-1.5 size-4" />
                {busy ? t("create.creating") : t("create.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
