import { defineConfig, devices } from '@playwright/test';

/**
 * Degraded mode: a server started with every AI key blanked.
 *
 * tests/e2e/degradation.spec.ts asserts what happens with no providers
 * configured, which the normal local server cannot show — .env.local supplies
 * real keys to `next start`. It runs on its own port so it can coexist with a
 * server already holding 3000.
 *
 * CI needs none of this: no .env.local exists there, so the default server is
 * already keyless.
 */
/**
 * Running against a deployed URL rather than a local server.
 *
 * This changes how the suite must run, not just where it points. Against
 * localhost, parallel workers are free. Against one deployment they compete for
 * the same functions and the same database, so the suite measures its own
 * contention: two accessibility scans timed out at 30s in a parallel production
 * run and then passed in 10s and 8.6s when run alone. Nothing was wrong with
 * the page — the load was self-inflicted.
 *
 * That matters most for the latency spec, whose whole job is to report a number
 * a citizen would experience. A median inflated by our own test traffic is not
 * that number.
 */
const remote = Boolean(process.env.E2E_BASE_URL);

const degraded = Boolean(process.env.E2E_DEGRADED);
const port = degraded ? 3101 : 3000;

const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

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
  // One worker against a deployment, so timings are the system rather than the
  // queue behind our own requests. Slower in wall-clock, honest in result.
  timeout: remote ? 60_000 : 30_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI || remote ? 1 : undefined,
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
        command: degraded
          ? `pnpm build && pnpm start -p ${port}`
          : 'pnpm build && pnpm start',
        url: baseURL,
        // Never reuse in degraded mode: the reused server would be the one
        // holding real keys, and the suite would skip instead of running.
        reuseExistingServer: !process.env.CI && !degraded,
        timeout: 180_000,
        // @next/env does not overwrite variables already present in the
        // environment, so blanking them here wins over .env.local.
        env: degraded ? { GROQ_API_KEY: '', SARVAM_API_KEY: '' } : {},
      },
});
