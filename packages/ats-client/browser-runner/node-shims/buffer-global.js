// Injected (via esbuild's `inject` option, not `alias`) so every module in
// the bundle sees a real global `Buffer`, matching Node's ambient behavior.
// `buffer` is the real, standard browser-compatible Buffer implementation
// used across the npm ecosystem (webpack's own Buffer polyfill, in fact) —
// not a mock; same real Buffer API, just usable outside Node.
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
