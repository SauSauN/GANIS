import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Affiche le contenu d'un synopsis en lecture seule.
 *
 * Le contenu est du HTML produit par l'éditeur. Il n'est jamais injecté
 * tel quel dans la page : il est relu par l'éditeur, qui ne conserve que
 * les éléments de son schéma (titres, paragraphes, listes, gras, etc.).
 * Scripts, gestionnaires d'événements (`onerror`, `onclick`…) et liens
 * `javascript:` sont donc écartés, même si la base contenait du HTML
 * malveillant (par exemple venant d'un projet importé).
 */
export function SynopsisContent({ html }: { html: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Un clic sur un lien ne doit pas faire quitter l'application.
        link: { openOnClick: false },
      }),
    ],
    content: html,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none leading-7 dark:prose-invert",
      },
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== html) {
      editor.commands.setContent(html);
    }
  }, [editor, html]);

  return <EditorContent editor={editor} />;
}