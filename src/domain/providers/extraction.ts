import type { Locale } from '@/i18n/routing';
import { extractNumbers } from '../corpus/numerals';
import { ProfileSchema } from '../rules/schema';
import { FIELD_KINDS, type Profile, type ProfileField } from '../rules/types';
import { BOOLEAN_TERMS, ENUM_TERMS, STATE_TERMS } from './grounding-terms';
import { ProviderUnavailableError } from './resilience';
import type { LlmProvider } from './types';

/**
 * THE HALLUCINATION GATE (proposal §6.2, target 0%).
 *
 * The LLM's output is untrusted. Before any value can reach an editable box —
 * let alone the matcher — it must survive two independent checks:
 *
 *   1. ProfileSchema, which is strict, so an invented *field* is a parse error.
 *   2. Grounding, which requires evidence for the *value* in the transcript.
 *
 * Grounding is the one that matters. A model asked to fill a form will fill it;
 * asked about a transcript containing no profile information at all, it may
 * still return plausible-looking values. Every such value is discarded here.
 *
 * The asymmetry once more: dropping a correct field costs an UNKNOWN and a
 * follow-up question. Admitting an invented one can silently exclude an
 * eligible citizen. So this errs toward dropping.
 *
 * Note this is the *second* barrier, not the only one. Invariant 3 means
 * whatever survives is still rendered as a suggestion the citizen confirms.
 */

export type ExtractionResult =
  | { ok: true; profile: Profile; dropped: ProfileField[] }
  | { ok: false; error: string };

const normalize = (text: string) => text.toLowerCase();

/** Does the transcript contain evidence for this field having this value? */
function isGrounded(field: ProfileField, value: unknown, transcript: string): boolean {
  const haystack = normalize(transcript);

  switch (FIELD_KINDS[field]) {
    case 'number':
      // The figure must actually have been said, in some recognised surface
      // form — "2.5 lakh" grounds 250000.
      return typeof value === 'number' && extractNumbers(transcript).includes(value);

    case 'boolean': {
      // Silence is never a "yes". A false value needs the same evidence: it is
      // still an assertion about the citizen.
      const terms = BOOLEAN_TERMS[field] ?? [];
      return terms.some((term) => haystack.includes(normalize(term)));
    }

    case 'enum': {
      if (typeof value !== 'string') return false;
      const terms =
        field === 'state' ? STATE_TERMS[value] : ENUM_TERMS[field]?.[value];
      return (terms ?? []).some((term) => haystack.includes(normalize(term)));
    }

    case 'string':
      // Free text must appear verbatim; there is nothing else to check it against.
      return typeof value === 'string' && haystack.includes(normalize(value));
  }
}

/** Keeps only the fields the transcript supports, reporting what it removed. */
function ground(
  profile: Profile,
  transcript: string,
): { profile: Profile; dropped: ProfileField[] } {
  const kept: Profile = {};
  const dropped: ProfileField[] = [];

  for (const [key, value] of Object.entries(profile)) {
    const field = key as ProfileField;
    if (value === undefined) continue;

    if (isGrounded(field, value, transcript)) {
      Reflect.set(kept, field, value);
    } else {
      dropped.push(field);
    }
  }

  return { profile: kept, dropped };
}

/**
 * Runs extraction, validates it, grounds it, and reports what it discarded.
 *
 * One bounded retry: models occasionally emit prose around their JSON, and a
 * single retry recovers that cheaply. Two failures is a provider problem, and
 * looping would spend the citizen's latency budget on nothing.
 */
export async function extractProfile(
  llm: LlmProvider,
  transcript: string,
  locale: Locale,
): Promise<ExtractionResult> {
  let lastError = 'extraction failed';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw: unknown;
    try {
      raw = await llm.extract(transcript, locale);
    } catch (error) {
      // A provider that is not configured is a *degraded mode*, not a failed
      // extraction, and the two must not be conflated. Retrying it is pointless
      // and — more importantly — reporting it as an extraction error would show
      // the citizen a failure instead of falling back to a path that works.
      if (error instanceof ProviderUnavailableError) throw error;

      lastError = error instanceof Error ? error.message : 'extraction call failed';
      continue;
    }

    const parsed = ProfileSchema.safeParse(raw);
    if (!parsed.success) {
      lastError = `extraction did not match the profile schema: ${parsed.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ')}`;
      continue;
    }

    const { profile, dropped } = ground(parsed.data, transcript);
    return { ok: true, profile, dropped };
  }

  return { ok: false, error: lastError };
}
