import { describe, expect, it } from 'vitest';
import { evaluate } from '@/domain/rules/evaluate';
import type { Profile, RuleNode, Verdict } from '@/domain/rules/types';

/**
 * The rule evaluator is the core of the project: it decides whether a citizen
 * qualifies for a scheme. Its semantics are specified in docs/DATA-MODEL.md §3
 * (Kleene three-valued logic) and must match match_schemes() in SQL exactly.
 *
 * The asymmetry between AND and OR is the subtle part and is tested explicitly:
 * a verdict can be decided while information is still missing.
 */

const verdictOf = (rule: RuleNode, profile: Profile): Verdict =>
  evaluate(rule, profile).verdict;

describe('leaf operators', () => {
  const cases: Array<{ name: string; rule: RuleNode; profile: Profile; expect: Verdict }> = [
    // eq
    { name: 'eq matches', rule: { field: 'gender', op: 'eq', value: 'female' }, profile: { gender: 'female' }, expect: 'PASS' },
    { name: 'eq mismatches', rule: { field: 'gender', op: 'eq', value: 'female' }, profile: { gender: 'male' }, expect: 'FAIL' },
    { name: 'eq on absent field', rule: { field: 'gender', op: 'eq', value: 'female' }, profile: {}, expect: 'UNKNOWN' },

    // neq — must be UNKNOWN when absent, never vacuously true
    { name: 'neq matches', rule: { field: 'category', op: 'neq', value: 'general' }, profile: { category: 'sc' }, expect: 'PASS' },
    { name: 'neq mismatches', rule: { field: 'category', op: 'neq', value: 'general' }, profile: { category: 'general' }, expect: 'FAIL' },
    { name: 'neq on absent field', rule: { field: 'category', op: 'neq', value: 'general' }, profile: {}, expect: 'UNKNOWN' },

    // numeric comparisons
    { name: 'lt below bound', rule: { field: 'age', op: 'lt', value: 40 }, profile: { age: 39 }, expect: 'PASS' },
    { name: 'lt at bound is exclusive', rule: { field: 'age', op: 'lt', value: 40 }, profile: { age: 40 }, expect: 'FAIL' },
    { name: 'lte at bound is inclusive', rule: { field: 'age', op: 'lte', value: 40 }, profile: { age: 40 }, expect: 'PASS' },
    { name: 'gt above bound', rule: { field: 'age', op: 'gt', value: 18 }, profile: { age: 19 }, expect: 'PASS' },
    { name: 'gt at bound is exclusive', rule: { field: 'age', op: 'gt', value: 18 }, profile: { age: 18 }, expect: 'FAIL' },
    { name: 'gte at bound is inclusive', rule: { field: 'age', op: 'gte', value: 18 }, profile: { age: 18 }, expect: 'PASS' },
    { name: 'lte on absent field', rule: { field: 'annualIncome', op: 'lte', value: 250000 }, profile: {}, expect: 'UNKNOWN' },

    // between — inclusive on both ends
    { name: 'between inside range', rule: { field: 'age', op: 'between', min: 18, max: 40 }, profile: { age: 30 }, expect: 'PASS' },
    { name: 'between at lower bound', rule: { field: 'age', op: 'between', min: 18, max: 40 }, profile: { age: 18 }, expect: 'PASS' },
    { name: 'between at upper bound', rule: { field: 'age', op: 'between', min: 18, max: 40 }, profile: { age: 40 }, expect: 'PASS' },
    { name: 'between below range', rule: { field: 'age', op: 'between', min: 18, max: 40 }, profile: { age: 17 }, expect: 'FAIL' },
    { name: 'between above range', rule: { field: 'age', op: 'between', min: 18, max: 40 }, profile: { age: 41 }, expect: 'FAIL' },

    // set membership
    { name: 'in matches', rule: { field: 'state', op: 'in', values: ['PB', 'HR'] }, profile: { state: 'PB' }, expect: 'PASS' },
    { name: 'in mismatches', rule: { field: 'state', op: 'in', values: ['PB', 'HR'] }, profile: { state: 'UP' }, expect: 'FAIL' },
    { name: 'in on absent field', rule: { field: 'state', op: 'in', values: ['PB'] }, profile: {}, expect: 'UNKNOWN' },
    { name: 'not_in matches', rule: { field: 'state', op: 'not_in', values: ['PB'] }, profile: { state: 'UP' }, expect: 'PASS' },
    { name: 'not_in mismatches', rule: { field: 'state', op: 'not_in', values: ['PB'] }, profile: { state: 'PB' }, expect: 'FAIL' },

    // booleans
    { name: 'eq true on boolean', rule: { field: 'isDisabled', op: 'eq', value: true }, profile: { isDisabled: true }, expect: 'PASS' },
    { name: 'eq true against false', rule: { field: 'isDisabled', op: 'eq', value: true }, profile: { isDisabled: false }, expect: 'FAIL' },
    // `false` is a real answer, not a missing one — this must not be UNKNOWN.
    { name: 'eq false against false', rule: { field: 'isBPL', op: 'eq', value: false }, profile: { isBPL: false }, expect: 'PASS' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(verdictOf(c.rule, c.profile)).toBe(c.expect);
    });
  }
});

describe('AND — Kleene conjunction', () => {
  const under18: RuleNode = { field: 'age', op: 'gte', value: 18 };
  const incomeCap: RuleNode = { field: 'annualIncome', op: 'lte', value: 250000 };

  it('passes when every clause is true', () => {
    expect(verdictOf({ op: 'AND', clauses: [under18, incomeCap] }, { age: 30, annualIncome: 100000 })).toBe('PASS');
  });

  it('fails when any clause is false', () => {
    expect(verdictOf({ op: 'AND', clauses: [under18, incomeCap] }, { age: 15, annualIncome: 100000 })).toBe('FAIL');
  });

  it('is UNKNOWN when nothing is false but something is missing', () => {
    expect(verdictOf({ op: 'AND', clauses: [under18, incomeCap] }, { age: 30 })).toBe('UNKNOWN');
  });

  // The asymmetry that makes a half-filled profile useful: one disqualifying
  // answer decides the scheme even while other fields are still unknown.
  it('fails on a false clause even when another clause is unknown', () => {
    expect(verdictOf({ op: 'AND', clauses: [under18, incomeCap] }, { age: 15 })).toBe('FAIL');
  });

  it('is vacuously true when empty', () => {
    expect(verdictOf({ op: 'AND', clauses: [] }, {})).toBe('PASS');
  });
});

describe('OR — Kleene disjunction', () => {
  const isSC: RuleNode = { field: 'category', op: 'eq', value: 'sc' };
  const isDisabled: RuleNode = { field: 'isDisabled', op: 'eq', value: true };

  it('passes when any clause is true', () => {
    expect(verdictOf({ op: 'OR', clauses: [isSC, isDisabled] }, { category: 'sc', isDisabled: false })).toBe('PASS');
  });

  it('fails only when every clause is false', () => {
    expect(verdictOf({ op: 'OR', clauses: [isSC, isDisabled] }, { category: 'general', isDisabled: false })).toBe('FAIL');
  });

  it('is UNKNOWN when nothing is true but something is missing', () => {
    expect(verdictOf({ op: 'OR', clauses: [isSC, isDisabled] }, { category: 'general' })).toBe('UNKNOWN');
  });

  // Mirror of the AND asymmetry: one qualifying answer is enough.
  it('passes on a true clause even when another clause is unknown', () => {
    expect(verdictOf({ op: 'OR', clauses: [isSC, isDisabled] }, { category: 'sc' })).toBe('PASS');
  });

  it('is vacuously false when empty', () => {
    expect(verdictOf({ op: 'OR', clauses: [] }, {})).toBe('FAIL');
  });
});

describe('NOT', () => {
  const isFarmer: RuleNode = { field: 'occupation', op: 'eq', value: 'farmer' };

  it('negates a true clause to FAIL', () => {
    expect(verdictOf({ op: 'NOT', clause: isFarmer }, { occupation: 'farmer' })).toBe('FAIL');
  });

  it('negates a false clause to PASS', () => {
    expect(verdictOf({ op: 'NOT', clause: isFarmer }, { occupation: 'student' })).toBe('PASS');
  });

  it('leaves UNKNOWN unchanged', () => {
    expect(verdictOf({ op: 'NOT', clause: isFarmer }, {})).toBe('UNKNOWN');
  });
});

describe('WILDCARD', () => {
  const wildcard: RuleNode = {
    op: 'WILDCARD',
    sourceText: 'The applicant must not be an income tax payer.',
    reason: 'unmodellable',
  };

  it('is always UNKNOWN, however complete the profile', () => {
    expect(verdictOf(wildcard, { age: 30, annualIncome: 1000, state: 'PB' })).toBe('UNKNOWN');
  });

  it('holds an otherwise-satisfied scheme at UNKNOWN', () => {
    const rule: RuleNode = { op: 'AND', clauses: [{ field: 'age', op: 'gte', value: 18 }, wildcard] };
    expect(verdictOf(rule, { age: 30 })).toBe('UNKNOWN');
  });

  // A wildcard represents information we lack, so it can never rescue a
  // disqualification we already established.
  it('cannot rescue a clause that already failed', () => {
    const rule: RuleNode = { op: 'AND', clauses: [{ field: 'age', op: 'gte', value: 18 }, wildcard] };
    expect(verdictOf(rule, { age: 12 })).toBe('FAIL');
  });
});

describe('nested trees', () => {
  // Age 18-40, income under 2.5L, and either SC/ST or disabled.
  const rule: RuleNode = {
    op: 'AND',
    clauses: [
      { field: 'age', op: 'between', min: 18, max: 40 },
      { field: 'annualIncome', op: 'lte', value: 250000 },
      {
        op: 'OR',
        clauses: [
          { field: 'category', op: 'in', values: ['sc', 'st'] },
          { field: 'isDisabled', op: 'eq', value: true },
        ],
      },
    ],
  };

  it('passes a fully qualifying profile', () => {
    expect(verdictOf(rule, { age: 25, annualIncome: 90000, category: 'sc' })).toBe('PASS');
  });

  it('fails when the outer conjunction is broken', () => {
    expect(verdictOf(rule, { age: 55, annualIncome: 90000, category: 'sc' })).toBe('FAIL');
  });

  it('is UNKNOWN when only the inner disjunction is unresolved', () => {
    expect(verdictOf(rule, { age: 25, annualIncome: 90000 })).toBe('UNKNOWN');
  });
});

describe('reasoning output', () => {
  const rule: RuleNode = {
    op: 'AND',
    clauses: [
      { field: 'age', op: 'gte', value: 18 },
      { field: 'state', op: 'in', values: ['PB'] },
      { field: 'annualIncome', op: 'lte', value: 250000 },
    ],
  };

  it('reports which clauses matched and which failed', () => {
    const result = evaluate(rule, { age: 30, state: 'UP' });

    expect(result.matchedClauses).toHaveLength(1);
    expect(result.failedClauses).toHaveLength(1);
    expect(result.matchedClauses[0]).toMatchObject({ field: 'age' });
    expect(result.failedClauses[0]).toMatchObject({ field: 'state' });
  });

  it('reports the fields that would resolve an undecided scheme', () => {
    const result = evaluate(rule, { age: 30 });

    expect(result.verdict).toBe('UNKNOWN');
    expect(result.unknownFields.sort()).toEqual(['annualIncome', 'state']);
  });

  it('reports no unknown fields once every clause is decided', () => {
    const result = evaluate(rule, { age: 30, state: 'PB', annualIncome: 100000 });

    expect(result.verdict).toBe('PASS');
    expect(result.unknownFields).toEqual([]);
  });
});
