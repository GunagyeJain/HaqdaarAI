import { chromium } from '@playwright/test';
import { getDb, schema } from '../src/db';
import { normalizeDetail, type NormalizationStats } from '../src/domain/corpus/normalize';
import { collectSlugs } from './collect';
import { config, sleep } from './config';
import { fetchDetail } from './detail';

/**
 * Corpus scraper. See docs/SCRAPER.md.
 *
 * Runs as a separate worker, deliberately decoupled from the request path so
 * scraping load never touches user-facing latency (proposal §7).
 *
 * FAIL LOUDLY: a scraper that quietly returns 80 schemes looks exactly like a
 * scraper that works. Every abort condition below exits non-zero.
 */

interface RunSummary {
  slugsCollected: number;
  reportedTotal: number | null;
  inserted: number;
  normalizationFailures: Array<{ slug: string; error: string }>;
  fetchFailures: Array<{ slug: string; error: string }>;
  needsReview: number;
  wildcards: Record<string, number>;
  ungroundedBounds: number;
  schemesWithNoModelledClause: number;
}

function mergeStats(summary: RunSummary, stats: NormalizationStats): void {
  for (const [reason, count] of Object.entries(stats.wildcardsByReason)) {
    summary.wildcards[reason] = (summary.wildcards[reason] ?? 0) + count;
  }
  summary.ungroundedBounds += stats.ungroundedValues.length;

  const wildcardTotal = Object.values(stats.wildcardsByReason).reduce((a, b) => a + b, 0);
  if (stats.clauseCount > 0 && wildcardTotal === stats.clauseCount) {
    summary.schemesWithNoModelledClause += 1;
  }
}

function printSummary(summary: RunSummary): void {
  const line = '─'.repeat(58);
  console.log(`\n${line}\nSCRAPE SUMMARY\n${line}`);
  console.log(`  corpus reported by myscheme : ${summary.reportedTotal ?? 'unknown'}`);
  console.log(`  slugs collected             : ${summary.slugsCollected}`);
  console.log(`  schemes inserted            : ${summary.inserted}`);
  console.log(`  flagged needs_review        : ${summary.needsReview}`);
  console.log(`  fetch failures              : ${summary.fetchFailures.length}`);
  console.log(`  normalization failures      : ${summary.normalizationFailures.length}`);
  console.log('\n  wildcards by reason:');
  for (const [reason, count] of Object.entries(summary.wildcards)) {
    console.log(`    ${reason.padEnd(14)} ${count}`);
  }
  console.log(`  ungrounded bounds discarded : ${summary.ungroundedBounds}`);
  console.log(`  schemes with no modelled clause (always UNKNOWN): ${summary.schemesWithNoModelledClause}`);

  for (const failure of [...summary.fetchFailures, ...summary.normalizationFailures].slice(0, 10)) {
    console.log(`    ! ${failure.slug}: ${failure.error.slice(0, 110)}`);
  }
  console.log(line);
}

async function main(): Promise<void> {
  const db = getDb();
  const summary: RunSummary = {
    slugsCollected: 0,
    reportedTotal: null,
    inserted: 0,
    normalizationFailures: [],
    fetchFailures: [],
    needsReview: 0,
    wildcards: {},
    ungroundedBounds: 0,
    schemesWithNoModelledClause: 0,
  };

  console.log(`Scraping ${config.origin} — target ${config.targetCount} schemes\n`);

  const browser = await chromium.launch({
    channel: config.browserChannel,
    headless: config.headless,
  });
  const page = await browser.newPage();

  try {
    console.log('Stage 1: collecting slugs from the search UI');

    // One pass per keyword, unioned by slug. The unfiltered pass gives breadth;
    // the regional passes make sure a pilot tester in Punjab actually sees
    // matches rather than failing every scheme on geography.
    const allSlugs = new Set<string>();
    let pagesVisited = 0;

    for (const keyword of config.keywords) {
      const label = keyword || '(unfiltered)';
      const pass = await collectSlugs(page, config.targetCount, keyword);
      pagesVisited += pass.pagesVisited;

      const before = allSlugs.size;
      pass.slugs.forEach((slug) => allSlugs.add(slug));
      console.log(`  ${label}: ${pass.slugs.length} slugs (+${allSlugs.size - before} new)`);

      if (summary.reportedTotal === null && !keyword) {
        summary.reportedTotal = pass.reportedTotal;
      }
      await sleep(config.delayMs);
    }

    const collected = { slugs: [...allSlugs] };
    summary.slugsCollected = collected.slugs.length;
    console.log(`  ${collected.slugs.length} unique slugs over ${pagesVisited} pages\n`);

    console.log('Stage 2: fetching and normalizing each scheme');
    let consecutiveFailures = 0;

    for (const [index, slug] of collected.slugs.entries()) {
      const detail = await fetchDetail(page, slug);

      if (!detail.ok) {
        summary.fetchFailures.push({ slug, error: detail.error });
        consecutiveFailures += 1;
        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          throw new Error(
            `${consecutiveFailures} consecutive fetch failures — the site or its payload shape has likely changed`,
          );
        }
        await sleep(config.delayMs);
        continue;
      }

      const normalized = normalizeDetail(detail.payload);
      if (!normalized.ok) {
        summary.normalizationFailures.push({ slug, error: normalized.error });
        consecutiveFailures += 1;
        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          throw new Error(
            `${consecutiveFailures} consecutive normalization failures — payload shape has likely changed`,
          );
        }
        await sleep(config.delayMs);
        continue;
      }

      consecutiveFailures = 0;
      const { scheme, stats } = normalized;

      await db
        .insert(schema.schemes)
        .values({
          slug: scheme.slug,
          name: scheme.name,
          summary: scheme.summary,
          ministry: scheme.ministry,
          state: scheme.state,
          eligibility: scheme.eligibility as unknown as { op: string },
          sourceProse: scheme.sourceProse,
          sourceUrl: scheme.sourceUrl,
          benefits: scheme.benefits,
          needsReview: scheme.needsReview,
          scrapedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.schemes.slug,
          set: {
            name: scheme.name,
            summary: scheme.summary,
            ministry: scheme.ministry,
            state: scheme.state,
            eligibility: scheme.eligibility as unknown as { op: string },
            sourceProse: scheme.sourceProse,
            sourceUrl: scheme.sourceUrl,
            benefits: scheme.benefits,
            needsReview: scheme.needsReview,
            scrapedAt: new Date(),
          },
        });

      summary.inserted += 1;
      if (scheme.needsReview) summary.needsReview += 1;
      mergeStats(summary, stats);

      process.stdout.write(
        `\r  ${index + 1}/${collected.slugs.length}  inserted ${summary.inserted}   `,
      );
      await sleep(config.delayMs);
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }

  printSummary(summary);

  if (summary.inserted < config.minSchemes) {
    throw new Error(
      `corpus floor not met: inserted ${summary.inserted}, require at least ${config.minSchemes}`,
    );
  }

  await db.$client.end({ timeout: 5 });
  console.log(`\nDone. ${summary.inserted} schemes in the corpus.`);
}

main().catch((error: unknown) => {
  console.error(`\nSCRAPE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
