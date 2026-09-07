import { describe, expect, it } from 'vitest';
import { synthesizeClause, synthesizeRuleTree } from '@/domain/corpus/clauses';
import type { RuleNode } from '@/domain/rules/types';

/**
 * Clause synthesis turns one bullet of eligibility prose into one rule clause.
 *
 * The asymmetry that governs this module: a MISSED clause degrades the scheme
 * to UNKNOWN, which is safe and prompts a question. A WRONG clause silently
 * disqualifies an eligible citizen, which is the exact harm this project exists
 * to prevent. So synthesis is deliberately conservative — it recognises a small
 * set of high-confidence patterns and sends everything else to WILDCARD.
 *
 * Where these tests look pedantically strict about refusing to parse something,
 * that is the point.
 */

const isWildcard = (node: RuleNode, reason?: string) =>
  node.op === 'WILDCARD' && (reason === undefined || node.reason === reason);

describe('age', () => {
  it.each([
    ['The age of the applicant must be at least 18 years.', { field: 'age', op: 'gte', value: 18 }],
    ['Applicant should be minimum 21 years of age.', { field: 'age', op: 'gte', value: 21 }],
    ['The applicant must not be less than 18 years old.', { field: 'age', op: 'gte', value: 18 }],
    ['Age should be below 35 years.', { field: 'age', op: 'lt', value: 35 }],
    ['Applicant must be under 30 years of age.', { field: 'age', op: 'lt', value: 30 }],
    ['Age must not exceed 40 years.', { field: 'age', op: 'lte', value: 40 }],
    ['Maximum age is 45 years.', { field: 'age', op: 'lte', value: 45 }],
    [
      'The applicant should be between 18 and 40 years of age.',
      { field: 'age', op: 'between', min: 18, max: 40 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  // "below" is exclusive, "not more than" is inclusive. Conflating them shifts
  // the boundary by a year and wrongly excludes people exactly on it.
  it('distinguishes exclusive from inclusive upper bounds', () => {
    expect(synthesizeClause('Age below 35 years.')).toMatchObject({ op: 'lt' });
    expect(synthesizeClause('Age not more than 35 years.')).toMatchObject({ op: 'lte' });
  });
});

describe('income', () => {
  it.each([
    [
      'Annual family income should not exceed ₹2,50,000.',
      { field: 'annualIncome', op: 'lte', value: 250000 },
    ],
    [
      'Family income must be less than 2.5 lakh per annum.',
      { field: 'annualIncome', op: 'lt', value: 250000 },
    ],
    [
      'Annual income up to Rs. 8,00,000.',
      { field: 'annualIncome', op: 'lte', value: 800000 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  it('does not read an unrelated amount as an income cap', () => {
    // A benefit amount is not an eligibility bound. Treating it as one would
    // invent a cap that excludes everyone earning above a grant size.
    expect(isWildcard(synthesizeClause('A subsidy of ₹50,000 is provided.'))).toBe(true);
  });
});

describe('categorical criteria', () => {
  it.each([
    ['The applicant must be a woman.', { field: 'gender', op: 'eq', value: 'female' }],
    ['Only female applicants are eligible.', { field: 'gender', op: 'eq', value: 'female' }],
    [
      'The applicant must belong to SC/ST category.',
      { field: 'category', op: 'in', values: ['sc', 'st'] },
    ],
    [
      'Applicant should belong to the OBC category.',
      { field: 'category', op: 'in', values: ['obc'] },
    ],
    ['The applicant must be from a rural area.', { field: 'residence', op: 'eq', value: 'rural' }],
    ['The family must be Below Poverty Line (BPL).', { field: 'isBPL', op: 'eq', value: true }],
    [
      'The applicant must be a person with disability.',
      { field: 'isDisabled', op: 'eq', value: true },
    ],
    [
      'Disability of 40% or more is required.',
      { field: 'disabilityPercentage', op: 'gte', value: 40 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });
});

describe('refusing to guess', () => {
  it('sends a conditional to WILDCARD rather than parsing its parts', () => {
    // Real prose from the Stand-Up India scheme. It mentions "male" and
    // "SC / ST", but asserts neither unconditionally — a naive matcher would
    // produce a rule that excludes every woman.
    const clause = synthesizeClause('If the applicant is a male, he must be from SC / ST category.');
    expect(isWildcard(clause, 'ambiguous')).toBe(true);
  });

  it.each([
    'Unless otherwise specified, the applicant must be 18 years old.',
    'Provided that the applicant has not availed this benefit before.',
    'Preference will be given to deserving candidates.',
    'Subject to the discretion of the district officer.',
  ])('sends vague or qualified prose to WILDCARD: %s', (prose) => {
    expect(isWildcard(synthesizeClause(prose), 'ambiguous')).toBe(true);
  });

  it.each([
    'The applicant must not be in default to any bank or financial institution.',
    'Finance is provided for Greenfield Enterprises.',
    'The applicant must possess a valid Aadhaar card.',
  ])('sends unmodellable prose to WILDCARD: %s', (prose) => {
    expect(isWildcard(synthesizeClause(prose), 'unmodellable')).toBe(true);
  });

  it('always preserves the original prose on a wildcard', () => {
    const prose = 'The applicant must possess a valid Aadhaar card.';
    const clause = synthesizeClause(prose);
    expect(clause.op === 'WILDCARD' && clause.sourceText).toBe(prose);
  });
});

describe('synthesizeRuleTree', () => {
  const markdown = [
    '- Finance is provided for Greenfield Enterprises.',
    '- If the applicant is a male, he must be from SC / ST category.',
    '- The age of the applicant must be at least 18 years.',
    '- The applicant must not be in default to any bank/financial institution.',
  ].join('\n');

  it('produces one clause per bullet, conjoined', () => {
    const tree = synthesizeRuleTree(markdown);
    expect(tree.op).toBe('AND');
    expect(tree.op === 'AND' && tree.clauses).toHaveLength(4);
  });

  it('recovers the one modellable criterion and wildcards the rest', () => {
    const tree = synthesizeRuleTree(markdown);
    const clauses = tree.op === 'AND' ? tree.clauses : [];

    expect(clauses.filter((c) => c.op !== 'WILDCARD')).toEqual([
      { field: 'age', op: 'gte', value: 18 },
    ]);
    expect(clauses.filter((c) => c.op === 'WILDCARD')).toHaveLength(3);
  });

  it('handles an empty or missing eligibility section', () => {
    // No criteria means nothing disqualifies anyone — an empty AND, which is
    // vacuously PASS. That is correct, not a bug.
    expect(synthesizeRuleTree('')).toEqual({ op: 'AND', clauses: [] });
  });

  it('ignores markdown formatting and blank lines', () => {
    const tree = synthesizeRuleTree('\n\n*  The applicant must be a woman.\n\n-   \n');
    expect(tree).toEqual({
      op: 'AND',
      clauses: [{ field: 'gender', op: 'eq', value: 'female' }],
    });
  });
});
