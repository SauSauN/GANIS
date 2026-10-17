/// <reference lib="webworker" />
import { loadHunspell } from "@/lib/spellcheck/hunspell";

/*
 * Correcteur orthographique (Hunspell compilé en WebAssembly), hors du fil
 * de l'interface. Un dictionnaire par langue, chargé à la première demande.
 */

type Request =
  | { id: number; type: "check"; lang: string; aff: string; dic: string; words: string[] }
  | { id: number; type: "suggest"; lang: string; aff: string; dic: string; word: string };

interface Speller {
  spell: (word: string) => boolean;
  suggest: (word: string) => string[];
}

let factory: Awaited<ReturnType<typeof loadHunspell>> | null = null;
const spellers = new Map<string, Promise<Speller>>();

async function speller(lang: string, affUrl: string, dicUrl: string): Promise<Speller> {
  let pending = spellers.get(lang);
  if (!pending) {
    pending = (async () => {
      factory ??= await loadHunspell();
      const [aff, dic] = await Promise.all([affUrl, dicUrl].map(async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer())));
      const affPath = factory.mount(aff, `${lang}.aff`);
      const dicPath = factory.mount(dic, `${lang}.dic`);
      return factory.create(affPath, dicPath);
    })();
    spellers.set(lang, pending);
  }
  return pending;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const s = await speller(request.lang, request.aff, request.dic);
    if (request.type === "check") {
      const wrong = request.words.filter((word) => !s.spell(word));
      self.postMessage({ id: request.id, wrong });
    } else {
      self.postMessage({ id: request.id, suggestions: s.suggest(request.word).slice(0, 6) });
    }
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error) });
  }
};
