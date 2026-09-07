import type { Page } from '@playwright/test';
import { config, sleep } from './config';

/**
 * Stage 1: collect scheme slugs by paginating the real search UI.
 *
 * We never call the API ourselves (ADR-009). We navigate the site and read the
 * JSON the browser receives on its own behalf.
 */

const SEARCH_RESPONSE = '/search/v6/schemes';

interface SearchPayload {
  data?: {
    hits?: {
      items?: Array<{ fields?: { slug?: unknown } }>;
      page?: { total?: unknown; totalPages?: unknown };
    };
  };
}

function slugsFrom(payload: SearchPayload): string[] {
  const items = payload.data?.hits?.items ?? [];
  return items
    .map((item) => item.fields?.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
}

export interface CollectResult {
  slugs: string[];
  reportedTotal: number | null;
  pagesVisited: number;
}

/**
 * @param keyword Optional search term, typed into the site's own search box.
 *   The facet panel is not practically drivable, but keyword search is a
 *   visible control and is enough to build a coherent corpus — see
 *   docs/SCRAPER.md on corpus scope.
 */
export async function collectSlugs(
  page: Page,
  target: number,
  keyword = '',
): Promise<CollectResult> {
  const slugs = new Set<string>();
  let reportedTotal: number | null = null;
  let pagesVisited = 0;

  const firstResponse = page.waitForResponse(
    (res) => res.url().includes(SEARCH_RESPONSE) && res.ok(),
    { timeout: config.navigationTimeoutMs },
  );

  await page.goto(`${config.origin}/search`, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs,
  });

  let payload = (await (await firstResponse).json()) as SearchPayload;
  pagesVisited += 1;

  if (keyword) {
    const searched = page.waitForResponse(
      (res) =>
        res.url().includes(SEARCH_RESPONSE) &&
        res.url().includes(`keyword=${encodeURIComponent(keyword)}`) &&
        res.ok(),
      { timeout: config.navigationTimeoutMs },
    );

    const box = page.getByPlaceholder('Search').first();
    await box.fill(keyword);
    await box.press('Enter');

    payload = (await (await searched).json()) as SearchPayload;
    pagesVisited += 1;
  }

  const total = payload.data?.hits?.page?.total;
  if (typeof total === 'number') reportedTotal = total;

  const firstBatch = slugsFrom(payload);
  if (firstBatch.length === 0) {
    if (keyword) {
      // A keyword with no matches is a legitimate empty result, not a failure.
      console.warn(`  keyword "${keyword}" matched no schemes`);
      return { slugs: [], reportedTotal, pagesVisited };
    }
    // An unfiltered search that yields nothing is a shape change, not an empty corpus.
    throw new Error('search returned zero schemes on the first page — payload shape may have changed');
  }
  firstBatch.forEach((slug) => slugs.add(slug));

  // Paginate by clicking the numbered control, exactly as a visitor would.
  let nextPage = 2;
  while (slugs.size < target) {
    const control = page.locator('li', { hasText: new RegExp(`^${nextPage}$`) }).first();
    if ((await control.count()) === 0) {
      console.warn(`  pagination control for page ${nextPage} not found — stopping at ${slugs.size} slugs`);
      break;
    }

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes(SEARCH_RESPONSE) && res.ok(),
      { timeout: config.navigationTimeoutMs },
    );

    await control.click();
    payload = (await (await responsePromise).json()) as SearchPayload;
    pagesVisited += 1;

    const batch = slugsFrom(payload);
    if (batch.length === 0) {
      console.warn(`  page ${nextPage} returned no schemes — stopping`);
      break;
    }

    const before = slugs.size;
    batch.forEach((slug) => slugs.add(slug));
    if (slugs.size === before) {
      // The same page served twice means the click did not advance.
      console.warn(`  page ${nextPage} produced no new slugs — stopping`);
      break;
    }

    process.stdout.write(`\r  collected ${slugs.size} slugs (page ${nextPage})   `);
    nextPage += 1;
    await sleep(config.delayMs);
  }

  process.stdout.write('\n');
  return { slugs: [...slugs].slice(0, target), reportedTotal, pagesVisited };
}
