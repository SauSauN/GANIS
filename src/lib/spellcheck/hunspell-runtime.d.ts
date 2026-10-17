declare module "hunspell-asm/dist/esm/lib/browser/hunspell.js" {
  /** Moteur Hunspell compilé par Emscripten (MODULARIZE, binaire intégré). */
  const runtime: (module: Record<string, unknown>) => unknown;
  export default runtime;
}
