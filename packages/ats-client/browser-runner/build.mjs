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
//   - @hashgraph/hedera-custodians-integration / @terminal3/verify_vc: the
//     DFNS/Fireblocks/AWS-KMS custodial adapters and VC-verification code
//     path, eagerly instantiated by Injectable.ts regardless of which
//     wallet type is actually used. Tally only ever uses METAMASK (see
//     packages/ats-client/src/init.ts) so these are genuinely dead code —
//     but they still get bundled unless stubbed.
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
  define: {
    'process.env.NODE_ENV': '"production"',
    // The SDK's own Injectable.isWeb() checks `global.window` — `global` is
    // a Node-only binding, undefined in a real browser without this (the
    // standard esbuild fix bundlers like Webpack apply automatically).
    global: 'globalThis',
  },
  alias: {
    dotenv: join(__dirname, 'node-shims', 'dotenv.js'),
    winston: join(__dirname, 'node-shims', 'winston.js'),
    'winston-daily-rotate-file': join(__dirname, 'node-shims', 'winston-daily-rotate-file.js'),
    '@hashgraph/hedera-custodians-integration': join(__dirname, 'node-shims', 'unused-custodial-sdk.js'),
    '@terminal3/verify_vc': join(__dirname, 'node-shims', 'unused-custodial-sdk.js'),
    '@hiero-ledger/sdk': realBrowserEntry('@hiero-ledger/sdk', '2.79.0'),
    '@hashgraph/sdk': realBrowserEntry('@hashgraph/sdk', '2.64.5'),
  },
});

console.log('Built browser-runner/dist/entry.js');
