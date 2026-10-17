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
 */
export function noteExtensions(
  placeholder: string,
  options: { mentions?: EntityMentionOptions; spelling?: SpellCheckOptions; lockHeadings?: boolean } = {},
): Extensions {
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
    Placeholder.configure({ placeholder, includeChildren: false }),
    Callout,
    Chain,
    ChainItem,
    Diagram,
    EntityMention.configure(options.mentions ?? {}),
    ...(options.spelling ? [SpellCheck.configure(options.spelling)] : []),
    ...(options.lockHeadings ? [ProtectedHeadings] : []),
  ];
}
