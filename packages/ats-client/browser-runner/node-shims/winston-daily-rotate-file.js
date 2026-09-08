// Stub for the "winston-daily-rotate-file" package when bundled for the
// browser. This is an optional file-based log transport for the SDK's
// server-side LogService — there is no filesystem to rotate logs into
// inside a browser tab. Console logging (which winston still does) is
// unaffected; this only removes the file-transport code path.
export default class DailyRotateFile {
  constructor() {}
  log(_info, callback) {
    if (callback) callback();
  }
}
