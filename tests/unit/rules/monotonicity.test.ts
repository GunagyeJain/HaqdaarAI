import { describe, expect, it } from 'vitest';
import { evaluate } from '@/domain/rules/evaluate';
import type { Profile, RuleNode } from '@/domain/rules/types';

/**
 * MONOTONICITY -- the property that makes the conversational loop coherent.
 *
 * Answering a question may move a scheme UNKNOWN -> PASS or UNKNOWN -> FAIL,
 * but must NEVER move it PASS -> FAIL or FAIL -> PASS. A citizen told they
 * qualify must not be told otherwise three questions later.
 *
 * Verified exhaustively rather than by sampling: for each rule we enumerate
 * every subset of a fully-populated profile and check every single-field
 * addition out of it.
 */

const fullProfile: Profile = {
  age: 30,
  state: 'PB',
  annualIncome: 180000,
  category: 'sc',
  isDisabled: false,
  occupation: 'farmer',
};

const fields = Object.keys(fullProfile) as Array<keyof Profile>;

/** Every subset of `fullProfile`, as a bitmask over its fields. */
function* subsets(): Generator<Profile> {
  for (let mask = 0; mask < 1 << fields.length; mask++) {
    const profile: Profile = {};
    fields.forEach((field, index) => {
      if (mask & (1 << index)) {
        Reflect.set(profile, field, Reflect.get(fullProfile, field));
      }
    });
    yield profile;
  }
}

const rules: Array<{ name: string; rule: RuleNode }> = [
  {
    name: 'flat conjunction',
    rule: {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'between', min: 18, max: 40 },
        { field: 'annualIncome', op: 'lte', value: 250000 },
        { field: 'state', op: 'in', values: ['PB', 'HR'] },
      ],
    },
  },
  {
    name: 'conjunction over a disjunction',
    rule: {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        {
          op: 'OR',
          clauses: [
            { field: 'category', op: 'in', values: ['sc', 'st'] },
            { field: 'isDisabled', op: 'eq', value: true },
          ],
        },
      ],
    },
  },
  {
    name: 'tree containing a negation',
    rule: {
      op: 'AND',
      clauses: [
        { op: 'NOT', clause: { field: 'occupation', op: 'eq', value: 'salaried' } },
        { field: 'annualIncome', op: 'lt', value: 200000 },
      ],
    },
  },
  {
    name: 'tree containing a wildcard',
    rule: {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { op: 'WILDCARD', sourceText: 'must not be an income tax payer', reason: 'unmodellable' },
      ],
    },
  },
];

describe('monotonicity: new information never reverses a decided verdict', () => {
  for (const { name, rule } of rules) {
    it(name, () => {
      for (const profile of subsets()) {
        const before = evaluate(rule, profile).verdict;
        if (before === 'UNKNOWN') continue;

        for (const field of fields) {
          if (field in profile) continue;

          const extended: Profile = { ...profile };
          Reflect.set(extended, field, Reflect.get(fullProfile, field));
          const after = evaluate(rule, extended).verdict;

          expect(
            after,
            `${name}: adding ${String(field)} to ${JSON.stringify(profile)} flipped ${before} -> ${after}`,
          ).toBe(before);
        }
      }
    });
  }
});
