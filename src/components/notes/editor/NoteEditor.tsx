import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { noteExtensions } from "@/components/notes/editor/extensions";
import { NoteToolbar } from "@/components/notes/editor/NoteToolbar";
import "@/components/notes/editor/noteEditor.css";

interface NoteEditorProps {
  /** Document de départ (JSON de l'éditeur) ; `null` : note vide. */
  initialContent: Record<string, unknown> | null;
  /** Appelé à chaque modification. */
  onChange: (editor: Editor) => void;
  /** Appelé une fois l'éditeur prêt et rempli. */
  onReady?: (editor: Editor) => void;
}

/**
 * Éditeur d'une note : barre d'outils et page.
 *
 * Le document n'est lu qu'une fois, à l'ouverture : un enregistrement ne
 * remplace jamais ce que l'utilisateur est en train de taper.
 */
export function NoteEditor({ initialContent, onChange, onReady }: NoteEditorProps) {
  const { t } = useTranslation("notes");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const editor = useEditor({
    extensions: noteExtensions(t("editor.placeholder")),
    content: initialContent ?? "",
    onUpdate: ({ editor: current }) => onChangeRef.current(current),
    editorProps: {
      attributes: {
        class: "note-content focus:outline-none",
        spellcheck: "true",
      },
    },
  });

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="note-editor rounded-xl border bg-card shadow-sm">
      <NoteToolbar editor={editor} />
      <div className="px-6 py-6 sm:px-10" onClick={(event) => {
        // Un clic sous le texte place le curseur à la fin.
        if (event.target === event.currentTarget) editor.commands.focus("end");
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
