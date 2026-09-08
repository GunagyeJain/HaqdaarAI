import { describe, expect, it } from 'vitest';
import { extractProfile } from '@/domain/providers/extraction';
import { groqLlm } from '@/domain/providers/groq';
import type { LlmProvider } from '@/domain/providers/types';
import type { Profile, ProfileField } from '@/domain/rules/types';
import { goldenSet, type GoldenCase } from './fixtures/transcripts';

/**
 * THE 0% HALLUCINATION GATE (proposal §6.2).
 *
 * This suite runs in two modes.
 *
 * ADVERSARIAL (always): a deliberately malicious provider returns every field
 * populated, regardless of what was said. The gate must reduce that to only
 * what the transcript supports. This tests OUR defence, which is the part we
 * control and the part that must hold no matter which model is configured or
 * how it drifts.
 *
 * LIVE (only when GROQ_API_KEY is set): the real model against the same set,
 * reporting hallucination and recall. Hallucination is the blocking number;
 * recall is reported because a missed field degrades to UNKNOWN and prompts a
 * question, which is safe.
 */

/** Values chosen not to collide with figures in the golden transcripts. */
const FABRICATED: Required<Profile> = {
  age: 99,
  gender: 'transgender',
  state: 'LD',
  district: 'Fabricated District',
  residence: 'urban',
  annualIncome: 9_876_543,
  category: 'ews',
  isMinority: true,
  occupation: 'fisherman',
  education: 'postgraduate',
  maritalStatus: 'divorced',
  isDisabled: true,
  disabilityPercentage: 97,
  isBPL: true,
  landHoldingHectares: 8_888,
  familySize: 47,
};

/** A provider that ignores the transcript entirely and asserts everything. */
const adversarial: LlmProvider = {
  name: 'adversarial',
  extract: async () => ({ ...FABRICATED }),
};

const fieldsOf = (profile: Profile) => Object.keys(profile) as ProfileField[];

async function hallucinatedFields(
  provider: LlmProvider,
  testCase: GoldenCase,
): Promise<ProfileField[]> {
  const result = await extractProfile(provider, testCase.transcript, testCase.locale);
  if (!result.ok) return [];

  const supported = new Set(fieldsOf(testCase.expected));
  return fieldsOf(result.profile).filter((field) => !supported.has(field));
}

describe('adversarial: the gate holds against a provider that invents everything', () => {
  it(`covers a golden set of ${goldenSet.length} transcripts`, () => {
    // A shrinking golden set is a silently weakening gate.
    expect(goldenSet.length).toBeGreaterThanOrEqual(35);
    expect(new Set(goldenSet.map((c) => c.id)).size).toBe(goldenSet.length);
  });

  it('includes transcripts that support no fields at all', () => {
    // These are the cases that catch a model filling a form because it was
    // asked to fill a form.
    const empty = goldenSet.filter((c) => Object.keys(c.expected).length === 0);
    expect(empty.length).toBeGreaterThanOrEqual(6);
  });

  for (const testCase of goldenSet.filter((c) => !c.beyondGrounding)) {
    it(`invents nothing for ${testCase.id}`, async () => {
      const invented = await hallucinatedFields(adversarial, testCase);
      expect(invented, testCase.note ?? testCase.transcript).toEqual([]);
    });
  }

  it('reports a 0% hallucination rate across everything grounding can decide', async () => {
    let inventedTotal = 0;
    for (const testCase of goldenSet.filter((c) => !c.beyondGrounding)) {
      inventedTotal += (await hallucinatedFields(adversarial, testCase)).length;
    }

    const scope = goldenSet.filter((c) => !c.beyondGrounding).length;
    console.log(
      `    adversarial provider: ${inventedTotal} invented field(s) survived across ${scope} transcripts`,
    );
    expect(inventedTotal).toBe(0);
  });
});

/**
 * THE ONE CLASS GROUNDING CANNOT DECIDE, asserted rather than assumed.
 *
 * "my father is 70 and disabled" contains the word "disabled", so grounding
 * admits an extracted isDisabled — correctly by its own definition. Whose fact
 * it is cannot be settled by checking whether the token appears.
 *
 * These cases are excluded from the adversarial assertion above and pinned here
 * instead, so the carve-out is visible rather than a quietly narrowed gate. If
 * grounding ever does learn to catch them, this test fails and says so.
 *
 * The live model handles them: the extraction prompt is told to record only the
 * speaker's own facts (ADR-012). Invariant 3 is the barrier behind that.
 */
describe('third-party attribution is beyond grounding, by construction', () => {
  const thirdParty = goldenSet.filter((c) => c.beyondGrounding);

  it('covers the realistic ways someone asks on behalf of another person', () => {
    expect(thirdParty.length).toBeGreaterThanOrEqual(3);
  });

  it('leaks under an adversarial provider, which is why the prompt must hold', async () => {
    let leaked = 0;
    for (const testCase of thirdParty) {
      leaked += (await hallucinatedFields(adversarial, testCase)).length;
    }

    console.log(
      `    third-party cases: ${leaked} field(s) grounding cannot reject ` +
        `across ${thirdParty.length} transcripts (see ADR-012)`,
    );
    expect(leaked).toBeGreaterThan(0);
  });
});

/**
 * A KNOWN LIMITATION, recorded rather than left to be discovered.
 *
 * Grounding verifies that a value was *said*, not that it was said *about that
 * field*. If a transcript contains "60 percent disability" and the model
 * returns age 60, the figure is present and grounding admits it.
 *
 * This is why grounding is the second of three barriers rather than the only
 * one: strict JSON-schema decoding precedes it, and the citizen confirming the
 * value in an editable box follows it (invariant 3). The test exists so the
 * limitation is documented and would be noticed if it ever widened.
 */
describe('known limitation: grounding checks presence, not attribution', () => {
  it('admits a number that was said about a different field', async () => {
    const misattributing: LlmProvider = {
      name: 'misattributing',
      extract: async () => ({ age: 60 }),
    };

    const result = await extractProfile(
      misattributing,
      'I have a disability, it is 60 percent',
      'en',
    );

    // Documented, not desired. Invariant 3 is what catches this in practice.
    expect(result.ok && result.profile).toEqual({ age: 60 });
  });
});

const hasLiveKey = Boolean(process.env.GROQ_API_KEY);

describe.skipIf(!hasLiveKey)('live: the configured model against the golden set', () => {
  it('hallucinates no fields, and its recall is reported', async (context) => {
    let invented = 0;
    let recalled = 0;
    let expectedTotal = 0;
    let rateLimited = 0;
    let completed = 0;
    const failures: string[] = [];

    for (const testCase of goldenSet) {
      // Paced for the free tier. An unpaced loop reports throttling as if it
      // were a model failure, and the bounded retry gets consumed by rate
      // limiting rather than by the glitch it exists for.
      //
      // MEASURED 2026-09-08: a call costs ~3,800-4,900 tokens, not the ~1,600
      // originally assumed here. The binding constraint is therefore the
      // 200,000 tokens/DAY cap, which one full pass over this golden set very
      // nearly exhausts on its own — budget accordingly before running it.
      await new Promise((resolve) => setTimeout(resolve, 13_000));

      let result;
      try {
        result = await extractProfile(groqLlm, testCase.transcript, testCase.locale);
      } catch (error) {
        // A 429 surfaces as ProviderUnavailableError, which extractProfile
        // rethrows by design — an unavailable provider is a degraded mode, not
        // a bad extraction. Without this catch the run dies on the first
        // throttled call and reports a FAILURE, conflating "we could not
        // measure" with "the model misbehaved". Found by a real quota
        // exhaustion on 2026-09-08, not by reasoning about the code.
        const message = error instanceof Error ? error.message : String(error);
        if (/rate.?limit|429|quota/i.test(message)) {
          rateLimited += 1;
          failures.push(`${testCase.id}: rate limited`);
          continue;
        }
        throw error;
      }
      expectedTotal += fieldsOf(testCase.expected).length;
      if (!result.ok) {
        if (/rate.?limit|429/i.test(result.error)) rateLimited += 1;
        failures.push(`${testCase.id}: ${result.error.slice(0, 90)}`);
        continue;
      }

      completed += 1;
      const supported = new Set(fieldsOf(testCase.expected));
      for (const field of fieldsOf(result.profile)) {
        if (supported.has(field)) recalled += 1;
        else {
          invented += 1;
          failures.push(`${testCase.id}: invented ${field}`);
        }
      }
    }

    console.log(
      `    live model: ${invented} invented, recall ${recalled}/${expectedTotal} ` +
        `(${((recalled / expectedTotal) * 100).toFixed(0)}%)`,
    );
    if (failures.length) console.log('    ' + failures.join('\n    '));

    console.log(
      `    coverage: ${completed}/${goldenSet.length} transcripts reached the model`,
    );

    // A hallucination that WAS observed fails the run, rate limiting or not.
    // Evidence of harm is never downgraded to "inconclusive".
    expect(invented).toBe(0);

    // Absence of evidence is not evidence of absence. If the daily quota cut
    // the run short, "0 invented" describes only the transcripts that actually
    // reached the model — not the golden set. Reporting that as green is the
    // exact failure this project exists to prevent, turned on our own
    // evaluation: a confident verdict where the truth is UNKNOWN (invariant 6).
    //
    // So the run is marked INCONCLUSIVE. Deliberately not a failure — the
    // model did nothing wrong; we simply could not observe it.
    if (rateLimited > 0) {
      const unmeasured = goldenSet.length - completed;
      console.log(
        `    INCONCLUSIVE: ${rateLimited} call(s) rate-limited, ${unmeasured} transcript(s) ` +
          `never reached the model. Re-run when the Groq daily quota resets.`,
      );
      context.skip();
    }
  }, 900_000);
});

describe.skipIf(hasLiveKey)('live evaluation', () => {
  it('is skipped without GROQ_API_KEY', () => {
    console.log('    live model evaluation skipped: set GROQ_API_KEY to run it');
    expect(hasLiveKey).toBe(false);
  });
});
