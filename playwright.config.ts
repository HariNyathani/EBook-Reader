import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // ISD-NOTE: Using `pnpm dev` for Playwright tests so env vars are available without a build.
    // Switch to `pnpm build && pnpm start` for fully production-accurate E2E runs.
    command: 'pnpm dev',
    url: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
