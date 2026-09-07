import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, schema } from '@/db';
import { matchProfile } from '@/domain/matching/match';
import type { RuleNode } from '@/domain/rules/types';

/**
 * The API tier's single entry point into the matcher: one stateless query, then
 * shaping for display. Verdict correctness is covered by the differential test;
 * this covers grouping, ordering, and localisation.
 */

const db = getDb();
const SLUG_PREFIX = 'shapetest-';

const rule = (node: RuleNode) => node as unknown as { op: string };

beforeAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);

  await db.insert(schema.schemes).values([
    {
      slug: `${SLUG_PREFIX}passes`,
      name: { en: 'Passing Scheme', hi: 'पास योजना' },
      summary: { en: 'Everyone aged 18+ qualifies.', hi: '18+ सभी पात्र।' },
      ministry: 'Ministry of Testing',
      eligibility: rule({ op: 'AND', clauses: [{ field: 'age', op: 'gte', value: 18 }] }),
      sourceProse: 'The applicant must be at least 18 years.',
      sourceUrl: 'https://www.myscheme.gov.in/schemes/passes',
    },
    {
      slug: `${SLUG_PREFIX}fails`,
      name: { en: 'Failing Scheme' },
      summary: { en: 'Under-18s only.' },
      eligibility: rule({ op: 'AND', clauses: [{ field: 'age', op: 'lt', value: 18 }] }),
      sourceProse: 'The applicant must be below 18 years.',
      sourceUrl: 'https://www.myscheme.gov.in/schemes/fails',
    },
    {
      slug: `${SLUG_PREFIX}unknown-near`,
      name: { en: 'Nearly Decided Scheme' },
      summary: { en: 'One field missing.' },
      eligibility: rule({
        op: 'AND',
        clauses: [
          { field: 'age', op: 'gte', value: 18 },
          { field: 'annualIncome', op: 'lte', value: 250000 },
        ],
      }),
      sourceProse: 'At least 18 years and income up to 250000.',
      sourceUrl: 'https://www.myscheme.gov.in/schemes/unknown-near',
    },
    {
      slug: `${SLUG_PREFIX}unknown-far`,
      name: { en: 'Far From Decided Scheme' },
      summary: { en: 'Several fields missing.' },
      eligibility: rule({
        op: 'AND',
        clauses: [
          { field: 'age', op: 'gte', value: 18 },
          { field: 'annualIncome', op: 'lte', value: 250000 },
          { field: 'category', op: 'in', values: ['sc', 'st'] },
          { field: 'residence', op: 'eq', value: 'rural' },
        ],
      }),
      sourceProse: 'At least 18 years, income up to 250000, SC/ST, rural.',
      sourceUrl: 'https://www.myscheme.gov.in/schemes/unknown-far',
      needsReview: true,
    },
  ]);
});

afterAll(async () => {
  await db.delete(schema.schemes).where(sql`slug like ${SLUG_PREFIX + '%'}`);
  await db.$client.end({ timeout: 5 });
});

const only = <T extends { scheme: { slug: string } }>(items: T[]): T[] =>
  items.filter((item) => item.scheme.slug.startsWith(SLUG_PREFIX));

describe('matchProfile', () => {
  it('groups results by verdict', async () => {
    const result = await matchProfile({ age: 30 }, 'en');

    expect(only(result.pass).map((i) => i.scheme.slug)).toEqual([`${SLUG_PREFIX}passes`]);
    expect(only(result.fail).map((i) => i.scheme.slug)).toEqual([`${SLUG_PREFIX}fails`]);
    expect(only(result.unknown)).toHaveLength(2);
  });

  it('orders undecided schemes by how close they are to being decided', async () => {
    // The scheme needing one more answer is more actionable than the one
    // needing four, so it belongs at the top of the citizen's list.
    const result = await matchProfile({ age: 30 }, 'en');
    const slugs = only(result.unknown).map((i) => i.scheme.slug);

    expect(slugs).toEqual([`${SLUG_PREFIX}unknown-near`, `${SLUG_PREFIX}unknown-far`]);
  });

  it('carries the reasoning behind every verdict', async () => {
    const result = await matchProfile({ age: 30 }, 'en');
    const passing = only(result.pass)[0];

    expect(passing?.matchedClauses).toContainEqual({ field: 'age', op: 'gte', value: 18 });
    expect(passing?.failedClauses).toEqual([]);
  });

  it('reports which fields would resolve an undecided scheme', async () => {
    const result = await matchProfile({ age: 30 }, 'en');
    const near = only(result.unknown).find((i) => i.scheme.slug.endsWith('unknown-near'));

    expect(near?.unknownFields).toEqual(['annualIncome']);
  });

  it('carries source prose so any verdict can be audited (invariant 4)', async () => {
    const result = await matchProfile({ age: 30 }, 'en');
    const failing = only(result.fail)[0];

    expect(failing?.scheme.sourceProse).toContain('below 18 years');
    expect(failing?.scheme.sourceUrl).toContain('myscheme.gov.in');
  });

  it('returns localized text when a translation exists', async () => {
    const result = await matchProfile({ age: 30 }, 'hi');
    const passing = only(result.pass)[0];

    expect(passing?.scheme.name).toBe('पास योजना');
  });

  it('falls back to English when a translation is missing', async () => {
    // Most scraped schemes have English text only; a missing translation must
    // never render as an empty card.
    const result = await matchProfile({ age: 30 }, 'ta');
    const passing = only(result.pass)[0];

    expect(passing?.scheme.name).toBe('Passing Scheme');
  });

  it('counts every scheme in the corpus', async () => {
    const result = await matchProfile({ age: 30 }, 'en');
    const { counts } = result;

    expect(counts.total).toBe(counts.pass + counts.unknown + counts.fail);
    expect(counts.total).toBeGreaterThanOrEqual(4);
  });

  it('returns everything as UNKNOWN for an empty profile, never FAIL', async () => {
    // INVARIANT 6: absence of information is not disqualification.
    const result = await matchProfile({}, 'en');
    expect(only(result.fail)).toEqual([]);
    expect(only(result.unknown)).toHaveLength(4);
  });
});
