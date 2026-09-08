import { eq } from 'drizzle-orm';
import { config as loadEnv } from 'dotenv';
import { getDb, schema } from '../src/db';
import { synthesizeRuleTree } from '../src/domain/corpus/clauses';
import { groundRuleTree } from '../src/domain/corpus/grounding';
import { canonicalJson } from '../src/domain/rules/canonical';
import type { RuleNode } from '../src/domain/rules/types';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

/**
 * Re-derives every scheme's rule tree from its stored source prose.
 *
 * This exists because of invariant 4. Keeping the government's own wording
 * alongside each rule was justified as an audit trail, and it turns out to pay
 * a second dividend: when clause synthesis improves, the whole corpus can be
 * rebuilt offline in seconds instead of re-scraping for half an hour. The
 * prose is the source of truth; the rule tree is a derived artefact.
 *
 * The state restriction is rebuilt from the stored `state` column rather than
 * the prose, because it came from myscheme's structured facet in the first
 * place.
 */
async function main(): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(schema.schemes);

  let changed = 0;
  let clausesBefore = 0;
  let clausesAfter = 0;

  const countLeaves = (node: RuleNode): number => {
    if (node.op === 'AND' || node.op === 'OR') {
      return node.clauses.reduce((total, clause) => total + countLeaves(clause), 0);
    }
    if (node.op === 'NOT') return countLeaves(node.clause);
    return node.op === 'WILDCARD' ? 0 : 1;
  };

  for (const row of rows) {
    const before = row.eligibility as unknown as RuleNode;
    clausesBefore += countLeaves(before);

    const fromProse = synthesizeRuleTree(row.sourceProse);
    const proseClauses = fromProse.op === 'AND' ? fromProse.clauses : [fromProse];

    const combined: RuleNode = {
      op: 'AND',
      clauses: row.state
        ? [{ field: 'state', op: 'in', values: [row.state] }, ...proseClauses]
        : proseClauses,
    };

    const grounded = groundRuleTree(combined, row.sourceProse);
    clausesAfter += countLeaves(grounded.tree);

    const nextJson = canonicalJson(grounded.tree);
    if (nextJson === canonicalJson(before)) continue;

    await db
      .update(schema.schemes)
      .set({
        eligibility: grounded.tree as unknown as { op: string },
        needsReview: grounded.needsReview,
      })
      .where(eq(schema.schemes.id, row.id));

    changed += 1;
  }

  console.log(`Re-normalized ${rows.length} schemes.`);
  console.log(`  rule trees changed      : ${changed}`);
  console.log(`  modelled clauses before : ${clausesBefore}`);
  console.log(`  modelled clauses after  : ${clausesAfter}`);

  await db.$client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
