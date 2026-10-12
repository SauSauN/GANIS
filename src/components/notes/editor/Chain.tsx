import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chain: {
      /** Insère une suite de cases enchaînées (trois cases vides). */
      insertChain: () => ReturnType;
    };
  }
}

const emptyCell = () => ({ type: "chainItem", content: [{ type: "paragraph" }] });

/**
 * Cases enchaînées : une suite de cases reliées par des flèches
 * (étapes, chronologie, causes et conséquences…).
 *
 * Un « + » permet d'ajouter une case avant la première, entre deux cases
 * ou après la dernière ; la croix d'une case la supprime (la dernière
 * case restante supprime toute la suite).
 */
function ChainView() {
  return (
    <NodeViewWrapper className="note-chain my-4">
      <NodeViewContent className="note-chain-items" />
    </NodeViewWrapper>
  );
}

function ChainItemView({ editor, getPos, node, deleteNode }: ReactNodeViewProps) {
  const { t } = useTranslation("notes");
  const editable = editor.isEditable;

  /** Ajoute une case vide à `pos` et y place le curseur. */
  function insertAt(pos: number) {
    editor
      .chain()
      .insertContentAt(pos, emptyCell())
      .setTextSelection(pos + 2)
      .focus()
      .run();
  }

  function insertBefore() {
    const pos = getPos();
    if (typeof pos === "number") insertAt(pos);
  }

  function insertAfter() {
    const pos = getPos();
    if (typeof pos === "number") insertAt(pos + node.nodeSize);
  }

  function remove() {
    const pos = getPos();
    if (typeof pos !== "number") return;

    const $pos = editor.state.doc.resolve(pos);

    if ($pos.parent.childCount > 1) {
      deleteNode();
      return;
    }

    // Dernière case : toute la suite disparaît.
    const start = $pos.before($pos.depth);
    editor.chain().deleteRange({ from: start, to: start + $pos.parent.nodeSize }).focus().run();
  }

  return (
    <NodeViewWrapper className="note-chain-cell-inner group/cell">
      {editable && (
        <button
          type="button"
          contentEditable={false}
          onClick={insertBefore}
          title={t("editor.chain.addBefore")}
          aria-label={t("editor.chain.addBefore")}
          className="note-chain-add note-chain-add-before"
        >
          <Plus className="size-3" />
        </button>
      )}

      <div className="note-chain-box">
        <NodeViewContent className="note-chain-box-content" />

        {editable && (
          <button
            type="button"
            contentEditable={false}
            onClick={remove}
            title={t("editor.chain.remove")}
            aria-label={t("editor.chain.remove")}
            className="absolute -top-3 -right-3 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-100 focus-visible:opacity-100 hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {editable && (
        <button
          type="button"
          contentEditable={false}
          onClick={insertAfter}
          title={t("editor.chain.addAfter")}
          aria-label={t("editor.chain.addAfter")}
          className="note-chain-add note-chain-add-after"
        >
          <Plus className="size-3" />
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const Chain = Node.create({
  name: "chain",
  group: "block",
  content: "chainItem+",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-chain]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-chain": "" }), 0];
  },

  addCommands() {
    return {
      insertChain:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, content: [emptyCell(), emptyCell(), emptyCell()] })
            // Curseur dans la première case de la suite insérée.
            .command(({ tr }) => {
              // La suite qui contient la sélection, sinon la dernière avant elle.
              const from = tr.selection.from;
              let start = -1;
              tr.doc.descendants((node, pos) => {
                if (node.type.name === this.name && pos < from && pos > start) start = pos;
                return node.type.name !== this.name;
              });
              if (start >= 0) tr.setSelection(TextSelection.create(tr.doc, start + 3));
              return true;
            })
            .run(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChainView);
  },
});

export const ChainItem = Node.create({
  name: "chainItem",
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-chain-item]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-chain-item": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChainItemView, { className: "note-chain-cell" });
  },
});
