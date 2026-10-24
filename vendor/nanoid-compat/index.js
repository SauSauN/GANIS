// Remplace `nanoid` 2 pour hunspell-asm et emscripten-wasm-loader, qui
// appellent seulement `nanoid(45)`. Générateur cryptographique, taille bornée :
// les boucles infinies et débordements des failles de nanoid <= 3.3.17 sont
// impossibles ici.
"use strict";

var ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

function randomBytes(size) {
  var bytes = new Uint8Array(size);
  // WebView2 et Node 19+ fournissent tous deux `crypto.getRandomValues`.
  return globalThis.crypto.getRandomValues(bytes);
}

module.exports = function nanoid(size) {
  var length = Math.floor(Number(size));
  if (!Number.isFinite(length) || length <= 0) length = 21;
  if (length > 1024) length = 1024;
  var bytes = randomBytes(length);
  var id = "";
  for (var i = 0; i < length; i++) id += ALPHABET[bytes[i] & 63];
  return id;
};
