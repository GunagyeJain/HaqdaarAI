import { sql } from 'drizzle-orm';
import { getDb, schema } from './index';
import type { BudgetKind, BudgetStore } from '@/domain/providers/budget';

/**
 * The Postgres-backed counter behind the daily spend cap.
 *
 * One atomic upsert per call. Serverless functions run concurrently, so
 * read-then-write would lose increments under exactly the burst the cap exists
 * to stop — the whole guard has to be a single statement.
 *
 * `RETURNING calls` gives the post-increment total, which is what makes the
 * limit check exact rather than approximately right under load.
 */
export const postgresBudgetStore: BudgetStore = {
  async increment(day: string, kind: BudgetKind): Promise<number> {
    const rows = await getDb()
      .insert(schema.usageCounters)
      .values({ day, kind, calls: 1 })
      .onConflictDoUpdate({
        target: [schema.usageCounters.day, schema.usageCounters.kind],
        set: { calls: sql`${schema.usageCounters.calls} + 1` },
      })
      .returning({ calls: schema.usageCounters.calls });

    const calls = rows[0]?.calls;
    if (typeof calls !== 'number') {
      throw new Error('usage counter returned no row');
    }
    return calls;
  },
};

/**
 * Caps, as config rather than code (proposal §8).
 *
 * The defaults are sized against the measured Sarvam cost: STT is ₹30/hour of
 * audio and TTS ₹30 per 10,000 characters, so a ~10s utterance is about ₹0.08
 * and a spoken prompt about ₹0.30. At these limits a worst-case day costs a
 * little over ₹100 — the whole grant — which is the point: it bounds the damage
 * to one day rather than to everything.
 *
 * Set either to 0 to switch that provider off entirely.
 */
export const budgetLimits = (): Record<BudgetKind, number> => ({
  voice: Number.parseInt(process.env.VOICE_DAILY_LIMIT ?? '400', 10),
  tts: Number.parseInt(process.env.TTS_DAILY_LIMIT ?? '200', 10),
});
