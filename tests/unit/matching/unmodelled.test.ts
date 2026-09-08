import { describe, expect, it } from 'vitest';
import { unmodelledCriteria } from '@/domain/matching/unmodelled';
import type { RuleNode } from '@/domain/rules/types';

/**
 * A WILDCARD is a criterion we deliberately refuse to model, carrying the
 * government's own wording (invariant 4).
 *
 * It is also the single most useful thing we can show a citizen whose verdict
 * is UNKNOWN. Around 60% of clauses in this corpus are wildcards, so most
 * schemes cannot reach PASS however much anyone answers. Listing them turns
 * "we cannot tell" into "here is what to go and check", which is the
 * difference between a shrug and an instruction.
 */
describe('unmodelledCriteria', () => {
  it('collects wildcard prose at every depth', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { field: 'state', op: 'in', values: ['PB'] },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'Must be a registered member.' },
        {
          op: 'OR',
          clauses: [
            {
              op: 'WILDCARD',
              reason: 'ambiguous',
              sourceText: 'Either own the land or hold a lease.',
            },
          ],
        },
        {
          op: 'NOT',
          clause: {
            op: 'WILDCARD',
            reason: 'unmodellable',
            sourceText: 'Not an income tax payer.',
          },
        },
      ],
    };

    expect(unmodelledCriteria(tree)).toEqual([
      'Must be a registered member.',
      'Either own the land or hold a lease.',
      'Not an income tax payer.',
    ]);
  });

  it('returns nothing for a fully modelled tree', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [{ field: 'age', op: 'gte', value: 18 }],
    };

    expect(unmodelledCriteria(tree)).toEqual([]);
  });

  it('handles a bare wildcard with no surrounding tree', () => {
    const tree: RuleNode = {
      op: 'WILDCARD',
      reason: 'ungrounded',
      sourceText: 'Attendance must be at least 75%.',
    };

    expect(unmodelledCriteria(tree)).toEqual(['Attendance must be at least 75%.']);
  });

  it('de-duplicates prose repeated across clauses', () => {
    // Audit finding F7: a criterion stated twice in the prose becomes two
    // clauses. A checklist that repeats itself reads as a bug in the page.
    const repeated = 'Must hold a Family Identity Card.';
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: repeated },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: repeated },
      ],
    };

    expect(unmodelledCriteria(tree)).toEqual([repeated]);
  });

  it('keeps the order the prose stated them in', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'First.' },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'Second.' },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'Third.' },
      ],
    };

    expect(unmodelledCriteria(tree)).toEqual(['First.', 'Second.', 'Third.']);
  });
});
