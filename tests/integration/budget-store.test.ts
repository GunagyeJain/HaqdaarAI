import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { postgresBudgetStore } from '@/db/budget-store';
import { consumeBudget } from '@/domain/providers/budget';
import { getDb, schema } from '@/db';

/**
 * The counter behind the spend cap, against a real Postgres.
 *
 * The unit tests cover the decision. What they cannot cover is the part that
 * actually fails in production: serverless functions run concurrently, so a
 * read-then-write counter loses increments under exactly the burst the cap
 * exists to stop. That has to be one atomic statement, and only a real database
 * can show whether it is.
 */

const db = getDb();
const DAY = '2026-01-01';
const KIND = 'tts' as const;

const reset = () =>
  db.delete(schema.usageCounters).where(sql`day = ${DAY}::date`);

afterAll(async () => {
  await reset();
  await db.$client.end({ timeout: 5 });
});

describe('postgresBudgetStore', () => {
  it('creates the row on first use and returns 1', async () => {
    await reset();
    expect(await postgresBudgetStore.increment(DAY, KIND)).toBe(1);
  });

  it('returns the post-increment total, not the previous one', async () => {
    await reset();
    await postgresBudgetStore.increment(DAY, KIND);
    // Returning the pre-increment value would let exactly one call past the cap
    // every day, which is the kind of off-by-one nobody notices.
    expect(await postgresBudgetStore.increment(DAY, KIND)).toBe(2);
  });

  it('loses no increments when calls arrive concurrently', async () => {
    // THE ACTUAL RISK. Twenty simultaneous requests must produce twenty counts.
    // A read-then-write implementation passes every test above and fails this
    // one, which is why this test exists rather than only the sequential pair.
    await reset();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => postgresBudgetStore.increment(DAY, KIND)),
    );

    expect(Math.max(...results)).toBe(20);
    // Every caller must also see a distinct total, or two of them could both
    // believe they were the one that stayed inside the limit.
    expect(new Set(results).size).toBe(20);
  });

  it('counts kinds independently', async () => {
    await reset();
    await postgresBudgetStore.increment(DAY, 'tts');
    await postgresBudgetStore.increment(DAY, 'tts');
    expect(await postgresBudgetStore.increment(DAY, 'voice')).toBe(1);
  });

  it('refuses once the real counter passes the limit', async () => {
    await reset();
    const limit = 3;
    const now = new Date(`${DAY}T00:00:00Z`);

    const verdicts = [];
    for (let i = 0; i < 5; i += 1) {
      verdicts.push((await consumeBudget(postgresBudgetStore, KIND, limit, now)).ok);
    }

    expect(verdicts).toEqual([true, true, true, false, false]);
  });
});
