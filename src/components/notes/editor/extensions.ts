import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Placeholder } from "@tiptap/extensions";
import { Callout } from "@/components/notes/editor/Callout";
import { Chain, ChainItem } from "@/components/notes/editor/Chain";
import { Diagram } from "@/components/notes/editor/Diagram";
import { EntityMention, type EntityMentionOptions } from "@/components/notes/editor/EntityMention";
import { ProtectedHeadings } from "@/components/notes/editor/ProtectedHeadings";
import { SpellCheck, type SpellCheckOptions } from "@/components/notes/editor/SpellCheck";

/** Adresses acceptées pour un lien : jamais `javascript:` ni `data:`. */
export function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

/**
 * Éléments de l'éditeur de notes. Ce qui n'est pas dans cette liste est
 * écarté à la lecture d'une note (le document enregistré ne peut rien
 * contenir d'autre).
 *
 * `system` (note système) : l'écriture seule, comme `WRITING_NODES` et
 * `WRITING_MARKS` côté Rust : titres fixes, police, taille, gras, italique,
 * souligné, barré et listes ; ni tableau, ni encadré, ni schéma. Ce qui est
 * collé d'ailleurs garde son texte.
 */
export function noteExtensions(
  placeholder: string,
  options: { mentions?: EntityMentionOptions; spelling?: SpellCheckOptions; system?: boolean } = {},
): Extensions {
  const shared: Extensions = [
    Placeholder.configure({ placeholder, includeChildren: false }),
    EntityMention.configure(options.mentions ?? {}),
    ...(options.spelling ? [SpellCheck.configure(options.spelling)] : []),
  ];

  if (options.system) {
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      TextStyleKit.configure({ lineHeight: false, color: false, backgroundColor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ProtectedHeadings,
      ...shared,
    ];
  }

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        // Un clic sur un lien ne doit pas faire quitter l'application.
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeLink(url),
      },
    }),
    TextStyleKit.configure({ lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TableKit.configure({ table: { resizable: true, lastColumnResizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
    Callout,
    Chain,
    ChainItem,
    Diagram,
    ...shared,
  ];
}
