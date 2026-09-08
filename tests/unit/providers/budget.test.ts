import { describe, expect, it } from 'vitest';
import { consumeBudget, type BudgetStore } from '@/domain/providers/budget';

/**
 * THE SPEND CAP.
 *
 * Sarvam's credits are granted once and never renew. The app is now on a public
 * URL, and nothing stopped one visitor holding the microphone button from
 * draining the entire pilot budget in an afternoon.
 *
 * The cap counts CALLS PER DAY GLOBALLY and stores no identifier of any kind —
 * no IP, no fingerprint, no session. That is a deliberate trade, and it is the
 * right one here: a per-visitor limit would be fairer but would require
 * identifying visitors, and invariant 5 says this application does not do that.
 * Protecting the budget is not worth becoming a system that tracks people.
 *
 * The consequence is honest and worth stating: a single abuser can still spend
 * the day's allowance. What they cannot do is spend the *month's*.
 */

/** An in-memory stand-in; the real one is a single Postgres row per day. */
const storeWith = (counts: Record<string, number>): BudgetStore => ({
  async increment(day, kind) {
    const key = `${day}:${kind}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts[key];
  },
});

const DAY = new Date('2026-09-08T10:00:00Z');

describe('consumeBudget', () => {
  it('allows a call when the day is untouched', async () => {
    const result = await consumeBudget(storeWith({}), 'tts', 10, DAY);
    expect(result.ok).toBe(true);
  });

  it('allows the call that exactly reaches the limit', async () => {
    // Off-by-one here would silently cost one call a day forever, or grant one.
    const counts = { '2026-09-08:tts': 9 };
    const result = await consumeBudget(storeWith(counts), 'tts', 10, DAY);
    expect(result.ok).toBe(true);
  });

  it('refuses the call after the limit is reached', async () => {
    const counts = { '2026-09-08:tts': 10 };
    const result = await consumeBudget(storeWith(counts), 'tts', 10, DAY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.used).toBe(11);
      expect(result.limit).toBe(10);
    }
  });

  it('counts each provider separately', async () => {
    // A day of speech synthesis must not disable transcription, and vice versa.
    const counts = { '2026-09-08:tts': 50 };
    const result = await consumeBudget(storeWith(counts), 'voice', 10, DAY);
    expect(result.ok).toBe(true);
  });

  it('resets on a new day', async () => {
    const counts = { '2026-09-07:tts': 999 };
    const result = await consumeBudget(storeWith(counts), 'tts', 10, DAY);
    expect(result.ok).toBe(true);
  });

  it('uses UTC so the reset does not drift with the deployment region', async () => {
    // The functions run in Singapore and the database is in Singapore, but the
    // free tiers this protects reset on their own clocks. Pinning to UTC keeps
    // the boundary somewhere fixed rather than wherever we last deployed.
    const counts: Record<string, number> = {};
    await consumeBudget(storeWith(counts), 'tts', 10, new Date('2026-09-08T23:30:00Z'));
    expect(Object.keys(counts)).toEqual(['2026-09-08:tts']);
  });

  it('treats a limit of zero as switched off, not unlimited', async () => {
    // Misreading this inverts the whole guard, so it is pinned.
    const result = await consumeBudget(storeWith({}), 'tts', 0, DAY);
    expect(result.ok).toBe(false);
  });

  it('fails open when the counter store itself is broken', async () => {
    // A budget guard that takes the feature down when its own bookkeeping fails
    // has caused an outage to prevent a cost. Voice is additive (invariant 2)
    // and the far larger risk is a broken counter silently disabling it.
    const broken: BudgetStore = {
      async increment() {
        throw new Error('database unreachable');
      },
    };

    const result = await consumeBudget(broken, 'tts', 10, DAY);
    expect(result.ok).toBe(true);
  });
});
