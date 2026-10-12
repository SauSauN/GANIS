import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { StickyNote, Trash2 } from "lucide-react";
import { isStickyColor, STICKY_COLORS, STICKY_STYLES } from "@/lib/notes";
import { cn } from "@/lib/utils";
import type { StickyColor } from "@/types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Entoure les blocs sélectionnés d'un encadré « post-it ». */
      setCallout: (color?: StickyColor) => ReturnType;
      /** Retire l'encadré qui contient la sélection (son texte reste). */
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Encadré coloré dans une note, comme un post-it collé sur la page.
 * Il contient des blocs ordinaires (paragraphes, listes…) ; sa couleur se
 * choisit avec les pastilles qui apparaissent au survol.
 */
function CalloutView({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const { t } = useTranslation("notes");
  const color: StickyColor = isStickyColor(node.attrs.color) ? node.attrs.color : "yellow";
  const style = STICKY_STYLES[color];

  return (
    <NodeViewWrapper
      className="note-callout group/callout relative my-3 rounded-md border-l-4 py-2 pr-3 pl-10 shadow-sm"
      style={{ background: style.paper, borderColor: style.border, color: "#1f2937" }}
      data-color={color}
    >
      <span contentEditable={false} className="absolute top-2.5 left-3 opacity-60">
        <StickyNote aria-hidden className="size-4" />
      </span>

      {editor.isEditable && (
        <div
          contentEditable={false}
          className="absolute -top-3 right-2 flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 opacity-0 shadow-sm transition-opacity group-hover/callout:opacity-100 focus-within:opacity-100"
        >
          {STICKY_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              title={t(`colors.${item}`)}
              aria-label={t(`colors.${item}`)}
              aria-pressed={item === color}
              onClick={() => updateAttributes({ color: item })}
              className={cn(
                "size-3.5 rounded-full border border-black/10",
                item === color && "ring-2 ring-ring ring-offset-1",
              )}
              style={{ background: STICKY_STYLES[item].swatch }}
            />
          ))}
          <button
            type="button"
            title={t("editor.callout.remove")}
            aria-label={t("editor.callout.remove")}
            onClick={() => deleteNode()}
            className="ml-1 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}

      <NodeViewContent className="note-callout-content" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (element) => {
          const value = element.getAttribute("data-color");
          return isStickyColor(value) ? value : "yellow";
        },
        renderHTML: (attributes) => ({ "data-color": attributes.color }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (color = "yellow") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { color }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
