import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Requires the full app stack to be running before execution:
 *   - Server:  npm run dev  (port 5000)
 *   - Client:  npm run dev  (port 3000, inside /client)
 *
 * Run with:
 *   npx playwright test --config=playwright.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: 1,
  workers: 1, // Serial execution — collaborative tests need deterministic order

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
});
