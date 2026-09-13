import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Lets lib/db.test.ts reach the real database locally; in CI without a
// .env.local those tests skip rather than run against anything fake.
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  test: {
    // `e2e/` is Playwright's — it imports @playwright/test, which vitest
    // cannot run. Keep the two runners strictly separated.
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
});
