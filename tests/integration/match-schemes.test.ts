import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '@/db';
import { evaluate } from '@/domain/rules/evaluate';
import type { LeafClause, RuleNode, Verdict } from '@/domain/rules/types';
import { profileCases, ruleCases } from '@tests/fixtures/rule-cases';

/**
 * DIFFERENTIAL TEST -- the load-bearing test of this project.
 *
 * Kleene three-valued logic is implemented twice: once in TypeScript
 * (src/domain/rules/evaluate.ts) and once in PL/pgSQL (match_schemes). Two
 * independent implementations disagreeing is the cheapest way to catch a subtle
 * error in either, and three-valued logic is exactly the kind of thing that
 * looks right and is not.
 *
 * Every rule fixture is evaluated against every profile fixture in both
 * implementations. They must agree on the verdict AND on the reasoning.
 */

const db = getDb();
const SLUG_PREFIX = 'difftest-';

type MatchRow = {
  scheme_id: string;
  verdict: Verdict;
  matched_clauses: LeafClause[];
  failed_clauses: LeafClause[];
  unknown_fields: string[];
};

/** Stable identity for a clause, robust to jsonb key reordering. */
const clauseKey = (clause: LeafClause) => `${clause.field}:${clause.op}`;

const idByRuleName = new Map<string, string>();

beforeAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);

  for (const { name, rule } of ruleCases) {
    const [row] = await db
      .insert(schema.schemes)
      .values({
        slug: `${SLUG_PREFIX}${name}`,
        name: { en: name },
        summary: { en: `Differential fixture: ${name}` },
        eligibility: rule as unknown as { op: string },
        sourceProse: `Fixture rule for ${name}.`,
        sourceUrl: 'https://www.myscheme.gov.in/',
      })
      .returning();

    if (row) idByRuleName.set(name, row.id);
  }
});

afterAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);
  await db.$client.end({ timeout: 5 });
});

async function matchInSql(profile: object): Promise<Map<string, MatchRow>> {
  const rows = await db.execute<MatchRow>(
    sql`select * from match_schemes(${JSON.stringify(profile)}::jsonb)`,
  );
  return new Map(rows.map((row) => [row.scheme_id, row]));
}

describe('match_schemes() agrees with the TypeScript evaluator', () => {
  for (const { name: profileName, profile } of profileCases) {
    it(`profile: ${profileName}`, async () => {
      const sqlRows = await matchInSql(profile);

      for (const { name: ruleName, rule } of ruleCases) {
        const schemeId = idByRuleName.get(ruleName);
        expect(schemeId, `scheme inserted for ${ruleName}`).toBeDefined();

        const sqlRow = sqlRows.get(schemeId!);
        expect(sqlRow, `SQL returned a row for ${ruleName}`).toBeDefined();

        const expected = evaluate(rule as RuleNode, profile);
        const where = `rule=${ruleName} profile=${profileName}`;

        expect(sqlRow!.verdict, `verdict mismatch: ${where}`).toBe(expected.verdict);

        expect(
          [...sqlRow!.unknown_fields].sort(),
          `unknown_fields mismatch: ${where}`,
        ).toEqual(expected.unknownFields.map(String).sort());

        expect(
          sqlRow!.matched_clauses.map(clauseKey).sort(),
          `matched_clauses mismatch: ${where}`,
        ).toEqual(expected.matchedClauses.map(clauseKey).sort());

        expect(
          sqlRow!.failed_clauses.map(clauseKey).sort(),
          `failed_clauses mismatch: ${where}`,
        ).toEqual(expected.failedClauses.map(clauseKey).sort());
      }
    });
  }
});

describe('match_schemes() contract', () => {
  it('returns one row per scheme, including schemes with no leaf clauses', async () => {
    const rows = await matchInSql({ age: 30 });
    // empty-and and empty-or have zero leaves and must not be dropped.
    expect(rows.get(idByRuleName.get('empty-and')!)?.verdict).toBe('PASS');
    expect(rows.get(idByRuleName.get('empty-or')!)?.verdict).toBe('FAIL');
  });

  it('treats an absent profile field as UNKNOWN, never as FAIL', async () => {
    const rows = await matchInSql({});
    expect(rows.get(idByRuleName.get('eq-string')!)?.verdict).toBe('UNKNOWN');
    expect(rows.get(idByRuleName.get('between')!)?.verdict).toBe('UNKNOWN');
  });

  it('holds a wildcard at UNKNOWN however complete the profile', async () => {
    const rows = await matchInSql(profileCases.find((p) => p.name === 'rural-sc-farmer')!.profile);
    expect(rows.get(idByRuleName.get('wildcard-only')!)?.verdict).toBe('UNKNOWN');
  });
});
