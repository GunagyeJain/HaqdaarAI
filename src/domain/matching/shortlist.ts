import type { MatchResult, MatchResultItem } from './types';

/**
 * Three groups, replacing the verdict buckets on the results page.
 *
 * THE REFRAMING THIS EXISTS FOR: around 60% of corpus clauses are WILDCARD, and
 * a wildcard is UNKNOWN forever, so most schemes structurally cannot reach PASS
 * no matter what a citizen answers. A page leading with "you qualify for N"
 * therefore leads with a number that is almost always zero -- accurate, and
 * useless. Worse, it reads as a rejection of the person rather than a limit of
 * the tool.
 *
 * The shortlist is the honest equivalent: everything we could check has passed,
 * and what is left is for a human to verify. That is as close to a yes as this
 * engine can get, and unlike a zero it is something a citizen can act on.
 *
 * Every scheme lands in exactly one group. Nothing is dropped, and the counts
 * still add up to the corpus.
 */
export interface Partitioned {
  /** Nothing left that we could decide. Lead with these. */
  shortlist: MatchResultItem[];
  /** Still resolvable by asking the citizen something. */
  needsAnswers: MatchResultItem[];
  /** Ruled out by something they told us. */
  ineligible: MatchResultItem[];
}

export function partition(result: MatchResult): Partitioned {
  return {
    // PASS first: an outright yes outranks a probably.
    shortlist: [
      ...result.pass,
      ...result.unknown.filter((item) => item.unknownFields.length === 0),
    ],
    needsAnswers: result.unknown.filter((item) => item.unknownFields.length > 0),
    ineligible: result.fail,
  };
}
