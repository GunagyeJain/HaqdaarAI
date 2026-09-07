import { sql } from 'drizzle-orm';
import { getDb } from '../../db';
import type { LeafClause, Profile, ProfileField, Verdict } from '../rules/types';
import type { MatchResult, MatchResultItem } from './types';

/**
 * The API tier's single entry point into the matcher.
 *
 * One stateless query evaluates the whole corpus (proposal §7), then the rows
 * are shaped for display. No eligibility decision happens here — that all
 * belongs to `match_schemes()` in SQL.
 */

type Localized = Record<string, string> | null;

// A type alias, not an interface: drizzle's execute<T> requires an index
// signature, which interface declarations do not provide.
type MatchRow = {
  scheme_id: string;
  verdict: Verdict;
  matched_clauses: LeafClause[];
  failed_clauses: LeafClause[];
  unknown_fields: ProfileField[];
  slug: string;
  name: Localized;
  summary: Localized;
  ministry: string | null;
  state: string | null;
  source_prose: string;
  source_url: string;
  needs_review: boolean;
};

/**
 * Most scraped schemes carry English text only, so a missing translation falls
 * back rather than rendering an empty card.
 */
function localize(value: Localized, locale: string): string {
  if (!value) return '';
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? '';
}

function toItem(row: MatchRow, locale: string): MatchResultItem {
  return {
    schemeId: row.scheme_id,
    verdict: row.verdict,
    matchedClauses: row.matched_clauses ?? [],
    failedClauses: row.failed_clauses ?? [],
    unknownFields: row.unknown_fields ?? [],
    scheme: {
      id: row.scheme_id,
      slug: row.slug,
      name: localize(row.name, locale),
      summary: localize(row.summary, locale),
      ministry: row.ministry,
      state: row.state,
      sourceProse: row.source_prose,
      sourceUrl: row.source_url,
      needsReview: row.needs_review,
    },
  };
}

export async function matchProfile(profile: Profile, locale: string): Promise<MatchResult> {
  const db = getDb();

  const rows = await db.execute<MatchRow>(sql`
    select
      m.scheme_id, m.verdict, m.matched_clauses, m.failed_clauses, m.unknown_fields,
      s.slug, s.name, s.summary, s.ministry, s.state,
      s.source_prose, s.source_url, s.needs_review
    from match_schemes(${JSON.stringify(profile)}::jsonb) m
    join schemes s on s.id = m.scheme_id
  `);

  const pass: MatchResultItem[] = [];
  const unknown: MatchResultItem[] = [];
  const fail: MatchResultItem[] = [];

  for (const row of rows) {
    const item = toItem(row, locale);
    if (item.verdict === 'PASS') pass.push(item);
    else if (item.verdict === 'FAIL') fail.push(item);
    else unknown.push(item);
  }

  // Closest-to-decided first: a scheme needing one more answer is far more
  // actionable to a citizen than one needing four.
  unknown.sort((a, b) => a.unknownFields.length - b.unknownFields.length);

  // Within PASS and FAIL, show the best-evidenced first.
  pass.sort((a, b) => b.matchedClauses.length - a.matchedClauses.length);
  fail.sort((a, b) => a.failedClauses.length - b.failedClauses.length);

  return {
    pass,
    unknown,
    fail,
    counts: {
      pass: pass.length,
      unknown: unknown.length,
      fail: fail.length,
      total: rows.length,
    },
  };
}
