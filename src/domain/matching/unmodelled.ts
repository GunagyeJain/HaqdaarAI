import type { RuleNode } from '../rules/types';

/**
 * The criteria we deliberately refuse to model, in the government's own words.
 *
 * Around 60% of clauses in this corpus are WILDCARD -- membership of a welfare
 * board, attendance percentages, possession of a driving licence. A wildcard is
 * UNKNOWN forever, so most schemes cannot reach PASS however much a citizen
 * answers, and simply saying "we cannot tell" leaves them with nothing to do.
 *
 * This is the list of things a human has to check, and it is the most useful
 * thing on a result card. It turns UNKNOWN from a shrug into an instruction,
 * which is what invariant 6 was always for.
 *
 * De-duplicated because one criterion is often stated twice in the prose
 * (audit finding F7), and a checklist that repeats itself reads as a bug.
 */
export function unmodelledCriteria(tree: RuleNode): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (node: RuleNode): void => {
    if (node.op === 'AND' || node.op === 'OR') {
      node.clauses.forEach(walk);
      return;
    }
    if (node.op === 'NOT') {
      walk(node.clause);
      return;
    }
    if (node.op === 'WILDCARD') {
      if (seen.has(node.sourceText)) return;
      seen.add(node.sourceText);
      found.push(node.sourceText);
    }
  };

  walk(tree);
  return found;
}
