import { describe, expect, it } from 'vitest';
import { extractProfile } from '@/domain/providers/extraction';
import { ProviderUnavailableError } from '@/domain/providers/resilience';
import type { LlmProvider } from '@/domain/providers/types';

/**
 * THE HALLUCINATION GATE.
 *
 * Proposal §6.2 targets 0% hallucinated fields. That is not a prompt-quality
 * aspiration here — it is a structural check applied to whatever the model
 * returns, before the value can reach an editable box, let alone the matcher.
 *
 * The asymmetry that governs this module, again: a missed field degrades to
 * UNKNOWN and prompts a question, which is safe. An invented field can silently
 * exclude an eligible citizen, which is the harm the project exists to prevent.
 */

const provider = (...responses: unknown[]): LlmProvider => {
  let call = 0;
  return {
    name: 'stub',
    extract: async () => responses[Math.min(call++, responses.length - 1)],
  };
};

describe('schema validation', () => {
  it('accepts a well-formed extraction', async () => {
    const result = await extractProfile(
      provider({ age: 42, occupation: 'farmer', state: 'UP' }),
      'I am a 42 year old farmer from Uttar Pradesh',
      'en',
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.profile).toEqual({ age: 42, occupation: 'farmer', state: 'UP' });
  });

  it('retries once when the model returns something unparseable', async () => {
    const result = await extractProfile(
      provider('not json at all', { age: 42 }),
      'I am 42',
      'en',
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.profile).toEqual({ age: 42 });
  });

  it('gives up after one retry rather than looping', async () => {
    const result = await extractProfile(provider('garbage', 'still garbage'), 'I am 42', 'en');
    expect(result.ok).toBe(false);
  });

  it('rejects a field outside the profile schema', async () => {
    // ProfileSchema is strict, so an invented field is a caught error rather
    // than a silently carried extra key.
    const result = await extractProfile(
      provider({ age: 42, casteCertificateNumber: 'X123' }, { age: 42 }),
      'I am 42',
      'en',
    );

    expect(result.ok && result.profile).toEqual({ age: 42 });
  });
});

describe('grounding — no field may be invented', () => {
  it('drops a numeric value that appears nowhere in the transcript', async () => {
    const result = await extractProfile(
      provider({ age: 42, annualIncome: 250000 }),
      'I am a 42 year old farmer',
      'en',
    );

    expect(result.ok && result.profile).toEqual({ age: 42 });
    expect(result.ok && result.dropped).toContain('annualIncome');
  });

  it('keeps a numeric value the citizen actually said, in any surface form', async () => {
    const result = await extractProfile(
      provider({ annualIncome: 250000 }),
      'my family earns about 2.5 lakh a year',
      'en',
    );

    expect(result.ok && result.profile).toEqual({ annualIncome: 250000 });
  });

  it('drops everything when the transcript mentions no profile fields at all', async () => {
    // The fixture that matters most: a model populating fields from a
    // transcript containing none of them is exhibiting exactly the failure
    // mode this project exists to prevent.
    const result = await extractProfile(
      provider({ age: 35, state: 'MH', category: 'obc' }),
      'hello, can you hear me? testing testing',
      'en',
    );

    expect(result.ok && result.profile).toEqual({});
    expect(result.ok && result.dropped.length).toBe(3);
  });

  it('reports what it dropped rather than discarding silently', async () => {
    const result = await extractProfile(
      provider({ age: 42, isBPL: true }),
      'I am 42',
      'en',
    );

    expect(result.ok && result.dropped).toEqual(['isBPL']);
  });

  it('keeps an enum the citizen named in words', async () => {
    const result = await extractProfile(
      provider({ occupation: 'farmer', gender: 'female' }),
      'I am a woman and I work as a farmer',
      'en',
    );

    expect(result.ok && result.profile).toEqual({ occupation: 'farmer', gender: 'female' });
  });

  it('keeps a state the citizen named by its full name', async () => {
    const result = await extractProfile(
      provider({ state: 'PB' }),
      'I live in Punjab',
      'en',
    );

    expect(result.ok && result.profile).toEqual({ state: 'PB' });
  });

  it('drops a state the citizen never mentioned', async () => {
    const result = await extractProfile(
      provider({ state: 'KL' }),
      'I am a 42 year old farmer',
      'en',
    );

    expect(result.ok && result.profile).toEqual({});
  });
});

describe('distinguishing a bad response from an absent provider', () => {
  it('propagates ProviderUnavailableError instead of reporting an extraction failure', async () => {
    // These are categorically different. A model returning bad JSON is worth a
    // retry and then an error. A provider that is not configured at all is a
    // *degraded mode*, and the client must be told so it can fall back to the
    // browser or the typed form rather than showing a failure the citizen can
    // do nothing about.
    const absent: LlmProvider = {
      name: 'none',
      extract: () => {
        throw new ProviderUnavailableError('llm', 'GROQ_API_KEY is not set');
      },
    };

    await expect(extractProfile(absent, 'I am 42', 'en')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('does not burn the retry on an absent provider', async () => {
    let calls = 0;
    const absent: LlmProvider = {
      name: 'none',
      extract: () => {
        calls += 1;
        throw new ProviderUnavailableError('llm', 'not configured');
      },
    };

    await expect(extractProfile(absent, 'I am 42', 'en')).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe('grounding must match words, not substrings', () => {
  // Found by the adversarial eval: two-letter state codes matched inside
  // ordinary words. "ld" is in "old", "children" and "world"; "as" is in
  // "as"; "up" is in "up". Every one of those would have grounded a state the
  // citizen never mentioned — and a wrong state clause disqualifies them from
  // every scheme in their actual state.
  it.each([
    ['I am 67 years old and retired', 'LD'],
    ['I am married with two children', 'LD'],
    ['I work as a farmer', 'AS'],
    ['I gave up my job last year', 'UP'],
    ['My brother helps me', 'BR'],
  ])('does not ground a state code hidden inside a word: %s', async (transcript, code) => {
    const result = await extractProfile(provider({ state: code }), transcript, 'en');
    expect(result.ok && result.profile).toEqual({});
  });

  it('still grounds a state the citizen actually named', async () => {
    const result = await extractProfile(
      provider({ state: 'PB' }),
      'I am from Punjab',
      'en',
    );
    expect(result.ok && result.profile).toEqual({ state: 'PB' });
  });

  it('does not ground an occupation hidden inside a longer word', async () => {
    // "job" inside "jobless" would otherwise ground `salaried` for someone who
    // just said they have no work.
    const result = await extractProfile(
      provider({ occupation: 'salaried' }),
      'I am jobless right now',
      'en',
    );
    expect(result.ok && result.profile).toEqual({});
  });

  it('still grounds Indic terms, which are matched as substrings', async () => {
    // Word boundaries are an ASCII notion; Devanagari and Gurmukhi terms are
    // long and distinctive enough that substring matching is safe.
    const result = await extractProfile(
      provider({ occupation: 'farmer' }),
      'ਮੈਂ ਪੰਜਾਬ ਦਾ ਕਿਸਾਨ ਹਾਂ',
      'pa',
    );
    expect(result.ok && result.profile).toEqual({ occupation: 'farmer' });
  });
});
