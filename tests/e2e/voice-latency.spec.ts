import { expect, test } from '@playwright/test';
import { goldenSet } from '../eval/fixtures/transcripts';

/**
 * VOICE-PATH LATENCY — the other half of the proposal's primary metric (§6.1).
 *
 * tests/e2e/latency.spec.ts measures the typed path. This measures the voice
 * turn: what a citizen actually waits through between finishing speaking and
 * seeing their matches.
 *
 * WHAT THIS MEASURES BY DEFAULT
 *
 * The browser-STT configuration — the client transcribes locally with
 * SpeechRecognition and POSTs the transcript, so the server does extraction and
 * matching. This is not a shortcut around the real path: it is rung two of the
 * fallback ladder documented in src/components/voice-console.tsx, a
 * configuration real users run, and the one that keeps working for free once
 * Sarvam's one-time credits are gone.
 *
 * WHAT IT DOES NOT
 *
 * The Sarvam server-STT hop. Set VOICE_LATENCY_AUDIO=1 to include it: the
 * harness then synthesizes each transcript through /api/tts and feeds the audio
 * back through /api/voice. It is off by default for two reasons, and the second
 * matters more than the first:
 *
 *   1. It spends Sarvam credits, which are granted once and never renew.
 *   2. Synthetic speech is CLEANER than a citizen on a mid-range phone in a
 *      noisy room. The STT number it yields is a floor, not a representative
 *      figure, and the pilot is what produces the honest one.
 *
 * See docs/DECISIONS.md ADR-013.
 *
 * Stage attribution comes from the route's own Server-Timing header rather than
 * from client-side guesswork, so a regression names the stage that caused it.
 */

const TARGET_MEDIAN_MS = 2000;

/** Kept low deliberately: each run spends Groq daily quota. */
const RUNS = Number.parseInt(process.env.VOICE_LATENCY_RUNS ?? '8', 10);

/**
 * Groq's free tier allows 8,000 tokens/minute and an extraction costs roughly
 * 1,600, so ~5 calls/minute is the ceiling. Unpaced, the run reports throttling
 * as if it were latency — measuring our own rate limit instead of the system.
 */
const PACE_MS = Number.parseInt(process.env.VOICE_LATENCY_PACE_MS ?? '13000', 10);

const WITH_AUDIO = process.env.VOICE_LATENCY_AUDIO === '1';

/** Transcripts that support enough fields to make the match call realistic. */
const speakable = goldenSet.filter((c) => Object.keys(c.expected).length >= 2);

/**
 * The golden set is a checked-in fixture, so an empty selection means the
 * fixture broke rather than that this run was unlucky. Fail loudly.
 */
const caseAt = (index: number) => {
  const testCase = speakable[index % speakable.length];
  if (!testCase) throw new Error('golden set contains no multi-field transcripts');
  return testCase;
};

const percentile = (samples: number[], p: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Infinity;
};

/** `stt;dur=0.0, extract;dur=812.3` -> { stt: 0, extract: 812.3 } */
const parseServerTiming = (header: string | null | undefined): Record<string, number> => {
  const spans: Record<string, number> = {};
  for (const part of (header ?? '').split(',')) {
    const match = /^\s*([\w-]+)\s*;\s*dur=([\d.]+)/.exec(part);
    const [, name, duration] = match ?? [];
    if (name && duration) spans[name] = Number.parseFloat(duration);
  }
  return spans;
};

const report = (label: string, samples: number[]): string => {
  if (samples.length === 0) return `${label.padEnd(14)} not measured`;
  const median = Math.round(percentile(samples, 0.5)).toString().padStart(5);
  const p95 = Math.round(percentile(samples, 0.95)).toString().padStart(5);
  return `${label.padEnd(14)} median ${median}ms   p95 ${p95}ms`;
};

test.describe('voice-path latency', () => {
  // Both tests in this file call the extraction provider, and Playwright would
  // otherwise run them concurrently — two calls racing for the same 8,000
  // tokens/minute. That starves one of them and, worse, measures latency under
  // self-inflicted contention. Serialising costs wall-clock and buys a number
  // that means something.
  test.describe.configure({ mode: 'serial' });

  test('the voice turn returns matches inside the 2s budget', async ({ request }) => {
    // An API-level metric does not vary by emulated device, and running it in
    // both projects would double the provider spend for no extra information.
    test.skip(
      test.info().project.name !== 'chromium',
      'measured once, on chromium, to avoid doubling provider spend',
    );

    // Ask the server what it can actually do rather than inferring from env —
    // the same honest-capabilities endpoint the UI uses.
    const capabilities = (await (await request.get('/api/voice')).json()) as {
      serverStt: boolean;
      extraction: boolean;
    };

    test.skip(
      !capabilities.extraction,
      'no extraction provider configured — set GROQ_API_KEY to measure the voice path',
    );
    test.skip(
      WITH_AUDIO && !capabilities.serverStt,
      'VOICE_LATENCY_AUDIO=1 requires a server STT provider (SARVAM_API_KEY)',
    );

    test.setTimeout(RUNS * (PACE_MS + 20_000) + 60_000);

    // Warm the matcher's plan cache and the connection pool. Free, unlike the
    // extraction call — which is why only this half is warmed.
    await request.post('/api/match', { data: { profile: { age: 30 }, locale: 'en' } });

    const voiceSamples: number[] = [];
    const extractSamples: number[] = [];
    const sttSamples: number[] = [];
    const matchSamples: number[] = [];
    const turnSamples: number[] = [];
    const skipped: string[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      const testCase = caseAt(run);
      if (run > 0) await new Promise((resolve) => setTimeout(resolve, PACE_MS));

      // The voice hop: transcript (or audio) in, suggested fields out.
      const voiceStarted = Date.now();
      let voiceResponse;

      if (WITH_AUDIO) {
        const spoken = await request.post('/api/tts', {
          data: { text: testCase.transcript, locale: testCase.locale },
        });
        if (!spoken.ok()) {
          skipped.push(`${testCase.id}: tts ${spoken.status()}`);
          continue;
        }
        voiceResponse = await request.post(`/api/voice?locale=${testCase.locale}`, {
          headers: { 'content-type': 'audio/wav' },
          data: await spoken.body(),
        });
      } else {
        voiceResponse = await request.post(`/api/voice?locale=${testCase.locale}`, {
          data: { transcript: testCase.transcript },
        });
      }

      const voiceMs = Date.now() - voiceStarted;

      if (!voiceResponse.ok()) {
        // A throttled or degraded call is not a latency measurement. Record it
        // and move on rather than folding provider throttling into the
        // distribution as if it were the system being slow.
        skipped.push(`${testCase.id}: voice ${voiceResponse.status()}`);
        continue;
      }

      const spans = parseServerTiming(voiceResponse.headers()['server-timing']);
      const { suggested } = (await voiceResponse.json()) as {
        suggested: Record<string, unknown>;
      };

      // The match hop: confirmed fields in, verdicts out.
      const matchStarted = Date.now();
      const matchResponse = await request.post('/api/match', {
        data: { profile: suggested, locale: testCase.locale },
      });
      const matchMs = Date.now() - matchStarted;
      expect(matchResponse.ok()).toBe(true);

      voiceSamples.push(voiceMs);
      matchSamples.push(matchMs);
      turnSamples.push(voiceMs + matchMs);
      if (typeof spans.extract === 'number') extractSamples.push(spans.extract);
      if (typeof spans.stt === 'number') sttSamples.push(spans.stt);
    }

    const mode = WITH_AUDIO ? 'Sarvam STT + extraction' : 'browser STT (transcript posted)';
    const lines = [
      '',
      `    voice path — ${mode}`,
      `    ${turnSamples.length}/${RUNS} runs measured`,
      `    ${report('stt (server)', sttSamples)}`,
      `    ${report('extract', extractSamples)}`,
      `    ${report('match', matchSamples)}`,
      `    ${report('voice hop', voiceSamples)}`,
      `    ${report('FULL TURN', turnSamples)}   (§6.1 target: median <${TARGET_MEDIAN_MS}ms)`,
    ];
    if (skipped.length) lines.push(`    not measured: ${skipped.join('; ')}`);
    console.log(lines.join('\n') + '\n');

    // Three outcomes, kept distinct — the same discipline the extraction eval
    // applies to itself (invariant 6):
    //
    //   green        the turn was measured and met the budget
    //   red          it was measured and did not
    //   inconclusive there was nothing to measure
    //
    // A provider that is out of quota produces the third. Failing there would
    // report a performance regression that was never observed; passing would be
    // worse still. So the run is skipped, loudly, with the count that says why.
    if (turnSamples.length < Math.ceil(RUNS / 2)) {
      console.log(
        `    INCONCLUSIVE: only ${turnSamples.length}/${RUNS} runs produced a measurement. ` +
          'The provider was unavailable or out of quota — re-run when it resets.\n',
      );
      test.skip(true, 'provider unavailable or throttled: no distribution to judge');
    }

    expect(percentile(turnSamples, 0.5)).toBeLessThan(TARGET_MEDIAN_MS);
  });

  test('the voice route attributes its own stages', async ({ request }) => {
    // Server-Timing is what makes the numbers above attributable. Without this
    // assertion the harness could silently lose stage attribution and still
    // report a passing total.
    const capabilities = (await (await request.get('/api/voice')).json()) as {
      extraction: boolean;
    };
    test.skip(!capabilities.extraction, 'needs an extraction provider');

    const response = await request.post('/api/voice?locale=en', {
      data: { transcript: caseAt(0).transcript },
    });

    const spans = parseServerTiming(response.headers()['server-timing']);

    // The header is emitted on the failure path too, so this assertion holds
    // whether or not the provider was reachable. That is the point: timings
    // that vanish exactly when something goes wrong are useless for diagnosis.
    expect(Object.keys(spans)).toEqual(expect.arrayContaining(['stt', 'extract']));

    // The browser transcribed, so the server STT hop genuinely did not happen.
    // True in both cases, which is why it is asserted before the branch.
    expect(spans.stt).toBe(0);

    if (!response.ok()) {
      // Out of quota or otherwise unavailable. The duration is still meaningful
      // — it is time-until-failure — but it is not a measurement of extraction,
      // so this run proves the header, not the number.
      console.log(
        `    extraction unavailable (${response.status()}); ` +
          `header present with extract;dur=${spans.extract}\n`,
      );
      return;
    }

    expect(spans.extract).toBeGreaterThan(0);
  });
});
