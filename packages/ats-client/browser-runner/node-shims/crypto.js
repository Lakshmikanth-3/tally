// Real substitute for Node's `crypto` module inside the browser bundle.
//
// [VERIFIED against real source: @terminal3/vc_core's randomKey.js] The
// only thing pulled from `crypto` anywhere in Tally's real dependency
// chain (@terminal3/ecdsa_vc -> @terminal3/vc_core) is
// `crypto.getRandomValues`, which is also a real, standard Web Crypto API
// — present natively as `globalThis.crypto.getRandomValues` in every real
// browser (and in the headless Chromium tab this bundle actually runs in).
// This is the same randomness source, not a weaker replacement.
module.exports = {
  getRandomValues: (typedArray) => globalThis.crypto.getRandomValues(typedArray),
};
