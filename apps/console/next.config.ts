import type { NextConfig } from 'next';

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
