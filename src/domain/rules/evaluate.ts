import type {
  EvaluationResult,
  LeafClause,
  Profile,
  ProfileField,
  RuleNode,
  Verdict,
  WildcardClause,
} from './types';

/**
 * Kleene three-valued logic. `null` is UNKNOWN.
 *
 * This is the TypeScript reference implementation of the semantics specified in
 * docs/DATA-MODEL.md §3. match_schemes() implements the same semantics in SQL,
 * and a differential test asserts the two agree on every fixture. Two
 * independent implementations disagreeing is the cheapest way to catch a subtle
 * error in either -- and three-valued logic is exactly the kind of thing that
 * looks right and is not.
 */
type Ternary = boolean | null;

/** UNKNOWN when the profile lacks the field this clause tests. */
function evaluateLeaf(clause: LeafClause, profile: Profile): Ternary {
  const actual = profile[clause.field];

  // `false` and `0` are real answers, so test for absence specifically.
  if (actual === undefined || actual === null) return null;

  switch (clause.op) {
    case 'eq':
      return actual === clause.value;
    case 'neq':
      return actual !== clause.value;

    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
    case 'between': {
      // A numeric operator against a non-numeric field means the rule tree is
      // malformed -- schema validation should have rejected it. Degrade to
      // UNKNOWN rather than throwing: one bad rule must not deny a citizen
      // every other scheme in the corpus.
      if (typeof actual !== 'number') return null;

      switch (clause.op) {
        case 'lt':
          return actual < clause.value;
        case 'lte':
          return actual <= clause.value;
        case 'gt':
          return actual > clause.value;
        case 'gte':
          return actual >= clause.value;
        case 'between':
          return actual >= clause.min && actual <= clause.max;
      }
    }

    case 'in':
      return clause.values.includes(actual);
    case 'not_in':
      return !clause.values.includes(actual);
  }
}

function evaluateNode(node: RuleNode, profile: Profile): Ternary {
  switch (node.op) {
    case 'AND': {
      let sawUnknown = false;
      for (const clause of node.clauses) {
        const result = evaluateNode(clause, profile);
        // One disqualifying answer decides the scheme, even with fields missing.
        if (result === false) return false;
        if (result === null) sawUnknown = true;
      }
      return sawUnknown ? null : true;
    }

    case 'OR': {
      let sawUnknown = false;
      for (const clause of node.clauses) {
        const result = evaluateNode(clause, profile);
        // Mirror of the AND case: one qualifying answer is enough.
        if (result === true) return true;
        if (result === null) sawUnknown = true;
      }
      return sawUnknown ? null : false;
    }

    case 'NOT': {
      const result = evaluateNode(node.clause, profile);
      return result === null ? null : !result;
    }

    // INVARIANT 6: we genuinely cannot decide this, and say so.
    case 'WILDCARD':
      return null;

    default:
      return evaluateLeaf(node, profile);
  }
}

/** Flattens the tree to its leaf and wildcard clauses, in document order. */
function collectLeaves(node: RuleNode, out: Array<LeafClause | WildcardClause>): void {
  switch (node.op) {
    case 'AND':
    case 'OR':
      for (const clause of node.clauses) collectLeaves(clause, out);
      return;
    case 'NOT':
      collectLeaves(node.clause, out);
      return;
    default:
      out.push(node);
  }
}

function toVerdict(value: Ternary): Verdict {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  return 'UNKNOWN';
}

/**
 * Evaluates a rule tree against a profile, returning both the verdict and the
 * reasoning behind it.
 *
 * The reasoning is what powers the self-explaining result cards and the
 * information-gain next-question engine. Note that `matchedClauses` and
 * `failedClauses` are per-clause facts, not causal attribution: a clause inside
 * a satisfied OR may read as failed while the scheme still passes.
 */
export function evaluate(rule: RuleNode, profile: Profile): EvaluationResult {
  const verdict = toVerdict(evaluateNode(rule, profile));

  const leaves: Array<LeafClause | WildcardClause> = [];
  collectLeaves(rule, leaves);

  const matchedClauses: LeafClause[] = [];
  const failedClauses: LeafClause[] = [];
  const unknownFields = new Set<ProfileField>();

  for (const leaf of leaves) {
    // A wildcard names no field, so there is no question that would resolve it.
    if (leaf.op === 'WILDCARD') continue;

    const result = evaluateLeaf(leaf, profile);
    if (result === true) matchedClauses.push(leaf);
    else if (result === false) failedClauses.push(leaf);
    else unknownFields.add(leaf.field);
  }

  return { verdict, matchedClauses, failedClauses, unknownFields: [...unknownFields] };
}
