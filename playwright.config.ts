import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Phase 16 (ISD §16.H, §16.BB, §16.DD #1, §16.Y).
 *
 * - Test directory: tests/e2e.
 * - Projects: chromium (desktop) + a mobile project (Pixel 5 viewport)
 *   for the critical journeys (auth, library, reader, offline,
 *   admin, preferences).
 * - Web server: starts `pnpm dev` for env-var access during tests.
 *   For fully production-accurate runs, set WEB_SERVER=build to use
 *   `pnpm build && pnpm start` instead.
 * - Retries: 2 in CI, 0 locally.
 * - Trace: on first retry, so we get traces for intermittent failures.
 */
const WEB_SERVER = process.env['WEB_SERVER'] ?? 'dev';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: WEB_SERVER === 'build' ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
