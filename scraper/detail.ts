import type { Page } from '@playwright/test';
import { config } from './config';

/**
 * Stage 2: fetch one scheme's detail payload by navigating to its page and
 * intercepting the JSON the browser receives (ADR-003, ADR-009).
 */

const DETAIL_RESPONSE = 'public/schemes?slug=';

export type DetailResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: string };

export async function fetchDetail(page: Page, slug: string): Promise<DetailResult> {
  const url = `${config.origin}/schemes/${slug}`;

  try {
    // Arm the interception before navigating, or the response can arrive first.
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes(DETAIL_RESPONSE) && res.ok(),
      { timeout: config.navigationTimeoutMs },
    );

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs,
    });

    const payload: unknown = await (await responsePromise).json();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.split('\n')[0] ?? 'unknown' : 'unknown error',
    };
  }
}
