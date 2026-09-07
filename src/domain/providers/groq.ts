import type { Locale } from '@/i18n/routing';
import {
  CATEGORIES,
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  OCCUPATIONS,
  RESIDENCES,
  STATE_CODES,
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

/** Nullable so "not mentioned" is expressible under strict mode. */
const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

const PROFILE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    age: nullable({ type: 'integer', minimum: 0, maximum: 120 }),
    gender: nullable({ type: 'string', enum: [...GENDERS] }),
    state: nullable({ type: 'string', enum: [...STATE_CODES] }),
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
      throw new ProviderUnavailableError('groq', `extraction failed (${response.status})`);
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

    // Strip the nulls that stood in for "not mentioned"; ProfileSchema treats
    // absence, not null, as unanswered.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => value !== null),
    );
  },
};
