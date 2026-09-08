// Stub for "winston" when bundled for the browser. winston's package.json
// declares a "browser" field, but the file it points to still pulls in
// Node's os/util internally (a known gap in its own browser build), so
// esbuild can't bundle it for a real browser tab. The ATS SDK's LogService
// only uses createLogger/transports.Console/format.printf — this preserves
// console output (still useful for debugging inside the headless page)
// without any of winston's Node-only internals.
export function createLogger() {
  return {
    log(level, message, meta) {
      try {
        console.log(`[${level}]`, message, meta);
      } catch {
        // ignore
      }
    },
  };
}
export const transports = {
  Console: class Console {},
};
export const format = {
  printf: (fn) => fn,
};
export default { createLogger, transports, format };
