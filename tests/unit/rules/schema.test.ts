import { describe, expect, it } from 'vitest';
import { ProfileSchema, RuleTreeSchema } from '@/domain/rules/schema';

/**
 * Zod is the single schema contract: these same schemas validate scraper
 * normalizer output and LLM extraction output. If the two ever need different
 * schemas, that divergence is the bug (docs/DATA-MODEL.md §7).
 */

describe('ProfileSchema', () => {
  it('accepts a fully populated profile', () => {
    const result = ProfileSchema.safeParse({
      age: 42, gender: 'female', state: 'PB', residence: 'rural',
      annualIncome: 180000, category: 'sc', occupation: 'farmer',
      isDisabled: false, familySize: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an entirely empty profile', () => {
    // Absence is the normal starting state, not an error.
    expect(ProfileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown field rather than silently dropping it', () => {
    // An LLM inventing a field must be a caught error, not a silent no-op.
    expect(ProfileSchema.safeParse({ age: 30, casteCertificateNumber: 'X1' }).success).toBe(false);
  });

  it('rejects a value outside an enum', () => {
    expect(ProfileSchema.safeParse({ category: 'brahmin' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ state: 'XX' }).success).toBe(false);
  });

  it('rejects impossible numbers', () => {
    expect(ProfileSchema.safeParse({ age: -5 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ age: 200 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ annualIncome: -1 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ disabilityPercentage: 101 }).success).toBe(false);
  });
});

describe('RuleTreeSchema', () => {
  it('accepts a nested tree', () => {
    const result = RuleTreeSchema.safeParse({
      op: 'AND',
      clauses: [
        { field: 'age', op: 'between', min: 18, max: 40 },
        {
          op: 'OR',
          clauses: [
            { field: 'category', op: 'in', values: ['sc', 'st'] },
            { field: 'isDisabled', op: 'eq', value: true },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a wildcard carrying its source prose', () => {
    const result = RuleTreeSchema.safeParse({
      op: 'WILDCARD',
      sourceText: 'The applicant must not be an income tax payer.',
      reason: 'unmodellable',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wildcard without its source prose', () => {
    // INVARIANT 4: a rule that cannot be audited must not exist.
    expect(RuleTreeSchema.safeParse({ op: 'WILDCARD', reason: 'unmodellable' }).success).toBe(false);
  });

  it('rejects an unknown field name', () => {
    expect(RuleTreeSchema.safeParse({ field: 'favouriteColour', op: 'eq', value: 'blue' }).success).toBe(false);
  });

  it('rejects an unknown operator', () => {
    expect(RuleTreeSchema.safeParse({ field: 'age', op: 'approximately', value: 30 }).success).toBe(false);
  });

  // The point of a field-kind registry: a nonsensical rule is impossible to
  // store, rather than degrading to UNKNOWN at evaluation time.
  it('rejects a numeric comparison against a non-numeric field', () => {
    expect(RuleTreeSchema.safeParse({ field: 'gender', op: 'lt', value: 3 }).success).toBe(false);
    expect(RuleTreeSchema.safeParse({ field: 'state', op: 'between', min: 1, max: 5 }).success).toBe(false);
  });

  it('accepts a numeric comparison against a numeric field', () => {
    expect(RuleTreeSchema.safeParse({ field: 'annualIncome', op: 'lte', value: 250000 }).success).toBe(true);
  });

  it('rejects an inverted between range', () => {
    expect(RuleTreeSchema.safeParse({ field: 'age', op: 'between', min: 40, max: 18 }).success).toBe(false);
  });

  it('rejects an empty set for in', () => {
    // An `in` over no values can never be satisfied; it is always a scrape bug.
    expect(RuleTreeSchema.safeParse({ field: 'state', op: 'in', values: [] }).success).toBe(false);
  });

  it('rejects a malformed clause nested deep inside a valid tree', () => {
    const result = RuleTreeSchema.safeParse({
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { op: 'OR', clauses: [{ field: 'nonsense', op: 'eq', value: 1 }] },
      ],
    });
    expect(result.success).toBe(false);
  });
});
