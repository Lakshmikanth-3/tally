// Stub for the "dotenv" package when bundled for the browser. The ATS SDK's
// own index.ts calls `config()` unconditionally at import time to load a
// server-side .env file — meaningless (and unresolvable, since dotenv pulls
// in Node's fs/path/os/crypto) inside a real browser tab. Real env values
// (network URLs, contract addresses) are supplied explicitly by
// packages/ats-client/src/init.ts, not read from an .env file at runtime.
export function config() {
  return { parsed: {} };
}
export default { config };
