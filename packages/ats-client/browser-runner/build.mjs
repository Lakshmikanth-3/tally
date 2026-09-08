// Bundles browser-runner/entry.ts for a real browser tab (see runner.ts for
// why: the ATS SDK's write path requires real browser globals, so we drive
// it inside a real headless Chromium tab with our own EIP-1193 wallet).
//
// The aliases below are all real, verified fixes for genuine resolution
// problems in the SDK's own dependency tree, not workarounds for anything
// Tally does:
//   - dotenv / winston / winston-daily-rotate-file: server-only logging and
//     .env loading the SDK's index.ts pulls in unconditionally at import
//     time; meaningless inside a browser tab.
//   - @hashgraph/hedera-custodians-integration: the DFNS/Fireblocks/AWS-KMS
//     custodial adapters, eagerly instantiated by Injectable.ts regardless
//     of which wallet type is actually used. Tally only ever uses METAMASK
//     (see packages/ats-client/src/init.ts) so this is genuinely dead code
//     — but it still gets bundled unless stubbed.
//   - @terminal3/verify_vc: real and used (kyc.ts's grantInternalKyc goes
//     through the SDK's real Kyc.grantKyc, which verifies the credential
//     with it) but the real package eagerly requires @terminal3/bbs_vc,
//     whose BBS+ implementation goes through a native Node addon
//     (@mattrglobal/node-bbs-signatures) with no browser build. Tally only
//     ever issues/verifies EcdsaSecp256k1Signature2019 credentials, so this
//     aliases to a real re-implementation of the same verifyVc export that
//     delegates the ECDSA branch to the real @terminal3/ecdsa_vc and only
//     drops the BBS+ branch Tally never exercises (see node-shims/
//     terminal3-verify-vc-ecdsa-only.js for the full justification).
//   - crypto / Buffer: the KYC verifiable-credential chain
//     (@terminal3/vc_core) uses Node's `crypto.getRandomValues` and the
//     ambient `Buffer` global — both real Web APIs with a real browser
//     equivalent (globalThis.crypto.getRandomValues) or a real, standard
//     polyfill (the `buffer` package), not a Node-only capability with no
//     browser analog. See node-shims/crypto.js and buffer-global.js.
//   - @hiero-ledger/sdk / @hashgraph/sdk: both packages ship a real,
//     dedicated browser build (`lib/browser.js`) via their package.json's
//     "browser" field, but esbuild doesn't apply that remap when a
//     package's "exports" field is also present and lacks a "browser"
//     condition (a known esbuild/package.json interaction gap) — so we
//     alias straight to the real file on disk instead of the blocked
//     "exports"-guarded subpath.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// pnpm's isolated node_modules means @hiero-ledger/sdk and @hashgraph/sdk
// aren't reachable via a plain `require.resolve` from this package's own
// context (they're nested inside @hashgraph/asset-tokenization-sdk's
// dependency tree) — find the real installed copy directly in the pnpm
// store instead of hardcoding an exact version-hash directory name that
// will drift on every dependency update.
function findPnpmPackageDir(scopedName, versionPrefix) {
  const pnpmDir = join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
  const encoded = scopedName.replace('/', '+');
  const match = readdirSync(pnpmDir).find((entry) => entry.startsWith(`${encoded}@${versionPrefix}`));
  if (!match) throw new Error(`could not find an installed ${scopedName}@${versionPrefix}* in ${pnpmDir}`);
  return join(pnpmDir, match, 'node_modules', scopedName);
}

function realBrowserEntry(scopedName, versionPrefix) {
  const path = join(findPnpmPackageDir(scopedName, versionPrefix), 'lib', 'browser.js');
  if (!existsSync(path)) throw new Error(`expected a real browser.js at ${path}`);
  return path;
}

await build({
  entryPoints: [join(__dirname, 'entry.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: join(__dirname, 'dist', 'entry.js'),
  // Real Buffer polyfill (see node-shims/buffer-global.js) — the KYC
  // verifiable-credential chain (@terminal3/vc_core) uses the ambient
  // Node `Buffer` global, absent in a real browser.
  inject: [join(__dirname, 'node-shims', 'buffer-global.js')],
  define: {
    'process.env.NODE_ENV': '"production"',
    // The SDK's own Injectable.isWeb() checks `global.window` — `global` is
    // a Node-only binding, undefined in a real browser without this (the
    // standard esbuild fix bundlers like Webpack apply automatically).
    global: 'globalThis',
  },
  alias: {
    crypto: join(__dirname, 'node-shims', 'crypto.js'),
    dotenv: join(__dirname, 'node-shims', 'dotenv.js'),
    winston: join(__dirname, 'node-shims', 'winston.js'),
    'winston-daily-rotate-file': join(__dirname, 'node-shims', 'winston-daily-rotate-file.js'),
    '@hashgraph/hedera-custodians-integration': join(__dirname, 'node-shims', 'unused-custodial-sdk.js'),
    '@terminal3/verify_vc': join(__dirname, 'node-shims', 'terminal3-verify-vc-ecdsa-only.js'),
    '@hiero-ledger/sdk': realBrowserEntry('@hiero-ledger/sdk', '2.79.0'),
    '@hashgraph/sdk': realBrowserEntry('@hashgraph/sdk', '2.64.5'),
  },
});

console.log('Built browser-runner/dist/entry.js');
