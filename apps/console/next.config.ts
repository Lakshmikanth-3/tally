import path from 'node:path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

// Real secrets (HEDERA_ECDSA_PRIVATE_KEY, STRIPE_SECRET_KEY, etc.) live in one
// .env at the monorepo root, not one per app — Next.js's own env loading only
// ever looks in this app's own directory (apps/console), so without this,
// every route reading process.env silently sees nothing and fails with
// "server misconfigured: X is not set" no matter how correctly .env is filled
// in at the root. Loaded here (next.config.ts runs once at server startup,
// before any request handler) rather than relying on each dev's shell to
// `cd`/export things correctly. Doesn't override a real apps/console/.env.local
// if one exists — dotenv's default `override: false` leaves already-set
// process.env values (including ones Next.js's own .env.local loading set)
// alone.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const nextConfig: NextConfig = {
  // playwright/playwright-core drive the real headless-browser ATS signer
  // (see packages/ats-client/browser-runner) — real Node-native binaries,
  // not something webpack should try to bundle for the server runtime.
  //
  // serverExternalPackages alone doesn't reliably externalize a package
  // resolved through pnpm's nested .pnpm store (confirmed live: webpack
  // still tried to bundle playwright-core's coreBundle.js and failed on its
  // lazy, real-only-if-BiDi-is-used `require("chromium-bidi/...")`, a
  // package Tally never installs since it only drives Chromium over CDP).
  // Pushing the same names onto webpack's own `externals` is the fix that
  // actually took effect.
  serverExternalPackages: ['better-sqlite3', 'playwright', 'playwright-core'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'playwright', 'playwright-core'];
    }
    return config;
  },
};

export default nextConfig;
