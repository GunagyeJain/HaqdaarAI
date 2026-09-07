import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
};

export const config = {
  origin: process.env.SCRAPE_TARGET_URL ?? 'https://www.myscheme.gov.in',

  /** How many schemes to collect per keyword pass. */
  targetCount: int('SCRAPE_TARGET_COUNT', 300),

  /**
   * Search terms driving the corpus, comma-separated. An empty term means the
   * unfiltered listing. Passes are unioned by slug, so overlap costs nothing.
   *
   * The default builds a corpus that is both broad (an unfiltered pass, which
   * demonstrates the fragmentation problem) and coherent for the pilot region
   * (Punjab and Delhi), so pilot profiles hit real matches instead of failing
   * on geography alone. See docs/SCRAPER.md.
   */
  keywords: (process.env.SCRAPE_KEYWORDS ?? ',Punjab,Delhi,Chandigarh')
    .split(',')
    .map((term) => term.trim()),

  /** The scraper exits non-zero below this. Silent under-counting is the real danger. */
  minSchemes: int('SCRAPE_MIN_SCHEMES', 150),

  /** Politeness delay between navigations. */
  delayMs: int('SCRAPE_DELAY_MS', 1200),

  /** Consecutive detail failures tolerated before aborting — signals a shape change. */
  maxConsecutiveFailures: int('SCRAPE_MAX_CONSECUTIVE_FAILURES', 8),

  navigationTimeoutMs: int('SCRAPE_NAV_TIMEOUT_MS', 45_000),

  /**
   * Playwright's own Chromium download is blocked on some networks, so a
   * system-installed browser is the default. Set PW_CHANNEL='' to use the
   * bundled build (what CI does).
   */
  browserChannel:
    process.env.PW_CHANNEL !== undefined ? process.env.PW_CHANNEL || undefined : 'chrome',

  headless: process.env.SCRAPE_HEADED !== '1',
} as const;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
