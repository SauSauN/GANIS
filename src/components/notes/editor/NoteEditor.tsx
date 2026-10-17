import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { BookPlus, EyeOff } from "lucide-react";
import { noteExtensions } from "@/components/notes/editor/extensions";
import { NoteLinksContext, useNoteLinks } from "@/components/notes/editor/noteLinks";
import { NoteToolbar } from "@/components/notes/editor/NoteToolbar";
import { ignoreWord, refreshSpelling, type SpellMenuRequest } from "@/components/notes/editor/SpellCheck";
import { addPersonalWord, spellLanguage, suggestWords } from "@/lib/spellcheck";
import "@/components/notes/editor/noteEditor.css";

interface NoteEditorProps {
  projectId: string;
  /** Document de départ (JSON de l'éditeur) ; `null` : note vide. */
  initialContent: Record<string, unknown> | null;
  /** Appelé à chaque modification. */
  onChange: (editor: Editor) => void;
  /** Appelé une fois l'éditeur prêt et rempli. */
  onReady?: (editor: Editor) => void;
  /** Ouvre la fiche d'un élément cité avec « $$ ». */
  onOpenFeature?: (featureId: string) => void;
  /** Note système : titres fixes, pas de mise en forme (texte simple des fiches). */
  system?: boolean;
}

/**
 * Éditeur d'une note : barre d'outils et page.
 *
 * Le document n'est lu qu'une fois, à l'ouverture : un enregistrement ne
 * remplace jamais ce que l'utilisateur est en train de taper.
 *
 * L'orthographe est vérifiée dans la langue du logiciel ; « $$ » propose
 * les personnages, lieux et éléments du découpage à citer.
 */
export function NoteEditor({ projectId, initialContent, onChange, onReady, onOpenFeature, system = false }: NoteEditorProps) {
  const { t, i18n } = useTranslation("notes");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const links = useNoteLinks(projectId, onOpenFeature);
  const linksRef = useRef(links);
  linksRef.current = links;
  const languageRef = useRef(i18n.language);
  languageRef.current = i18n.language;
  const [menu, setMenu] = useState<SpellMenuRequest | null>(null);

  const editor = useEditor({
    extensions: noteExtensions(system ? "" : t("editor.placeholder"), {
      lockHeadings: system,
      mentions: { getItems: () => linksRef.current.items },
      spelling: {
        getLanguage: () => spellLanguage(languageRef.current),
        getAccepted: () => linksRef.current.names,
        onMenu: setMenu,
      },
    }),
    content: initialContent ?? "",
    onUpdate: ({ editor: current }) => onChangeRef.current(current),
    editorProps: {
      attributes: {
        class: system ? "note-content note-system focus:outline-none" : "note-content focus:outline-none",
        // Le correcteur du système suivrait la langue de Windows : GANIS a le sien.
        spellcheck: "false",
        lang: spellLanguage(i18n.language),
      },
    },
  });

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  // Langue du logiciel changée, ou noms du projet chargés : nouveau passage.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute("lang", spellLanguage(i18n.language));
    // Hors du rendu de React (les vues des liens se redessinent aussitôt).
    const timer = setTimeout(() => !editor.isDestroyed && refreshSpelling(editor.view), 0);
    return () => clearTimeout(timer);
  }, [editor, i18n.language, links.names]);

  if (!editor) return null;

  return (
    <NoteLinksContext.Provider value={links}>
      <div className="note-editor rounded-xl border bg-card shadow-sm">
        {!system && <NoteToolbar editor={editor} />}
        <div
          className="px-6 py-6 sm:px-10"
          onClick={(event) => {
            // Un clic sous le texte place le curseur à la fin.
            if (event.target === event.currentTarget) editor.commands.focus("end");
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      {menu && <SpellMenu editor={editor} request={menu} language={spellLanguage(i18n.language)} onClose={() => setMenu(null)} />}
    </NoteLinksContext.Provider>
  );
}

/** Clic droit sur un mot souligné : suggestions, ajouter au dictionnaire, ignorer. */
function SpellMenu({ editor, request, language, onClose }: { editor: Editor; request: SpellMenuRequest; language: "fr" | "en"; onClose: () => void }) {
  const { t } = useTranslation("notes");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: request.x, top: request.y });

  useEffect(() => {
    let alive = true;
    void suggestWords(language, request.word).then((list) => alive && setSuggestions(list));
    return () => {
      alive = false;
    };
  }, [language, request.word]);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      left: Math.min(request.x, window.innerWidth - box.width - 8),
      top: request.y + box.height > window.innerHeight - 8 ? Math.max(8, request.y - box.height) : request.y,
    });
  }, [request.x, request.y, suggestions]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  function replace(word: string) {
    editor.chain().focus().insertContentAt({ from: request.from, to: request.to }, word).run();
    onClose();
  }

  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("spell.menu")}
      className="fixed z-[70] w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
      style={position}
    >
      {suggestions === null && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("spell.loading")}</p>}
      {suggestions?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("spell.none")}</p>}
      {suggestions?.map((word) => (
        <button key={word} type="button" role="menuitem" className={`${item} font-medium`} onClick={() => replace(word)}>
          {word}
        </button>
      ))}
      <div className="my-1 border-t" />
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          addPersonalWord(request.word);
          refreshSpelling(editor.view);
          onClose();
        }}
      >
        <BookPlus className="size-4 text-muted-foreground" />
        {t("spell.add")}
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          ignoreWord(request.word);
          refreshSpelling(editor.view);
          onClose();
        }}
      >
        <EyeOff className="size-4 text-muted-foreground" />
        {t("spell.ignore")}
      </button>
    </div>
  );
}
