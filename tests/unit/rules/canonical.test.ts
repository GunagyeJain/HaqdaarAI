import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@/domain/rules/canonical';
import type { RuleNode } from '@/domain/rules/types';

/**
 * CANONICAL SERIALIZATION -- what makes "did this rule tree actually change?"
 * an answerable question.
 *
 * A tree written to a JSONB column does not come back the way it went in:
 * Postgres normalizes object key order (by key length, then bytewise), so
 * `{field, op, values}` returns as `{op, field, values}`. Comparing the two
 * with JSON.stringify reports a difference that does not exist, which is
 * exactly the bug this exists to prevent -- `pnpm db:renormalize` claimed all
 * 483 schemes changed on a run that changed nothing.
 *
 * Key order is therefore not significant. Array order IS: clause order is how
 * a rule reads back against its source prose, and reordering it is a real
 * change even when the logic is unaffected.
 */
describe('canonicalJson', () => {
  it('ignores object key order', () => {
    const asWritten = { field: 'state', op: 'in', values: ['HR'] } as RuleNode;
    const asStored = { op: 'in', field: 'state', values: ['HR'] } as RuleNode;

    expect(canonicalJson(asWritten)).toBe(canonicalJson(asStored));
  });

  it('ignores key order at every depth, not just the root', () => {
    const asWritten = {
      op: 'AND',
      clauses: [
        { field: 'state', op: 'in', values: ['PB'] },
        { op: 'NOT', clause: { field: 'age', op: 'lt', value: 18 } },
      ],
    } as RuleNode;

    const asStored = {
      clauses: [
        { op: 'in', field: 'state', values: ['PB'] },
        { clause: { op: 'lt', field: 'age', value: 18 }, op: 'NOT' },
      ],
      op: 'AND',
    } as RuleNode;

    expect(canonicalJson(asWritten)).toBe(canonicalJson(asStored));
  });

  it('reproduces the real JSONB round trip of a wildcard clause', () => {
    const asWritten = {
      op: 'WILDCARD',
      sourceText: 'The applicant must possess a Family Identity Card.',
      reason: 'unmodellable',
    } as RuleNode;

    const asStored = {
      op: 'WILDCARD',
      reason: 'unmodellable',
      sourceText: 'The applicant must possess a Family Identity Card.',
    } as RuleNode;

    expect(canonicalJson(asWritten)).toBe(canonicalJson(asStored));
  });

  it('still distinguishes trees that genuinely differ', () => {
    const monthly = { field: 'annualIncome', op: 'lt', value: 15_000 } as RuleNode;
    const annual = { field: 'annualIncome', op: 'lt', value: 180_000 } as RuleNode;

    expect(canonicalJson(monthly)).not.toBe(canonicalJson(annual));
  });

  it('distinguishes a differing operator under identical keys', () => {
    const below = { field: 'age', op: 'lt', value: 60 } as RuleNode;
    const atOrBelow = { field: 'age', op: 'lte', value: 60 } as RuleNode;

    expect(canonicalJson(below)).not.toBe(canonicalJson(atOrBelow));
  });

  it('treats clause order as significant', () => {
    const stateFirst = {
      op: 'AND',
      clauses: [
        { field: 'state', op: 'in', values: ['HR'] },
        { field: 'age', op: 'gte', value: 18 },
      ],
    } as RuleNode;

    const ageFirst = {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { field: 'state', op: 'in', values: ['HR'] },
      ],
    } as RuleNode;

    expect(canonicalJson(stateFirst)).not.toBe(canonicalJson(ageFirst));
  });

  it('treats enumerated values as ordered, because "in" lists read back against prose', () => {
    const asProse = { field: 'category', op: 'in', values: ['sc', 'st'] } as RuleNode;
    const reordered = { field: 'category', op: 'in', values: ['st', 'sc'] } as RuleNode;

    expect(canonicalJson(asProse)).not.toBe(canonicalJson(reordered));
  });
});
