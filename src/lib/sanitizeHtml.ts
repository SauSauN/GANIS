/*
 * Nettoyage du HTML produit à partir d'un fichier Word (voir
 * `DocumentViewer`) : seules les balises de mise en forme du texte sont
 * gardées. Pas de script, pas de style, pas de lien qui quitterait GANIS ;
 * les images ne peuvent venir que du document lui-même (`data:image/…`).
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del", "sub", "sup",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "blockquote", "pre",
  "code", "span", "div", "hr", "img", "a", "section", "article", "small", "mark",
]);

/** Contenu supprimé avec la balise (le reste ne perd que la balise). */
const DROPPED_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "link", "meta", "title", "head", "form", "button", "input", "select", "textarea"]);

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  img: ["src", "alt"],
  a: ["href", "id"],
  li: ["id"],
  p: ["id"],
};

const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;
const ANCHOR = /^#[\w-]+$/;
const ID = /^[\w-]+$/;

function clean(node: Element, doc: Document) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    const tag = element.tagName.toLowerCase();

    if (DROPPED_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }

    clean(element, doc);

    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const keep =
        allowed.includes(name) &&
        (name === "src" ? SAFE_IMAGE.test(value) : name === "href" ? ANCHOR.test(value) : name === "id" ? ID.test(value) : /^\d{1,3}$/.test(value) || name === "alt");
      if (!keep) element.removeAttribute(attribute.name);
    }

    // Image sans source sûre, lien vers l'extérieur : seulement le texte.
    if (tag === "img" && !element.hasAttribute("src")) {
      element.remove();
    } else if (tag === "a" && !element.hasAttribute("href") && !element.hasAttribute("id")) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  }
}

/** HTML sûr à insérer dans la page. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  clean(doc.body, doc);
  return doc.body.innerHTML;
}
