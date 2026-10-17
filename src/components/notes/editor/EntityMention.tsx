import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type ReactNodeViewProps } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { useTranslation } from "react-i18next";
import { ListTree, MapPin, UserRound, type LucideIcon } from "lucide-react";
import { isMentionKind, matchMentions, useNoteLinksContext, type MentionItem, type MentionKind } from "@/components/notes/editor/noteLinks";
import { cn } from "@/lib/utils";

/*
 * « $$ » dans une note : en tapant « $$ » puis quelques lettres, la note
 * propose les personnages, lieux et éléments du découpage qui
 * correspondent (la liste se met à jour à chaque lettre). Choisir un
 * élément (clic, Entrée ou Tab) le remplace par un lien vers sa fiche.
 *
 * Rien n'est complété d'office : si aucun élément ne correspond, la liste
 * disparaît et l'on continue d'écrire normalement. Échap la ferme aussi.
 */

export const MENTION_ICONS: Record<MentionKind, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  node: ListTree,
};

export interface EntityMentionOptions {
  /** Éléments du projet à proposer (lus au moment de la saisie). */
  getItems: () => MentionItem[];
}

const mentionKey = new PluginKey("entityMention");

/** Lien vers un élément dans la note : son nom actuel, cliquable. */
function MentionView({ node }: ReactNodeViewProps) {
  const { t } = useTranslation("notes");
  const links = useNoteLinksContext();
  const kind: MentionKind = isMentionKind(node.attrs.kind) ? node.attrs.kind : "character";
  const id = String(node.attrs.id ?? "");
  const current = links.resolve(kind, id);
  const label = current ?? String(node.attrs.label ?? "");
  const Icon = MENTION_ICONS[kind];
  const missing = current === null;

  return (
    <NodeViewWrapper as="span" className="note-mention-wrapper">
      <button
        type="button"
        contentEditable={false}
        data-kind={kind}
        className={cn("note-mention", missing && "note-mention-missing")}
        title={missing ? t("mentions.missing") : t("mentions.open", { name: label })}
        onClick={() => !missing && links.open(kind, id)}
      >
        <Icon aria-hidden className="note-mention-icon" />
        {label}
      </button>
    </NodeViewWrapper>
  );
}

interface ListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface ListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

/** Liste des éléments proposés sous le curseur. */
const MentionList = forwardRef<ListHandle, ListProps>(function MentionList({ items, command }, ref) {
  const { t } = useTranslation("notes");
  const [active, setActive] = useState(0);

  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[active] ?? items[0]);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div role="listbox" aria-label={t("mentions.label")} className="w-72 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
      {items.map((item, index) => {
        const Icon = MENTION_ICONS[item.kind];
        return (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(item)}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", index === active && "bg-accent")}
          >
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="shrink-0 text-[0.7rem] text-muted-foreground">{t(`mentions.kinds.${item.kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
});

export const EntityMention = Node.create<EntityMentionOptions>({
  name: "entityMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { getItems: () => [] };
  },

  addAttributes() {
    return {
      kind: { default: "character", parseHTML: (el) => el.getAttribute("data-kind") },
      id: { default: "", parseHTML: (el) => el.getAttribute("data-id") },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention": "",
        "data-kind": node.attrs.kind,
        "data-id": node.attrs.id,
        "data-label": node.attrs.label,
      }),
      String(node.attrs.label ?? ""),
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label ?? "");
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: "span" });
  },

  addProseMirrorPlugins() {
    const getItems = this.options.getItems;
    return [
      Suggestion<MentionItem, MentionItem>({
        editor: this.editor,
        pluginKey: mentionKey,
        char: "$$",
        allowSpaces: true,
        allowedPrefixes: null,
        decorationClass: "note-mention-query",
        items: ({ query }) => matchMentions(getItems(), query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "entityMention", attrs: { kind: props.kind, id: props.id, label: props.label } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let renderer: ReactRenderer<ListHandle, ListProps> | null = null;
          let unmount: (() => void) | null = null;

          const sync = (props: SuggestionProps<MentionItem, MentionItem>) => {
            renderer?.updateProps({ items: props.items, command: props.command });
            // Aucun élément : rien n'est montré, on continue d'écrire.
            if (renderer) renderer.element.style.display = props.items.length ? "" : "none";
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(MentionList, { editor: props.editor, props: { items: props.items, command: props.command } });
              renderer.element.style.zIndex = "60";
              sync(props);
              unmount = props.mount(renderer.element);
            },
            onUpdate: (props) => sync(props),
            onKeyDown: ({ event }) => renderer?.ref?.onKeyDown(event) ?? false,
            onExit: () => {
              unmount?.();
              renderer?.destroy();
              renderer = null;
              unmount = null;
            },
          };
        },
      }),
    ];
  },
});
