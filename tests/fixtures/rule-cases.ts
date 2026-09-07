import type { Profile, RuleNode } from '@/domain/rules/types';

/**
 * Shared fixtures for the differential test that pins the TypeScript reference
 * evaluator and the match_schemes() SQL function together.
 *
 * The differential test runs the full cross product of these rules and
 * profiles, so coverage here is what proves the two implementations of Kleene
 * logic agree. Add a case here and both implementations are tested by it.
 */

export const ruleCases: Array<{ name: string; rule: RuleNode }> = [
  { name: 'eq-string', rule: { field: 'gender', op: 'eq', value: 'female' } },
  { name: 'eq-boolean-true', rule: { field: 'isDisabled', op: 'eq', value: true } },
  { name: 'eq-boolean-false', rule: { field: 'isBPL', op: 'eq', value: false } },
  { name: 'eq-number', rule: { field: 'familySize', op: 'eq', value: 5 } },
  { name: 'neq-string', rule: { field: 'category', op: 'neq', value: 'general' } },

  { name: 'lt', rule: { field: 'age', op: 'lt', value: 40 } },
  { name: 'lte', rule: { field: 'annualIncome', op: 'lte', value: 250000 } },
  { name: 'gt', rule: { field: 'age', op: 'gt', value: 18 } },
  { name: 'gte', rule: { field: 'age', op: 'gte', value: 18 } },
  { name: 'between', rule: { field: 'age', op: 'between', min: 18, max: 40 } },
  { name: 'between-fractional', rule: { field: 'landHoldingHectares', op: 'between', min: 0.5, max: 2 } },

  { name: 'in-strings', rule: { field: 'state', op: 'in', values: ['PB', 'HR', 'UP'] } },
  { name: 'in-single', rule: { field: 'occupation', op: 'in', values: ['farmer'] } },
  { name: 'not_in', rule: { field: 'state', op: 'not_in', values: ['DL', 'CH'] } },

  {
    name: 'and-flat',
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
    name: 'or-flat',
    rule: {
      op: 'OR',
      clauses: [
        { field: 'category', op: 'in', values: ['sc', 'st'] },
        { field: 'isDisabled', op: 'eq', value: true },
      ],
    },
  },
  {
    name: 'and-over-or',
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
    name: 'not-leaf',
    rule: { op: 'NOT', clause: { field: 'occupation', op: 'eq', value: 'salaried' } },
  },
  {
    name: 'not-over-and',
    rule: {
      op: 'NOT',
      clause: {
        op: 'AND',
        clauses: [
          { field: 'age', op: 'gte', value: 60 },
          { field: 'isBPL', op: 'eq', value: true },
        ],
      },
    },
  },
  {
    name: 'wildcard-only',
    rule: { op: 'WILDCARD', sourceText: 'must not be an income tax payer', reason: 'unmodellable' },
  },
  {
    name: 'and-with-wildcard',
    rule: {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { op: 'WILDCARD', sourceText: 'subject to district officer discretion', reason: 'ambiguous' },
      ],
    },
  },
  { name: 'empty-and', rule: { op: 'AND', clauses: [] } },
  { name: 'empty-or', rule: { op: 'OR', clauses: [] } },
  {
    name: 'deeply-nested',
    rule: {
      op: 'AND',
      clauses: [
        { field: 'residence', op: 'eq', value: 'rural' },
        {
          op: 'OR',
          clauses: [
            {
              op: 'AND',
              clauses: [
                { field: 'occupation', op: 'eq', value: 'farmer' },
                { field: 'landHoldingHectares', op: 'lte', value: 2 },
              ],
            },
            { op: 'NOT', clause: { field: 'isBPL', op: 'eq', value: false } },
          ],
        },
      ],
    },
  },
];

export const profileCases: Array<{ name: string; profile: Profile }> = [
  { name: 'empty', profile: {} },
  { name: 'age-only', profile: { age: 30 } },
  { name: 'boundary-low', profile: { age: 18, annualIncome: 250000, landHoldingHectares: 0.5 } },
  { name: 'boundary-high', profile: { age: 40, annualIncome: 250001, landHoldingHectares: 2 } },
  { name: 'below-boundary', profile: { age: 17, annualIncome: 0, landHoldingHectares: 0.49 } },
  {
    name: 'rural-sc-farmer',
    profile: {
      age: 42, gender: 'male', state: 'PB', residence: 'rural', annualIncome: 120000,
      category: 'sc', occupation: 'farmer', isDisabled: false, isBPL: true,
      landHoldingHectares: 1.5, familySize: 5,
    },
  },
  {
    name: 'urban-salaried-general',
    profile: {
      age: 29, gender: 'female', state: 'DL', residence: 'urban', annualIncome: 900000,
      category: 'general', occupation: 'salaried', isDisabled: false, isBPL: false, familySize: 3,
    },
  },
  {
    name: 'elderly-disabled-bpl',
    profile: {
      age: 67, gender: 'female', state: 'TN', residence: 'rural', annualIncome: 40000,
      category: 'obc', occupation: 'retired', isDisabled: true, disabilityPercentage: 60,
      isBPL: true, familySize: 2,
    },
  },
  // Every field false/zero: proves falsy values are treated as answers, not absence.
  { name: 'all-falsy', profile: { isDisabled: false, isBPL: false, isMinority: false, annualIncome: 0, landHoldingHectares: 0 } },
];
