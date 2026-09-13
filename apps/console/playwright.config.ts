import { defineConfig, devices } from '@playwright/test';

/// Drives the real app against the real database and the real API routes.
///
/// By default it targets the local console on :3000 — `reuseExistingServer`
/// means a server you already have running is used as-is, otherwise one is
/// started. Set TALLY_E2E_BASE_URL (e.g. the Vercel URL) to run the same
/// suites against a deployed app instead; no local server is started then.
const remoteBaseUrl = process.env.TALLY_E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // these share one real Postgres database
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: remoteBaseUrl ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remoteBaseUrl
    ? undefined
    : {
        command: 'npx next dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
