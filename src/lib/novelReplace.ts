import type { FindMatch } from "@/types";

/**
 * Casse du remplacement adaptée à l'occurrence trouvée, comme le fait Rust
 * (`novel_replace_service::adapt_case`) quand la casse n'est pas respectée :
 * « MARC » → « MARTIN », « Marc » → « Martin ».
 */
export function adaptCase(found: string, replacement: string): string {
  const letters = [...found].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length >= 2 && letters.every((c) => c === c.toUpperCase())) return replacement.toUpperCase();
  const first = [...found][0];
  const [head, ...rest] = [...replacement];
  if (first && head && first !== first.toLowerCase() && head !== head.toUpperCase()) return head.toUpperCase() + rest.join("");
  return replacement;
}

/** Clé d'une occurrence (élément + numéro). */
export const matchKey = (match: Pick<FindMatch, "nodeId" | "index">) => `${match.nodeId}:${match.index}`;

/** Occurrences regroupées par élément, dans l'ordre donné des éléments. */
export function groupMatches(matches: FindMatch[], order: ReadonlyMap<string, number>): Array<{ nodeId: string; matches: FindMatch[] }> {
  const groups = new Map<string, FindMatch[]>();
  for (const match of matches) {
    const list = groups.get(match.nodeId);
    if (list) list.push(match);
    else groups.set(match.nodeId, [match]);
  }
  return [...groups.entries()]
    .map(([nodeId, list]) => ({ nodeId, matches: list }))
    .sort((a, b) => (order.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER));
}
