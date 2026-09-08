/**
 * A daily spend cap for the paid speech providers.
 *
 * WHY THIS EXISTS
 *
 * Sarvam's credits are granted once and never renew — unlike Groq's daily token
 * bucket, which refills. Once the app went on a public URL, nothing prevented a
 * single visitor holding the microphone button from spending the entire pilot
 * budget in an afternoon, and the pilot has no way to buy more.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not identify anyone. There is no IP, no fingerprint, no session key —
 * the counter is one integer per provider per day for the whole application.
 *
 * A per-visitor limit would be fairer, and it is the obvious design. It is
 * rejected because it requires identifying visitors, and invariant 5 says this
 * application does not do that. The applicant profile is deliberately
 * unpersisted; quietly introducing a table of who called what and when, in order
 * to protect a small amount of money, would trade away the stronger property.
 *
 * The cost of that choice, stated plainly rather than hidden: one determined
 * abuser can still exhaust a single day's allowance. What they cannot do is
 * exhaust the whole grant, because tomorrow the counter starts again and the
 * cap holds again.
 *
 * WHEN THE CAP IS HIT the caller degrades exactly as it does for an unreachable
 * provider — browser speech, then the typed form. That path is invariant 2 and
 * is already covered by the degradation suite, so exceeding the budget takes a
 * route that is tested rather than a new one that is not.
 */

export type BudgetKind = 'voice' | 'tts';

export interface BudgetStore {
  /** Adds one to the counter for this day and kind, returning the new total. */
  increment(day: string, kind: BudgetKind): Promise<number>;
}

export type BudgetResult = { ok: true } | { ok: false; used: number; limit: number };

/** UTC, so the reset boundary does not move when the deployment region does. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

export async function consumeBudget(
  store: BudgetStore,
  kind: BudgetKind,
  limit: number,
  now: Date = new Date(),
): Promise<BudgetResult> {
  let used: number;

  try {
    used = await store.increment(utcDay(now), kind);
  } catch (error) {
    // FAIL OPEN. A guard that disables the feature when its own bookkeeping
    // breaks has caused an outage in order to prevent a cost. Voice is
    // additive, the sums involved are small, and a silently disabled voice
    // path is the more expensive failure.
    console.error('budget counter unavailable, allowing the call', error);
    return { ok: true };
  }

  if (used > limit) return { ok: false, used, limit };
  return { ok: true };
}
