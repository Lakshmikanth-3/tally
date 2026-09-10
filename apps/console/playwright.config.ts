import { defineConfig, devices } from '@playwright/test';

/// Drives the real dev server against the real database and the real API
/// routes. `reuseExistingServer` means a server you already have running on
/// :3000 is used as-is (handy while developing); CI starts its own.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // these share one real SQLite database
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx next dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
