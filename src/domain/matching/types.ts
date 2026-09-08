import type { LeafClause, ProfileField, Verdict } from '../rules/types';

/**
 * One row of `match_schemes()`, in TypeScript terms.
 *
 * The reasoning travels with the verdict deliberately: it is what lets a result
 * card explain itself to a citizen, and what feeds the next-question engine
 * without a second round-trip.
 */
export interface MatchedScheme {
  schemeId: string;
  verdict: Verdict;
  /** Clauses that evaluated TRUE — why they qualify. */
  matchedClauses: LeafClause[];
  /** Clauses that evaluated FALSE — why they do not. */
  failedClauses: LeafClause[];
  /** Fields whose absence left a clause undecided — what to ask next. */
  unknownFields: ProfileField[];
}

/** A scheme's stored metadata, joined onto its verdict for display. */
export interface SchemeSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  ministry: string | null;
  state: string | null;
  sourceProse: string;
  sourceUrl: string;
  needsReview: boolean;
}

export interface MatchResultItem extends MatchedScheme {
  scheme: SchemeSummary;
  /**
   * The criteria we refuse to model, in the government's own words -- what a
   * human still has to check. Empty for a fully modelled scheme.
   *
   * Extracted server-side from the rule tree. The tree itself never reaches the
   * client; only these strings do.
   */
  unmodelledCriteria: string[];
}

export interface MatchResult {
  /** Grouped for display; UNKNOWN is a first-class outcome, not an error bucket. */
  pass: MatchResultItem[];
  unknown: MatchResultItem[];
  fail: MatchResultItem[];
  counts: { pass: number; unknown: number; fail: number; total: number };
}
