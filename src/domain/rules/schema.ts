import { z } from 'zod';
import {
  CATEGORIES,
  EDUCATION_LEVELS,
  FIELD_KINDS,
  GENDERS,
  MARITAL_STATUSES,
  OCCUPATIONS,
  PROFILE_FIELDS,
  RESIDENCES,
  STATE_CODES,
} from './types';
import type { RuleNode } from './types';

/**
 * The single schema contract (docs/DATA-MODEL.md §7).
 *
 * These same schemas validate scraper normalizer output and LLM extraction
 * output. There is no second system and no drift between live-extracted and
 * scraped data. If the two ever need different schemas, that is the bug.
 */

// ─── Profile ─────────────────────────────────────────────────────────────────

/**
 * Every field optional -- absence is the normal starting state. Strict, so an
 * invented field is a caught error rather than a silently dropped key: the
 * extraction path depends on that (docs/EVALUATION.md §2).
 */
export const ProfileSchema = z.strictObject({
  age: z.number().int().min(0).max(120).optional(),
  gender: z.enum(GENDERS).optional(),
  state: z.enum(STATE_CODES).optional(),
  district: z.string().min(1).max(100).optional(),
  residence: z.enum(RESIDENCES).optional(),
  annualIncome: z.number().min(0).max(100_000_000).optional(),
  category: z.enum(CATEGORIES).optional(),
  isMinority: z.boolean().optional(),
  occupation: z.enum(OCCUPATIONS).optional(),
  education: z.enum(EDUCATION_LEVELS).optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
  isDisabled: z.boolean().optional(),
  disabilityPercentage: z.number().min(0).max(100).optional(),
  isBPL: z.boolean().optional(),
  landHoldingHectares: z.number().min(0).max(10_000).optional(),
  familySize: z.number().int().min(1).max(50).optional(),
});

// ─── Rule tree ───────────────────────────────────────────────────────────────

const FieldEnum = z.enum(PROFILE_FIELDS);

/**
 * Numeric operators accept only numeric fields. Derived from FIELD_KINDS so it
 * cannot drift, and enforced here rather than at evaluation time: a nonsensical
 * rule ("age less than female") should be impossible to store, not something
 * that quietly degrades to UNKNOWN for every citizen.
 */
const NumericFieldEnum = FieldEnum.refine((field) => FIELD_KINDS[field] === 'number', {
  message: 'numeric operators require a numeric field',
});

const LeafValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const comparisonClause = (op: 'eq' | 'neq') =>
  z.strictObject({ field: FieldEnum, op: z.literal(op), value: LeafValueSchema });

const numericClause = (op: 'lt' | 'lte' | 'gt' | 'gte') =>
  z.strictObject({ field: NumericFieldEnum, op: z.literal(op), value: z.number() });

const setClause = (op: 'in' | 'not_in') =>
  z.strictObject({
    field: FieldEnum,
    op: z.literal(op),
    // An empty set can never be satisfied -- always a scrape bug, never intent.
    values: z.array(LeafValueSchema).min(1),
  });

const BetweenClause = z
  .strictObject({
    field: NumericFieldEnum,
    op: z.literal('between'),
    min: z.number(),
    max: z.number(),
  })
  .refine((clause) => clause.min <= clause.max, {
    message: 'between requires min <= max',
    path: ['min'],
  });

/** INVARIANT 4: a wildcard must carry the prose it could not express. */
const WildcardClause = z.strictObject({
  op: z.literal('WILDCARD'),
  sourceText: z.string().min(1),
  reason: z.enum(['unmodellable', 'ambiguous', 'ungrounded']),
});

export const RuleTreeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    z.strictObject({ op: z.literal('AND'), clauses: z.array(RuleTreeSchema) }),
    z.strictObject({ op: z.literal('OR'), clauses: z.array(RuleTreeSchema) }),
    z.strictObject({ op: z.literal('NOT'), clause: RuleTreeSchema }),
    WildcardClause,
    comparisonClause('eq'),
    comparisonClause('neq'),
    numericClause('lt'),
    numericClause('lte'),
    numericClause('gt'),
    numericClause('gte'),
    BetweenClause,
    setClause('in'),
    setClause('not_in'),
  ]),
);

export type ProfileInput = z.infer<typeof ProfileSchema>;
