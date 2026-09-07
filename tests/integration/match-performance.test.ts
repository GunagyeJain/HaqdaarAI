import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '@/db';
import type { RuleNode } from '@/domain/rules/types';

/**
 * Proposal §6.2: sub-100ms execution for the SQL matching function across the
 * full corpus.
 *
 * Seeds its own corpus so the measurement is the same on a developer machine
 * and on an empty CI database. Reports the median of several runs — a single
 * timing on shared CI hardware is noise, not a measurement.
 */

const db = getDb();
const SLUG_PREFIX = 'perftest-';
const CORPUS_SIZE = 300;
const TARGET_MS = 100;

const STATES = ['PB', 'HR', 'UP', 'MH', 'TN', 'KA', 'WB', 'GJ'];

/** A rule tree shaped like the ones the scraper actually produces. */
function syntheticRule(index: number): RuleNode {
  return {
    op: 'AND',
    clauses: [
      { field: 'state', op: 'in', values: [STATES[index % STATES.length] ?? 'PB'] },
      { field: 'age', op: 'between', min: 18, max: 40 + (index % 20) },
      { field: 'annualIncome', op: 'lte', value: 100000 + (index % 5) * 50000 },
      { field: 'gender', op: 'eq', value: index % 3 === 0 ? 'female' : 'male' },
      {
        op: 'OR',
        clauses: [
          { field: 'category', op: 'in', values: ['sc', 'st'] },
          { field: 'isBPL', op: 'eq', value: true },
        ],
      },
      { op: 'WILDCARD', sourceText: 'discretionary criterion', reason: 'unmodellable' },
    ],
  };
}

const profile = {
  age: 32,
  gender: 'female',
  state: 'PB',
  residence: 'rural',
  annualIncome: 140000,
  category: 'sc',
  isBPL: true,
  isDisabled: false,
};

/** Round-trip as the API tier experiences it: execution plus transport. */
async function timeRoundTrip(): Promise<number> {
  const started = performance.now();
  await db.execute(sql`select * from match_schemes(${JSON.stringify(profile)}::jsonb)`);
  return performance.now() - started;
}

/**
 * Server-side execution time, which is what proposal §6.2 actually specifies:
 * "sub-100ms execution time for the SQL matching function".
 *
 * TIMING OFF avoids per-node instrumentation overhead, so this measures the
 * query rather than the measurement.
 */
async function timeServerExecution(): Promise<number> {
  const rows = await db.execute<{ 'QUERY PLAN': string }>(
    sql`explain (analyze, timing off) select * from match_schemes(${JSON.stringify(profile)}::jsonb)`,
  );
  const text = rows.map((row) => row['QUERY PLAN']).join('\n');
  const match = text.match(/Execution Time: ([\d.]+) ms/);
  return match?.[1] ? Number.parseFloat(match[1]) : Infinity;
}

const median = (samples: number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Infinity;
};

beforeAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);

  const rows = Array.from({ length: CORPUS_SIZE }, (_, index) => ({
    slug: `${SLUG_PREFIX}${index}`,
    name: { en: `Perf scheme ${index}` },
    summary: { en: 'Synthetic scheme for the matching-speed benchmark.' },
    eligibility: syntheticRule(index) as unknown as { op: string },
    sourceProse: 'Aged 18 to 40 with income up to 250000.',
    sourceUrl: 'https://www.myscheme.gov.in/',
  }));

  // Chunked so the insert itself does not hit a parameter limit.
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(schema.schemes).values(rows.slice(i, i + 50));
  }

  await db.execute(sql`analyze schemes`);
}, 60_000);

afterAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);
  await db.$client.end({ timeout: 5 });
});

describe('matching speed', () => {
  it(`executes over the corpus in under ${TARGET_MS}ms (median)`, async () => {
    await timeRoundTrip(); // discard: plan cache and buffer warm-up

    const server: number[] = [];
    const roundTrip: number[] = [];
    for (let run = 0; run < 9; run += 1) {
      server.push(await timeServerExecution());
      roundTrip.push(await timeRoundTrip());
    }

    const serverMedian = median(server);
    const roundTripMedian = median(roundTrip);

    // Both are reported because they answer different questions. The §6.2
    // metric is server-side execution; the round-trip figure is what the API
    // tier actually waits for and feeds the ≤2s end-to-end budget (§6.1).
    console.log(
      `    match_schemes over ${CORPUS_SIZE} schemes\n` +
        `      server execution : median ${serverMedian.toFixed(1)}ms  (§6.2 target <${TARGET_MS}ms)\n` +
        `      client round-trip: median ${roundTripMedian.toFixed(1)}ms  (adds transport + deserialising ${CORPUS_SIZE} rows)`,
    );

    expect(serverMedian).toBeLessThan(TARGET_MS);
  }, 60_000);

  it('does not let the planner trigger JIT on a corpus this small', async () => {
    // The planner's row estimate for haqdaar_leaves drives the total cost. When
    // that estimate is wrong by two orders of magnitude the cost crosses
    // jit_above_cost, and JIT compilation costs more than the entire query.
    const plan = await db.execute<{ 'QUERY PLAN': string }>(
      sql`explain (analyze, format text) select * from match_schemes(${JSON.stringify(profile)}::jsonb)`,
    );
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');

    expect(text, 'query plan should not include a JIT section').not.toContain('JIT:');
  }, 60_000);
});
