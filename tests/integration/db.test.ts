import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '@/db';

const db = getDb();

afterAll(async () => {
  // postgres-js keeps the pool open; close it so vitest can exit.
  await db.$client.end({ timeout: 5 });
});

describe('database', () => {
  it('is reachable', async () => {
    const result = await db.execute(sql`select 1 as ok`);
    expect(result[0]).toMatchObject({ ok: 1 });
  });

  it('has the schemes table from migrations', async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name = 'schemes'
    `);
    expect(rows).toHaveLength(1);
  });

  it('indexes the eligibility column with GIN (ADR-007)', async () => {
    const rows = await db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes
      where tablename = 'schemes' and indexname = 'schemes_eligibility_gin'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('gin');
    expect(rows[0]?.indexdef).toContain('jsonb_path_ops');
  });

  it('can round-trip a scheme, preserving typed JSONB and source prose', async () => {
    const prose = 'Applicant must be between 18 and 40 years of age.';

    const [inserted] = await db
      .insert(schema.schemes)
      .values({
        slug: `test-${crypto.randomUUID()}`,
        name: { en: 'Test Scheme' },
        summary: { en: 'A scheme used only by the integration suite.' },
        eligibility: { op: 'AND', clauses: [] },
        sourceProse: prose,
        sourceUrl: 'https://www.myscheme.gov.in/schemes/test',
      })
      .returning();

    expect(inserted?.eligibility.op).toBe('AND');
    // INVARIANT 4: the prose a rule came from is never lost.
    expect(inserted?.sourceProse).toBe(prose);
    expect(inserted?.needsReview).toBe(false);

    if (inserted) {
      await db.delete(schema.schemes).where(sql`id = ${inserted.id}`);
    }
  });
});
