import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Code2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Quote,
  Redo2,
  RemoveFormatting,
  GitCommitHorizontal,
  Strikethrough,
  StickyNote,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table2,
  Underline,
  Undo2,
  Unlink,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { isSafeLink } from "@/components/notes/editor/extensions";
import { HIGHLIGHT_COLORS, NOTE_FONT_SIZES, NOTE_FONTS, TEXT_COLORS } from "@/lib/notes";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// Éléments de base
// ----------------------------------------------------------------------------

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ icon: Icon, label, active, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      // Garder la sélection de l'éditeur pendant le clic.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded text-foreground/80 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

const Separator = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

/** Menu déroulant léger (se ferme au clic extérieur ou avec Échap). */
function ToolMenu({
  icon: Icon,
  label,
  active,
  indicator,
  children,
  wide,
  alignRight,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  /** Petite barre de couleur sous l'icône. */
  indicator?: string | null;
  children: (close: () => void) => ReactNode;
  wide?: boolean;
  /** Menu ouvert vers la gauche (bouton en fin de barre). */
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  /** Pas assez de place à droite : le menu s'ouvre vers la gauche. */
  const [toLeft, setToLeft] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const rect = ref.current?.getBoundingClientRect();
          setToLeft(Boolean(alignRight && rect && rect.left + 260 > window.innerWidth));
          setOpen((value) => !value);
        }}
        className={cn(
          "flex h-7 shrink-0 items-center gap-0.5 rounded px-1 text-foreground/80 hover:bg-accent hover:text-foreground",
          (active || open) && "bg-primary/15 text-primary",
        )}
      >
        <span className="relative flex flex-col items-center">
          <Icon className="size-4" />
          {indicator !== undefined && (
            <span
              className="mt-px h-0.5 w-4 rounded-full"
              style={{ background: indicator ?? "transparent" }}
            />
          )}
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-40 mt-1 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg",
            toLeft ? "right-0" : "left-0",
            wide ? "w-56" : "w-auto",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
        danger && "text-destructive",
      )}
    >
      {label}
    </button>
  );
}

function Swatches({
  colors,
  onPick,
  onClear,
  clearLabel,
}: {
  colors: string[];
  onPick: (color: string) => void;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <div className="w-44 space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color)}
            className="size-7 rounded border border-black/10 hover:scale-110"
            style={{ background: color }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
      >
        {clearLabel}
      </button>
    </div>
  );
}

const selectClass =
  "h-7 shrink-0 rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-ring";

// ----------------------------------------------------------------------------
// Barre d'outils
// ----------------------------------------------------------------------------

/**
 * Barre d'outils de l'éditeur de notes : typographie, listes, tableaux,
 * encadrés post-it, cases enchaînées et schémas.
 */
export function NoteToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation("notes");
  const [linkDraft, setLinkDraft] = useState("");

  // Relu à chaque changement de sélection ou de contenu.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        block: e.isActive("heading", { level: 1 })
          ? "h1"
          : e.isActive("heading", { level: 2 })
            ? "h2"
            : e.isActive("heading", { level: 3 })
              ? "h3"
              : "p",
        fontFamily: style.fontFamily ?? "",
        fontSize: style.fontSize ?? "",
        color: style.color ?? null,
        highlight: (e.getAttributes("highlight") as { color?: string }).color ?? null,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        sup: e.isActive("superscript"),
        sub: e.isActive("subscript"),
        code: e.isActive("code"),
        align: (["center", "right", "justify"] as const).find((value) => e.isActive({ textAlign: value })) ?? "left",
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        quote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        link: e.isActive("link"),
        linkHref: (e.getAttributes("link") as { href?: string }).href ?? "",
        table: e.isActive("table"),
        callout: e.isActive("callout"),
      };
    },
  });

  const chain = () => editor.chain().focus();
  const fontId = NOTE_FONTS.find((font) => font.value === state.fontFamily)?.id ?? "";

  function setBlock(value: string) {
    if (value === "p") chain().setParagraph().run();
    else chain().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  }

  function applyLink(close: () => void) {
    const url = linkDraft.trim();
    if (!url) {
      chain().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
      if (!isSafeLink(href)) return;
      chain().extendMarkRange("link").setLink({ href }).run();
    }
    close();
  }

  return (
    <div
      role="toolbar"
      aria-label={t("editor.toolbar")}
      className="sticky top-0 z-30 flex flex-wrap items-center gap-0.5 border-b bg-card/95 px-2 py-1.5 backdrop-blur"
    >
      <ToolButton icon={Undo2} label={t("editor.undo")} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label={t("editor.redo")} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      <Separator />

      {/* Style de paragraphe */}
      <select
        aria-label={t("editor.block.label")}
        title={t("editor.block.label")}
        value={state.block}
        onChange={(event) => setBlock(event.target.value)}
        className={cn(selectClass, "w-28")}
      >
        <option value="p">{t("editor.block.paragraph")}</option>
        <option value="h1">{t("editor.block.h1")}</option>
        <option value="h2">{t("editor.block.h2")}</option>
        <option value="h3">{t("editor.block.h3")}</option>
      </select>

      {/* Police */}
      <select
        aria-label={t("editor.font.label")}
        title={t("editor.font.label")}
        value={fontId}
        onChange={(event) => {
          const font = NOTE_FONTS.find((item) => item.id === event.target.value);
          if (font) chain().setFontFamily(font.value).run();
          else chain().unsetFontFamily().run();
        }}
        className={cn(selectClass, "w-32")}
      >
        <option value="">{t("editor.font.default")}</option>
        {NOTE_FONTS.map((font) => (
          <option key={font.id} value={font.id} style={{ fontFamily: font.value }}>
            {font.label}
          </option>
        ))}
      </select>

      {/* Taille */}
      <select
        aria-label={t("editor.size.label")}
        title={t("editor.size.label")}
        value={state.fontSize}
        onChange={(event) => {
          if (event.target.value) chain().setFontSize(event.target.value).run();
          else chain().unsetFontSize().run();
        }}
        className={cn(selectClass, "w-16")}
      >
        <option value="">{t("editor.size.default")}</option>
        {NOTE_FONT_SIZES.map((size) => (
          <option key={size} value={`${size}px`}>
            {size}
          </option>
        ))}
      </select>
      <Separator />

      <ToolButton icon={Bold} label={t("editor.bold")} active={state.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label={t("editor.italic")} active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label={t("editor.underline")} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label={t("editor.strike")} active={state.strike} onClick={() => chain().toggleStrike().run()} />

      <ToolMenu icon={Baseline} label={t("editor.color")} indicator={state.color ?? "currentColor"}>
        {(close) => (
          <Swatches
            colors={TEXT_COLORS}
            clearLabel={t("editor.colorReset")}
            onPick={(color) => {
              chain().setColor(color).run();
              close();
            }}
            onClear={() => {
              chain().unsetColor().run();
              close();
            }}
          />
        )}
      </ToolMenu>

      <ToolMenu icon={Highlighter} label={t("editor.highlight")} indicator={state.highlight}>
        {(close) => (
          <Swatches
            colors={HIGHLIGHT_COLORS}
            clearLabel={t("editor.highlightReset")}
            onPick={(color) => {
              chain().setHighlight({ color }).run();
              close();
            }}
            onClear={() => {
              chain().unsetHighlight().run();
              close();
            }}
          />
        )}
      </ToolMenu>

      <Separator />

      <ToolButton icon={AlignLeft} label={t("editor.align.left")} active={state.align === "left"} onClick={() => chain().setTextAlign("left").run()} />
      <ToolButton icon={AlignCenter} label={t("editor.align.center")} active={state.align === "center"} onClick={() => chain().setTextAlign("center").run()} />
      <ToolButton icon={AlignRight} label={t("editor.align.right")} active={state.align === "right"} onClick={() => chain().setTextAlign("right").run()} />
      <Separator />

      <ToolButton icon={List} label={t("editor.bulletList")} active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label={t("editor.orderedList")} active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={ListChecks} label={t("editor.taskList")} active={state.task} onClick={() => chain().toggleTaskList().run()} />
      <Separator />

      <ToolButton icon={Quote} label={t("editor.quote")} active={state.quote} onClick={() => chain().toggleBlockquote().run()} />

      <ToolMenu icon={Link2} label={t("editor.link.label")} active={state.link}>
        {(close) => (
          <form
            className="flex w-72 flex-col gap-2 p-1"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink(close);
            }}
          >
            <input
              autoFocus
              defaultValue={state.linkHref}
              onChange={(event) => setLinkDraft(event.target.value)}
              onFocus={(event) => setLinkDraft(event.target.value)}
              placeholder="https://…"
              aria-label={t("editor.link.url")}
              className="h-8 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              {state.link && (
                <button
                  type="button"
                  onClick={() => {
                    chain().extendMarkRange("link").unsetLink().run();
                    close();
                  }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                >
                  <Unlink className="size-3.5" />
                  {t("editor.link.remove")}
                </button>
              )}
              <button type="submit" className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                {t("editor.link.apply")}
              </button>
            </div>
          </form>
        )}
      </ToolMenu>
      <Separator />

      {/* Tableau */}
      <ToolMenu icon={Table2} label={t("editor.table.label")} active={state.table} wide>
        {(close) => {
          const run = (action: () => boolean) => () => {
            action();
            close();
          };

          if (!state.table) {
            return (
              <>
                <MenuItem label={t("editor.table.insert")} onClick={run(() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
                <MenuItem label={t("editor.table.insertPlain")} onClick={run(() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run())} />
              </>
            );
          }

          return (
            <>
              <MenuItem label={t("editor.table.rowBefore")} onClick={run(() => chain().addRowBefore().run())} />
              <MenuItem label={t("editor.table.rowAfter")} onClick={run(() => chain().addRowAfter().run())} />
              <MenuItem label={t("editor.table.colBefore")} onClick={run(() => chain().addColumnBefore().run())} />
              <MenuItem label={t("editor.table.colAfter")} onClick={run(() => chain().addColumnAfter().run())} />
              <div className="my-1 h-px bg-border" />
              <MenuItem label={t("editor.table.toggleHeader")} onClick={run(() => chain().toggleHeaderRow().run())} />
              <MenuItem label={t("editor.table.merge")} disabled={!editor.can().mergeOrSplit()} onClick={run(() => chain().mergeOrSplit().run())} />
              <div className="my-1 h-px bg-border" />
              <MenuItem danger label={t("editor.table.deleteRow")} onClick={run(() => chain().deleteRow().run())} />
              <MenuItem danger label={t("editor.table.deleteCol")} onClick={run(() => chain().deleteColumn().run())} />
              <MenuItem danger label={t("editor.table.delete")} onClick={run(() => chain().deleteTable().run())} />
            </>
          );
        }}
      </ToolMenu>

      <ToolButton
        icon={StickyNote}
        label={state.callout ? t("editor.callout.unwrap") : t("editor.callout.insert")}
        active={state.callout}
        onClick={() => (state.callout ? chain().unsetCallout().run() : chain().setCallout().run())}
      />
      <ToolButton icon={GitCommitHorizontal} label={t("editor.chain.insert")} onClick={() => chain().insertChain().run()} />
      <ToolButton icon={Workflow} label={t("editor.diagram.insert")} onClick={() => chain().insertDiagram().run()} />
      <Separator />

      {/* Outils moins courants, regroupés pour alléger la barre. */}
      <ToolMenu
        icon={MoreHorizontal}
        label={t("editor.more")}
        alignRight
        active={state.sup || state.sub || state.code || state.codeBlock || state.align === "justify"}
        wide
      >
        {(close) => {
          const item = (icon: typeof Bold, label: string, active: boolean, action: () => boolean) => {
            const Icon = icon;
            return (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  action();
                  close();
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-accent",
                  active && "text-primary",
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                {active && <span aria-hidden>✓</span>}
              </button>
            );
          };
          return (
            <>
              {item(SupIcon, t("editor.superscript"), state.sup, () => chain().toggleSuperscript().run())}
              {item(SubIcon, t("editor.subscript"), state.sub, () => chain().toggleSubscript().run())}
              {item(Code, t("editor.code"), state.code, () => chain().toggleCode().run())}
              {item(AlignJustify, t("editor.align.justify"), state.align === "justify", () => chain().setTextAlign("justify").run())}
              <div className="my-1 h-px bg-border" />
              {item(Code2, t("editor.codeBlock"), state.codeBlock, () => chain().toggleCodeBlock().run())}
              {item(Minus, t("editor.rule"), false, () => chain().setHorizontalRule().run())}
              <div className="my-1 h-px bg-border" />
              {item(RemoveFormatting, t("editor.clear"), false, () => chain().unsetAllMarks().run())}
            </>
          );
        }}
      </ToolMenu>
    </div>
  );
}
