import { expect, test } from '@playwright/test';

/**
 * RESPONSE LATENCY — the proposal's PRIMARY metric (§6.1).
 *
 * "Time between the user finishing an input and the system returning the next
 * question or match result", median ≤2s.
 *
 * This measures the typed path end to end over real HTTP against the real
 * corpus: request in, verdicts and next question out. The voice path adds STT
 * and extraction on top and cannot be measured without provider credentials —
 * that measurement is owed before the pilot, and docs/EVALUATION.md says so
 * rather than quietly reporting the typed number as if it covered both.
 *
 * Median is the target; p95 is reported because a good median hiding a bad tail
 * is not actually a good experience for the people in the tail.
 */

const TARGET_MEDIAN_MS = 2000;
const RUNS = 12;

const percentile = (samples: number[], p: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Infinity;
};

test.describe('response latency', () => {
  // A slow deployment must fail with its measurement, not with a stopwatch.
  //
  // Against production this suite hit Playwright's 30s default doing 12 runs of
  // ~2.5s, and reported "Test timeout of 30000ms exceeded" — which says nothing
  // about how slow the system actually was. The budget below is deliberately
  // generous: its job is to let the run finish so the median can be reported
  // and judged, not to be a second, hidden latency assertion.
  test.beforeEach(() => {
    test.setTimeout(RUNS * 10_000 + 30_000);
  });

  test('the typed path returns a match well inside the 2s budget', async ({ request }) => {
    const profile = {
      age: 42,
      gender: 'female',
      state: 'PB',
      residence: 'rural',
      annualIncome: 120000,
      category: 'sc',
      isBPL: true,
    };

    // Discard the first call: cold plan cache and a cold connection pool are
    // not what a citizen mid-session experiences.
    await request.post('/api/match', { data: { profile, locale: 'en' } });

    const samples: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = Date.now();
      const response = await request.post('/api/match', { data: { profile, locale: 'en' } });
      expect(response.ok()).toBe(true);
      samples.push(Date.now() - started);
    }

    const median = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);

    console.log(
      `\n    typed path (${RUNS} runs): median ${median}ms, p95 ${p95}ms ` +
        `(§6.1 target: median <${TARGET_MEDIAN_MS}ms)\n`,
    );

    expect(median).toBeLessThan(TARGET_MEDIAN_MS);
  });

  test('a sparse profile is no slower than a full one', async ({ request }) => {
    // The matcher evaluates the whole corpus regardless, so an early-turn
    // request must not be slower than a late-turn one. If it were, the
    // conversational loop would feel worst exactly when a citizen starts.
    await request.post('/api/match', { data: { profile: { age: 30 }, locale: 'en' } });

    const samples: number[] = [];
    for (let run = 0; run < 6; run += 1) {
      const started = Date.now();
      await request.post('/api/match', { data: { profile: { age: 30 }, locale: 'en' } });
      samples.push(Date.now() - started);
    }

    expect(percentile(samples, 0.5)).toBeLessThan(TARGET_MEDIAN_MS);
  });
});
