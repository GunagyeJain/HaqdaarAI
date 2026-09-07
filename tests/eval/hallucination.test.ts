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

  for (const testCase of goldenSet) {
    it(`invents nothing for ${testCase.id}`, async () => {
      const invented = await hallucinatedFields(adversarial, testCase);
      expect(invented, testCase.note ?? testCase.transcript).toEqual([]);
    });
  }

  it('reports a 0% hallucination rate across the whole set', async () => {
    let inventedTotal = 0;
    for (const testCase of goldenSet) {
      inventedTotal += (await hallucinatedFields(adversarial, testCase)).length;
    }

    console.log(
      `    adversarial provider: ${inventedTotal} invented field(s) survived across ${goldenSet.length} transcripts`,
    );
    expect(inventedTotal).toBe(0);
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
  it('hallucinates no fields, and its recall is reported', async () => {
    let invented = 0;
    let recalled = 0;
    let expectedTotal = 0;
    const failures: string[] = [];

    for (const testCase of goldenSet) {
      // Paced to the free tier's 8000 tokens/minute. Each call costs roughly
      // 1600 tokens, so ~5 per minute is the ceiling; an unpaced loop reports a
      // rate limit as if it were a model failure, and the bounded retry gets
      // consumed by throttling rather than by the glitch it exists for.
      await new Promise((resolve) => setTimeout(resolve, 13_000));

      const result = await extractProfile(groqLlm, testCase.transcript, testCase.locale);
      expectedTotal += fieldsOf(testCase.expected).length;
      if (!result.ok) {
        failures.push(`${testCase.id}: ${result.error.slice(0, 90)}`);
        continue;
      }

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

    // Hallucination blocks; recall is reported because a missed field is safe.
    expect(invented).toBe(0);
  }, 900_000);
});

describe.skipIf(hasLiveKey)('live evaluation', () => {
  it('is skipped without GROQ_API_KEY', () => {
    console.log('    live model evaluation skipped: set GROQ_API_KEY to run it');
    expect(hasLiveKey).toBe(false);
  });
});
