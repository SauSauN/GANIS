import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { cachedCorrect, checkWords, wordsOf, type SpellLanguage } from "@/lib/spellcheck";

/*
 * Soulignement des fautes dans une note, avec le dictionnaire de la langue
 * du logiciel (voir `lib/spellcheck`). Le correcteur du système est coupé
 * dans l'éditeur : il suivrait la langue de Windows, pas celle de GANIS.
 *
 * Ne sont pas vérifiés : le code, les adresses, le mot en cours de frappe,
 * les noms des personnages et des lieux du projet, les mots ajoutés au
 * dictionnaire personnel ou ignorés.
 */

export interface SpellMenuRequest {
  word: string;
  from: number;
  to: number;
  x: number;
  y: number;
}

export interface SpellCheckOptions {
  getLanguage: () => SpellLanguage;
  /** Mots acceptés (noms du projet), en minuscules. */
  getAccepted: () => Set<string>;
  /** Clic droit sur un mot souligné. */
  onMenu: (request: SpellMenuRequest) => void;
}

export const spellKey = new PluginKey<DecorationSet>("spellcheck");

/** Mots ignorés pendant la séance. */
const ignored = new Set<string>();

export function ignoreWord(word: string) {
  ignored.add(word.toLowerCase());
}

/** Redessine les soulignements (langue changée, mot ajouté…). */
export function refreshSpelling(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(spellKey, "refresh"));
}

interface Found {
  word: string;
  from: number;
  to: number;
  parts: string[];
}

function collect(doc: PmNode, options: SpellCheckOptions): Found[] {
  const found: Found[] = [];
  const accepted = options.getAccepted();
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isText || !node.text) return;
    if (parent?.type.name === "codeBlock") return;
    if (node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
    for (const { word, index } of wordsOf(node.text)) {
      const lower = word.toLowerCase();
      if (accepted.has(lower) || ignored.has(lower)) continue;
      const parts = word.includes("-") ? word.split("-").filter((p) => p.length > 1) : [];
      found.push({ word, from: pos + index, to: pos + index + word.length, parts });
    }
  });
  return found;
}

function isWrong(lang: SpellLanguage, item: Found): boolean | undefined {
  const whole = cachedCorrect(lang, item.word);
  if (whole !== false) return whole === undefined ? undefined : false;
  // « peut-être », « well-known » : juste si chaque partie l'est.
  if (item.parts.length) {
    const parts = item.parts.map((p) => cachedCorrect(lang, p));
    if (parts.every((p) => p === true)) return false;
    if (parts.some((p) => p === undefined)) return undefined;
  }
  return true;
}

function build(state: EditorState, options: SpellCheckOptions, focused: boolean): DecorationSet {
  const lang = options.getLanguage();
  const head = state.selection.head;
  const decorations: Decoration[] = [];
  for (const item of collect(state.doc, options)) {
    // Le mot sous le curseur n'est souligné qu'une fois fini.
    if (focused && head >= item.from && head <= item.to) continue;
    if (isWrong(lang, item) === true) {
      decorations.push(Decoration.inline(item.from, item.to, { class: "spell-error", "data-word": item.word }));
    }
  }
  return DecorationSet.create(state.doc, decorations);
}

export const SpellCheck = Extension.create<SpellCheckOptions>({
  name: "spellCheck",

  addOptions() {
    return { getLanguage: () => "fr", getAccepted: () => new Set(), onMenu: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin<DecorationSet>({
        key: spellKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const meta = tr.getMeta(spellKey);
            if (meta instanceof DecorationSet) return meta;
            if (meta === "refresh") return DecorationSet.empty;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => spellKey.getState(state),
          handleDOMEvents: {
            contextmenu: (view, event) => {
              const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".spell-error");
              if (!target) return false;
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos) return false;
              const found = spellKey.getState(view.state)?.find(pos.pos, pos.pos);
              const deco = found?.[0];
              if (!deco) return false;
              event.preventDefault();
              options.onMenu({
                word: view.state.doc.textBetween(deco.from, deco.to),
                from: deco.from,
                to: deco.to,
                x: event.clientX,
                y: event.clientY,
              });
              return true;
            },
          },
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          let destroyed = false;
          let applying = false;

          const run = async () => {
            timer = null;
            if (destroyed) return;
            const lang = options.getLanguage();
            const items = collect(view.state.doc, options);
            const words = new Set<string>();
            for (const item of items) {
              words.add(item.word);
              for (const part of item.parts) words.add(part);
            }
            await checkWords(lang, words);
            if (destroyed) return;
            applying = true;
            try {
              view.dispatch(view.state.tr.setMeta(spellKey, build(view.state, options, view.hasFocus())).setMeta("addToHistory", false));
            } finally {
              applying = false;
            }
          };

          const schedule = (delay: number) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void run(), delay);
          };

          schedule(50);

          return {
            update: (current, previous) => {
              if (applying) return;
              const docChanged = !current.state.doc.eq(previous.doc);
              const stateChanged = spellKey.getState(current.state) !== spellKey.getState(previous);
              if (docChanged || stateChanged || !current.state.selection.eq(previous.selection)) schedule(docChanged ? 300 : 400);
            },
            destroy: () => {
              destroyed = true;
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
