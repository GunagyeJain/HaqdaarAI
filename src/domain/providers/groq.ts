import type { Locale } from '@/i18n/routing';
import { toStateCode } from '../corpus/states';
import {
  CATEGORIES,
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  OCCUPATIONS,
  RESIDENCES,
} from '../rules/types';
import { ProviderUnavailableError } from './resilience';
import type { LlmProvider } from './types';

/**
 * Groq — extraction only.
 *
 * INVARIANT 1: this provider converts a transcript into structured fields. It
 * never sees a scheme, a rule, or a verdict, and the LlmProvider signature
 * gives it no parameter through which one could arrive.
 *
 * ADR-004 requires strict JSON-schema mode rather than prompt discipline, so a
 * malformed or invented *field* is a decoding-time impossibility rather than a
 * runtime surprise. Invented *values* are a separate problem, handled by the
 * grounding check in ./extraction.ts.
 *
 * The model matters and is not assumed: Groq deprecated llama-3.1-8b-instant
 * and llama-3.3-70b-versatile in June 2026, so the proposal's "Llama 3" no
 * longer exists. The default below is a current strict-mode-capable model and
 * is overridable by env.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

/**
 * Makes "not mentioned" expressible under strict decoding.
 *
 * Three forms were tried against the live API, and the differences matter more
 * than they look:
 *
 *   anyOf: [schema, {type:'null'}]  — the model emitted the *string* `"null"`,
 *                                     which strict decoding then rejected,
 *                                     failing the whole request.
 *   type: ['string','null'] alone   — accepted, and WORSE: unable to express
 *                                     null for an enum field, the model guessed.
 *                                     "I am a 42 year old farmer" came back with
 *                                     gender "male".
 *   type array + null in the enum   — correct. The model returns null.
 *
 * The middle case is the one to remember. It returned HTTP 200 and looked fine,
 * while quietly inventing a protected attribute from nothing. A schema that
 * gives a model no way to say "they did not tell me" is a schema that makes it
 * guess — and guessing about gender, caste or disability is the whole harm this
 * project exists to prevent. The grounding gate caught it downstream; the
 * schema should not have created the pressure in the first place.
 */
const nullable = (schema: { type: string; enum?: readonly string[] } & Record<string, unknown>) => ({
  ...schema,
  type: [schema.type, 'null'],
  ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});

const PROFILE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    age: nullable({ type: 'integer', minimum: 0, maximum: 120 }),
    gender: nullable({ type: 'string', enum: [...GENDERS] }),
    // Deliberately NOT an enum of 36 codes. That enum was over half the
    // schema's token cost, throttling a free-tier key to a handful of requests
    // per minute, and it asked the model to recall an arbitrary code table.
    // A plain name is easier for the model and is normalised below by the same
    // toStateCode() the scraper uses — an unrecognised name yields nothing
    // rather than a guess.
    state: nullable({ type: 'string' }),
    district: nullable({ type: 'string' }),
    residence: nullable({ type: 'string', enum: [...RESIDENCES] }),
    annualIncome: nullable({ type: 'number', minimum: 0 }),
    category: nullable({ type: 'string', enum: [...CATEGORIES] }),
    isMinority: nullable({ type: 'boolean' }),
    occupation: nullable({ type: 'string', enum: [...OCCUPATIONS] }),
    education: nullable({ type: 'string', enum: [...EDUCATION_LEVELS] }),
    maritalStatus: nullable({ type: 'string', enum: [...MARITAL_STATUSES] }),
    isDisabled: nullable({ type: 'boolean' }),
    disabilityPercentage: nullable({ type: 'number', minimum: 0, maximum: 100 }),
    isBPL: nullable({ type: 'boolean' }),
    landHoldingHectares: nullable({ type: 'number', minimum: 0 }),
    familySize: nullable({ type: 'integer', minimum: 1 }),
  },
  // Strict mode requires every property to be listed; "absent" is expressed as
  // null and stripped below.
  required: [
    'age', 'gender', 'state', 'district', 'residence', 'annualIncome', 'category',
    'isMinority', 'occupation', 'education', 'maritalStatus', 'isDisabled',
    'disabilityPercentage', 'isBPL', 'landHoldingHectares', 'familySize',
  ],
} as const;

const SYSTEM_PROMPT = [
  'You convert what a person said about themselves into structured fields.',
  '',
  'Rules:',
  '- Use null for anything the person did not actually state. Do not infer,',
  '  estimate, or fill a field because it seems likely.',
  '- Never guess caste, income, disability or religion. These are only ever',
  '  set when the person states them plainly.',
  '- Convert Indian number words to digits: "2.5 lakh" is 250000, "do lakh"',
  '  is 200000.',
  '- If the person corrects themselves, use the corrected value.',
  '- Record ONLY facts about the speaker themselves. If they describe someone',
  '  else — a neighbour, a relative, a friend — record nothing from that. Asking',
  '  on behalf of another person is common, and their details do not belong to',
  '  the speaker. When in doubt, return null.',
  '- For state, write the full English name, e.g. "Punjab". Never abbreviate.',
  '- Use the JSON value null, never the text "null".',
  '- You are not deciding eligibility for anything. You are only writing down',
  '  what was said.',
].join('\n');

export const groqLlm: LlmProvider = {
  name: 'groq',

  async extract(transcript: string, locale: Locale): Promise<unknown> {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      throw new ProviderUnavailableError('groq', 'GROQ_API_KEY is not set');
    }

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `The person is speaking ${locale}. They said:\n\n${transcript}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'applicant_profile',
            strict: true,
            schema: PROFILE_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      // Include the provider's own message. A bare status code sent me chasing
      // a schema bug blind; the body named the offending field immediately.
      const detail = (await response.text().catch(() => '')).slice(0, 400);

      // A 400 json_validate_failed means the MODEL produced something that did
      // not fit the schema — occasionally it still emits the string "null" for
      // an unmentioned field. That is a transient output glitch and is exactly
      // what the bounded retry in ./extraction.ts exists for, so it is thrown
      // as an ordinary Error.
      //
      // Everything else — auth, rate limits, 5xx — means the provider cannot
      // serve us, which is a degraded mode the citizen must be told about so
      // the client can fall back rather than spin.
      if (response.status === 400 && detail.includes('json_validate_failed')) {
        throw new Error(`groq returned output that did not match the schema: ${detail}`);
      }

      throw new ProviderUnavailableError(
        'groq',
        `extraction failed (${response.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ProviderUnavailableError('groq', 'extraction returned no content');
    }

    const parsed: unknown = JSON.parse(content);
    if (parsed === null || typeof parsed !== 'object') return parsed;

    const fields = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        // Strip the nulls that stood in for "not mentioned"; ProfileSchema
        // treats absence, not null, as unanswered. The string "null" is
        // stripped too — models occasionally emit it despite the instruction.
        ([, value]) => value !== null && value !== 'null',
      ),
    );

    // Normalise the free-text state to a code. An unmappable name is dropped
    // rather than guessed at, and grounding still has to find it in the
    // transcript afterwards.
    if (typeof fields.state === 'string') {
      const code = toStateCode(fields.state);
      if (code) fields.state = code;
      else delete fields.state;
    }

    return fields;
  },
};
