import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/*
 * Notes système : les titres (« # Nom », « ## Description générale »…) sont
 * fixes. Toute modification qui changerait la liste des titres (texte,
 * niveau, ajout, suppression, fusion avec un paragraphe) est refusée ; le
 * texte entre les titres reste libre.
 */

function headings(doc: PmNode): string {
  const list: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === "heading") list.push(`${node.attrs.level as number}:${node.textContent}`);
  });
  return list.join("\u0000");
}

export const ProtectedHeadings = Extension.create({
  name: "protectedHeadings",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("protectedHeadings"),
        filterTransaction: (tr) => !tr.docChanged || headings(tr.before) === headings(tr.doc),
      }),
    ];
  },
});
