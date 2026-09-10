import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `e2e/` is Playwright's — it imports @playwright/test, which vitest
    // cannot run. Keep the two runners strictly separated.
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'e2e'],
  },
});
