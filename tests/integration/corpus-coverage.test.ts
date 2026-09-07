import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '@/db';
import { RuleTreeSchema } from '@/domain/rules/schema';
import type { RuleNode } from '@/domain/rules/types';

/**
 * CORPUS COVERAGE (proposal §6.2).
 *
 * Silent under-counting is the failure mode the pipeline document warns about:
 * a scraper that quietly returns 80 schemes looks exactly like one that works.
 * This gate makes the corpus a number CI can fail on.
 *
 * Skipped when the corpus is empty, so a fresh clone or a CI job that has not
 * scraped is not failed for something it was never asked to do. The scrape
 * workflow runs it after scraping, where it is a real gate.
 */

const db = getDb();
const MINIMUM_SCHEMES = 150;

const count = async (where = sql`true`): Promise<number> => {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from schemes where ${where}`,
  );
  return rows[0]?.n ?? 0;
};

const corpusSize = await count();
const seeded = corpusSize > 0;

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

describe.skipIf(!seeded)('corpus coverage', () => {
  it(`holds at least ${MINIMUM_SCHEMES} schemes`, async () => {
    console.log(`    corpus: ${corpusSize} schemes`);
    expect(corpusSize).toBeGreaterThanOrEqual(MINIMUM_SCHEMES);
  });

  it('has every rule tree passing the same schema the extractor uses', async () => {
    // Proposal §5.1: scraped data and live-extracted data conform to one
    // contract. A stored tree that fails validation means they have diverged.
    const rows = await db.select().from(schema.schemes);
    const invalid: string[] = [];

    for (const row of rows) {
      const parsed = RuleTreeSchema.safeParse(row.eligibility as unknown as RuleNode);
      if (!parsed.success) invalid.push(row.slug);
    }

    expect(invalid.slice(0, 10), `${invalid.length} scheme(s) failed validation`).toEqual([]);
  });

  it('keeps the source prose for every scheme (invariant 4)', async () => {
    const missing = await count(sql`source_prose is null or length(trim(source_prose)) = 0`);
    expect(missing, 'schemes with no auditable source prose').toBe(0);
  });

  it('keeps a source URL for every scheme', async () => {
    const missing = await count(sql`source_url is null or source_url = ''`);
    expect(missing).toBe(0);
  });

  it('reports how much of the corpus is actually modelled', async () => {
    const rows = await db.execute<{ modelled: number; total: number }>(sql`
      select
        count(*) filter (where m.n > 0)::int as modelled,
        count(*)::int as total
      from (
        select s.id, count(*) filter (where l.clause->>'op' <> 'WILDCARD')::int as n
        from schemes s
        left join lateral haqdaar_leaves(s.eligibility) as l(clause) on true
        group by s.id
      ) m
    `);

    const { modelled = 0, total = 0 } = rows[0] ?? {};
    console.log(
      `    ${modelled}/${total} schemes carry at least one modelled clause ` +
        `(${((modelled / total) * 100).toFixed(0)}%)`,
    );

    // Not a hard threshold: a scheme that is entirely WILDCARD is honest, not
    // broken — it reads UNKNOWN rather than guessing. But a sudden collapse
    // here would mean synthesis has regressed, so it is reported every run.
    expect(modelled).toBeGreaterThan(0);
  });
});

describe.skipIf(seeded)('corpus coverage', () => {
  it('is skipped on an empty database', () => {
    console.log('    corpus coverage skipped: run `pnpm scrape` to populate it');
    expect(corpusSize).toBe(0);
  });
});
