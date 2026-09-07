import type { LeafClause, RuleNode, WildcardClause } from '../rules/types';
import { extractNumbers } from './numerals';

/**
 * PROSE GROUNDING -- the correctness gate of the scraper.
 *
 * Proposal §5.1: ground every scraped numeric bound back against the source
 * prose before insertion, so no invented figure can silently exclude an
 * eligible citizen.
 *
 * A bound that cannot be located in the prose is never stored as a rule. It
 * becomes a WILDCARD, which evaluates to UNKNOWN forever -- the honest answer,
 * and one that keeps the scheme in front of the citizen instead of silently
 * disqualifying them on a number nobody can verify.
 *
 * Matching is exact, never fuzzy. An approximate bound is an invented bound.
 */

export interface GroundingResult {
  /** The tree with every ungrounded numeric clause replaced by a WILDCARD. */
  tree: RuleNode;
  /** Bounds that could not be located, for the run summary. */
  ungroundedValues: number[];
  /** True when the tree contains any WILDCARD, however it got there. */
  needsReview: boolean;
}

/** True when `value` appears in `prose` in any recognised surface form. */
export function isGrounded(value: number, prose: string): boolean {
  return extractNumbers(prose).includes(value);
}

/** The numeric bounds a clause asserts. Non-numeric clauses assert none. */
function boundsOf(clause: LeafClause): number[] {
  switch (clause.op) {
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return [clause.value];
    case 'between':
      return [clause.min, clause.max];
    default:
      // Grounding is scoped to numeric bounds. An enum or boolean value carries
      // no invented-figure risk: it either maps to a profile field or it does not.
      return [];
  }
}

/** Human-readable rendering of a rejected clause, for the reviewer. */
function describe(clause: LeafClause): string {
  switch (clause.op) {
    case 'between':
      return `${clause.field} between ${clause.min} and ${clause.max}`;
    case 'in':
    case 'not_in':
      return `${clause.field} ${clause.op} [${clause.values.join(', ')}]`;
    default:
      return `${clause.field} ${clause.op} ${String(clause.value)}`;
  }
}

export function groundRuleTree(tree: RuleNode, prose: string): GroundingResult {
  const available = extractNumbers(prose);
  const ungroundedValues: number[] = [];
  let sawWildcard = false;

  const walk = (node: RuleNode): RuleNode => {
    switch (node.op) {
      case 'AND':
        return { op: 'AND', clauses: node.clauses.map(walk) };
      case 'OR':
        return { op: 'OR', clauses: node.clauses.map(walk) };
      case 'NOT':
        return { op: 'NOT', clause: walk(node.clause) };
      case 'WILDCARD':
        sawWildcard = true;
        return node;
    }

    const missing = boundsOf(node).filter((bound) => !available.includes(bound));
    if (missing.length === 0) return node;

    ungroundedValues.push(...missing);
    sawWildcard = true;

    const replacement: WildcardClause = {
      op: 'WILDCARD',
      // Records the assertion we refused to make, so a reviewer can see exactly
      // what the synthesiser wanted and judge it against the prose beside it.
      sourceText: `Ungrounded bound discarded: ${describe(node)} (not found in source prose)`,
      reason: 'ungrounded',
    };
    return replacement;
  };

  return { tree: walk(tree), ungroundedValues, needsReview: sawWildcard };
}
