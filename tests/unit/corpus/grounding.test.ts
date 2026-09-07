import { describe, expect, it } from 'vitest';
import { groundRuleTree, isGrounded } from '@/domain/corpus/grounding';
import type { RuleNode, WildcardClause } from '@/domain/rules/types';

/**
 * Proposal §5.1: ground every scraped numeric bound back against the source
 * prose before insertion, so no invented figure can silently exclude an
 * eligible citizen.
 *
 * This is the mechanism that makes "no hallucinated eligibility figures"
 * structurally true rather than aspirational. A bound that cannot be located in
 * the prose is never stored as a rule -- it becomes a WILDCARD, which evaluates
 * to UNKNOWN forever, which is the honest answer.
 */

describe('isGrounded', () => {
  const prose = 'Applicant must be aged 18 to 40 with family income below ₹2,50,000.';

  it('accepts a value written plainly in the prose', () => {
    expect(isGrounded(18, prose)).toBe(true);
    expect(isGrounded(40, prose)).toBe(true);
  });

  it('accepts a value written in an Indian surface form', () => {
    expect(isGrounded(250000, prose)).toBe(true);
  });

  it('rejects a value that does not appear at all', () => {
    expect(isGrounded(45, prose)).toBe(false);
    expect(isGrounded(300000, prose)).toBe(false);
  });

  it('rejects a near-miss rather than tolerating it', () => {
    // 2,50,000 is in the prose; 2,50,001 is not. No fuzzy matching: an
    // approximate bound is an invented bound.
    expect(isGrounded(250001, prose)).toBe(false);
  });
});

const wildcardsIn = (node: RuleNode): WildcardClause[] => {
  if (node.op === 'AND' || node.op === 'OR') return node.clauses.flatMap(wildcardsIn);
  if (node.op === 'NOT') return wildcardsIn(node.clause);
  return node.op === 'WILDCARD' ? [node] : [];
};

describe('groundRuleTree', () => {
  const prose = 'The applicant must be at least 18 years old and earn under ₹2,50,000 a year.';

  it('leaves a fully grounded tree untouched', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { field: 'annualIncome', op: 'lte', value: 250000 },
      ],
    };

    const result = groundRuleTree(tree, prose);

    expect(result.tree).toEqual(tree);
    expect(result.ungroundedValues).toEqual([]);
    expect(result.needsReview).toBe(false);
  });

  it('replaces an ungrounded clause with a WILDCARD instead of dropping it', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { field: 'annualIncome', op: 'lte', value: 999999 },
      ],
    };

    const result = groundRuleTree(tree, prose);
    const wildcards = wildcardsIn(result.tree);

    expect(wildcards).toHaveLength(1);
    expect(wildcards[0]?.reason).toBe('ungrounded');
    expect(result.ungroundedValues).toEqual([999999]);
    expect(result.needsReview).toBe(true);
  });

  it('records what was rejected, so a reviewer can see the discarded assertion', () => {
    const tree: RuleNode = { field: 'age', op: 'lte', value: 45 };
    const wildcards = wildcardsIn(groundRuleTree(tree, prose).tree);

    expect(wildcards[0]?.sourceText).toContain('age');
    expect(wildcards[0]?.sourceText).toContain('45');
  });

  it('rejects a between clause when either bound is ungrounded', () => {
    const tree: RuleNode = { field: 'age', op: 'between', min: 18, max: 60 };
    const result = groundRuleTree(tree, prose);

    expect(wildcardsIn(result.tree)).toHaveLength(1);
    expect(result.ungroundedValues).toEqual([60]);
  });

  it('does not ground non-numeric clauses', () => {
    // Proposal §5.1 scopes grounding to numeric bounds. An enum value carries
    // no invented-figure risk: it either maps to a profile field or it does not.
    const tree: RuleNode = { field: 'category', op: 'in', values: ['sc', 'st'] };
    const result = groundRuleTree(tree, prose);

    expect(result.tree).toEqual(tree);
    expect(result.needsReview).toBe(false);
  });

  it('preserves an existing wildcard and flags the scheme for review', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { field: 'age', op: 'gte', value: 18 },
        { op: 'WILDCARD', sourceText: 'must not be a tax payer', reason: 'unmodellable' },
      ],
    };

    const result = groundRuleTree(tree, prose);

    expect(wildcardsIn(result.tree)).toHaveLength(1);
    expect(wildcardsIn(result.tree)[0]?.reason).toBe('unmodellable');
    expect(result.needsReview).toBe(true);
  });

  it('grounds clauses nested inside OR and NOT', () => {
    const tree: RuleNode = {
      op: 'OR',
      clauses: [
        { op: 'NOT', clause: { field: 'age', op: 'gt', value: 99 } },
        { field: 'annualIncome', op: 'lte', value: 250000 },
      ],
    };

    const result = groundRuleTree(tree, prose);

    expect(result.ungroundedValues).toEqual([99]);
    expect(wildcardsIn(result.tree)).toHaveLength(1);
  });
});
