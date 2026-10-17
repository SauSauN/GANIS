// Version navigateur du moteur (le WebAssembly est intégré au fichier).
import runtime from "hunspell-asm/dist/esm/lib/browser/hunspell.js";

/*
 * Hunspell en WebAssembly, chargé directement : les petites fonctions
 * d'amorçage du paquet `hunspell-asm` importent leurs dépendances d'une
 * façon que l'empaquetage ne sait pas lire, elles sont donc refaites ici.
 */

export interface Hunspell {
  spell: (word: string) => boolean;
  suggest: (word: string) => string[];
}

export interface HunspellEngine {
  /** Place un fichier dans le système de fichiers en mémoire ; renvoie son chemin. */
  mount: (contents: Uint8Array, name: string) => string;
  create: (affPath: string, dicPath: string) => Hunspell;
}

interface AsmModule {
  cwrap: (name: string, returns: string | null, args: string[]) => (...args: number[]) => number;
  FS: { mkdir: (path: string) => void; writeFile: (path: string, data: Uint8Array, options: { encoding: string }) => void };
  _free: (ptr: number) => void;
  _malloc: (size: number) => number;
  allocateUTF8: (text: string) => number;
  getValue: (ptr: number, type: string) => number;
  UTF8ToString: (ptr: number) => string;
}

// Le module d'Emscripten a une méthode `then` : on l'enveloppe pour qu'une
// promesse ne le prenne pas pour une autre promesse (attente sans fin).
function start(timeout: number): Promise<{ asm: AsmModule }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Hunspell: délai dépassé")), timeout);
    const module: Record<string, unknown> = {
      // Emscripten complète cet objet : c'est lui, le module prêt.
      onRuntimeInitialized: () => {
        clearTimeout(timer);
        resolve({ asm: module as unknown as AsmModule });
      },
      onAbort: (reason: unknown) => {
        clearTimeout(timer);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    };
    runtime(module);
  });
}

export async function loadHunspell(timeout = 30_000): Promise<HunspellEngine> {
  const { asm } = await start(timeout);
  const { cwrap, FS, _free, _malloc, allocateUTF8, getValue, UTF8ToString } = asm;
  const api = {
    create: cwrap("Hunspell_create", "number", ["number", "number"]),
    spell: cwrap("Hunspell_spell", "number", ["number", "number"]),
    suggest: cwrap("Hunspell_suggest", "number", ["number", "number", "number"]),
    freeList: cwrap("Hunspell_free_list", null, ["number", "number", "number"]),
  };
  const root = "/dictionaries";
  FS.mkdir(root);

  const withText = <T>(text: string, fn: (ptr: number) => T): T => {
    const ptr = allocateUTF8(text.normalize());
    try {
      return fn(ptr);
    } finally {
      _free(ptr);
    }
  };

  return {
    mount: (contents, name) => {
      const path = `${root}/${name}`;
      FS.writeFile(path, contents, { encoding: "binary" });
      return path;
    },
    create: (affPath, dicPath) => {
      const handle = api.create(allocateUTF8(affPath), allocateUTF8(dicPath));
      return {
        spell: (word) => withText(word, (ptr) => api.spell(handle, ptr)) !== 0,
        suggest: (word) => {
          const listPtr = _malloc(4);
          const count = withText(word, (ptr) => api.suggest(handle, listPtr, ptr));
          const values = getValue(listPtr, "*");
          const result = Array.from({ length: Math.max(0, count) }, (_, i) => UTF8ToString(getValue(values + i * 4, "*")));
          api.freeList(handle, listPtr, count);
          _free(listPtr);
          return result;
        },
      };
    },
  };
}
