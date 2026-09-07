import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * Which Chromium build to drive.
 *
 * CI downloads Playwright's own bundled Chromium. Locally that download is blocked
 * on some networks (cdn.playwright.dev), so we default to a system-installed Chrome.
 * Override with PW_CHANNEL=msedge, or PW_CHANNEL='' to force the bundled build.
 */
const channel =
  process.env.PW_CHANNEL !== undefined
    ? process.env.PW_CHANNEL || undefined
    : process.env.CI
      ? undefined
      : 'chrome';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel } },
    // The target user is likely on a mid-range Android phone, so mobile is a
    // first-class target rather than an afterthought.
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
