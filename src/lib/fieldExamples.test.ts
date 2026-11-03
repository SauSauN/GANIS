import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import characterFields from "@/lib/characterFields.json";
import itemCatalog from "@/lib/itemCatalog.json";
import locationCatalog from "@/lib/locationCatalog.json";
import speciesCatalog from "@/lib/speciesCatalog.json";
import enCharacters from "@/i18n/locales/en/characters.json";
import frCharacters from "@/i18n/locales/fr/characters.json";
import enLocations from "@/i18n/locales/en/locations.json";
import frLocations from "@/i18n/locales/fr/locations.json";
import enWorld from "@/i18n/locales/en/world.json";
import frWorld from "@/i18n/locales/fr/world.json";

/*
 * Règle de l'interface : chaque champ de texte montre un exemple. Ce test
 * lit le code source, pour qu'un nouveau champ ne l'oublie pas.
 */

const SRC = resolve(__dirname, "..");

/** Champs en lecture seule : il n'y a rien à y saisir. */
const READ_ONLY = /\breadOnly\b/;
const NOT_TEXT = /type=(?:"|\{")(checkbox|radio|file|color|range|hidden|date|time)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") && !path.endsWith(".test.tsx") ? [path] : [];
  });
}

/** Une balise JSX entière, à partir de `start` (les `>` des expressions ne comptent pas). */
function tagAt(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0 && source[i - 1] !== "=") return source.slice(start, i + 1);
  }
  return source.slice(start);
}

describe("exemples dans les champs de texte", () => {
  it("chaque champ de saisie a un exemple", () => {
    const missing = sourceFiles(SRC).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/<(?:Input|input|textarea)\b/g)].flatMap((match) => {
        const tag = tagAt(source, match.index);
        if (READ_ONLY.test(tag) || NOT_TEXT.test(tag) || /\bplaceholder\b/.test(tag)) return [];
        return [`${relative(SRC, file)}:${source.slice(0, match.index).split("\n").length}`];
      });
    });
    expect(missing).toEqual([]);
  });

  const TEXT_KINDS = new Set(["text", "longText", "tags", "date"]);
  const textKeys = (fields: Array<{ key: string; kind: string }>) => fields.filter((f) => TEXT_KINDS.has(f.kind)).map((f) => f.key);

  it.each([
    ["personnages", textKeys(characterFields), frCharacters.placeholders, enCharacters.placeholders],
    ["lieux", textKeys(locationCatalog.fields), frLocations.placeholders, enLocations.placeholders],
    ["objets", textKeys(itemCatalog.fields), frWorld.item.placeholders, enWorld.item.placeholders],
    ["faune et flore", textKeys(speciesCatalog.fields), frWorld.species.placeholders, enWorld.species.placeholders],
  ])("%s : chaque champ du catalogue a son exemple, dans les deux langues", (_name, keys, fr, en) => {
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !(fr as Record<string, string>)[key])).toEqual([]);
    expect(keys.filter((key) => !(en as Record<string, string>)[key])).toEqual([]);
  });
});
